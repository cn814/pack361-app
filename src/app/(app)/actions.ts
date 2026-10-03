"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { sendPushTo, sendPushToAll } from "@/lib/push";
import { packEmailConfigured, sendBulk } from "@/lib/bulk-email";
import { denAudience, eventAudience } from "@/lib/audience";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAdmins } from "@/lib/notify";
import { APP_URL } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";
import { isLeader, requireMember } from "@/lib/data";

export type PostState = { ok?: boolean; error?: string };

export async function postAnnouncement(_prev: PostState, form: FormData): Promise<PostState> {
  const me = await requireMember();
  if (!isLeader(me)) return { error: "Only leaders can post." };
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const denId = String(form.get("den_id") ?? "");
  const eventId = String(form.get("event_id") ?? "");
  const eventMsg = /^[0-9a-f-]{36}$/i.test(eventId) ? eventId : null;
  const den = !eventMsg && /^[0-9a-f-]{36}$/i.test(denId) ? denId : null;
  const category = String(form.get("category") ?? (den ? "Den" : "General"));
  const email = form.getAll("email").includes("on") && (den !== null || eventMsg !== null || packEmailConfigured());
  if (!title || !body) return { error: "Add a title and a message." };
  if (eventMsg) return postEventMessage(me, eventMsg, title, body, form.getAll("notify").includes("on"), email, form.get("maybe") === "on");
  const supabase = await createClient();
  // RLS: den leaders can only message the dens they lead; committee members any den.
  const { data: post, error } = await supabase
    .from("announcements")
    .insert({
      author_id: me.id,
      title: title.slice(0, 140),
      body: body.slice(0, 4000),
      category,
      den_id: den,
      is_pinned: !den && form.get("pinned") === "on",
    })
    .select("id, den:dens(name)")
    .single();
  if (error || !post) return { error: den ? "Couldn't send that. You can only message dens you lead." : "Couldn't post. Try again." };
  const denName = (post.den as unknown as { name: string } | null)?.name ?? null;
  const notify = form.getAll("notify").includes("on");
  if (den && (notify || email)) {
    after(async () => {
      const people = (await denAudience(den)).filter((p) => p.id !== me.id);
      if (notify) {
        await sendPushTo(
          people.map((p) => p.id),
          { title: `${denName}: ${title.slice(0, 80)}`, body: body.slice(0, 180), url: "/inbox", tag: `den-${den}` },
        );
      }
      if (email && people.length) {
        const from = `${me.preferred_name || me.first_name} ${me.last_name}`;
        const r = await sendBulk(
          people.map((p) => ({ email: p.email, name: `${p.preferred_name || p.first_name}` })),
          {
            subject: `${denName}: ${title.slice(0, 100)}`,
            replyTo: me.email,
            paragraphs: [`Hi ${denName} families,`, body, `From ${from}, ${denName}. Reply to this email to reach them.`, `${APP_URL}/inbox`],
          },
        );
        await createAdminClient().from("announcements").update({ emailed_count: r.sent }).eq("id", post.id);
      }
    });
  } else if (!den && (notify || email)) {
    after(async () => {
      if (notify) {
        await sendPushToAll({ title: `Pack 361: ${title.slice(0, 80)}`, body: body.slice(0, 180), url: "/inbox", tag: "announcement" }, me.id);
      }
      // Pack-wide email: every active adult on the roster, through Brevo.
      if (email && packEmailConfigured()) {
        const { data } = await createAdminClient().from("adults").select("id, email, first_name, preferred_name").eq("is_active", true);
        const people = (data ?? []) as { id: string; email: string; first_name: string; preferred_name: string | null }[];
        const from = `${me.preferred_name || me.first_name} ${me.last_name}`;
        const r = await sendBulk(
          people.filter((p) => p.id !== me.id).map((p) => ({ email: p.email, name: p.preferred_name || p.first_name })),
          {
            subject: `Pack 361: ${title.slice(0, 100)}`,
            replyTo: me.email,
            paragraphs: ["Hi Pack 361 families,", body, `From ${from}. Reply to this email to reach them.`, `${APP_URL}/inbox`],
          },
        );
        await createAdminClient().from("announcements").update({ emailed_count: r.sent }).eq("id", post.id);
      }
    });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * A message to the families going to an event (RSVP yes, and maybe if ticked): a phone alert
 * and optional email to them. It's also posted in the app's news, linked to the event, so
 * anyone looking can see the change.
 */
async function postEventMessage(
  me: Awaited<ReturnType<typeof requireMember>>,
  eventId: string,
  title: string,
  body: string,
  notify: boolean,
  email: boolean,
  withMaybe: boolean,
): Promise<PostState> {
  const supabase = await createClient();
  const { data: ev } = await supabase.from("events").select("id, title, category").eq("id", eventId).maybeSingle();
  if (!ev) return { error: "That event wasn't found." };
  const { data: post, error } = await supabase
    .from("announcements")
    .insert({ author_id: me.id, title: title.slice(0, 140), body: body.slice(0, 4000), category: "General", event_id: eventId, is_pinned: false })
    .select("id")
    .single();
  if (error || !post) return { error: "Couldn't send that. Try again." };
  const eventTitle = String(ev.title).slice(0, 60);
  const url = ev.category === "Campout" ? `/campouts/${eventId}` : `/events/${eventId}`;
  after(async () => {
    const people = (await eventAudience(eventId, withMaybe)).filter((p) => p.id !== me.id);
    if (notify && people.length) {
      await sendPushTo(
        people.map((p) => p.id),
        { title: `${eventTitle}: ${title.slice(0, 80)}`, body: body.slice(0, 180), url, tag: `event-${eventId}` },
      );
    }
    if (email && people.length) {
      const from = `${me.preferred_name || me.first_name} ${me.last_name}`;
      const r = await sendBulk(
        people.map((p) => ({ email: p.email, name: p.preferred_name || p.first_name })),
        {
          subject: `${eventTitle}: ${title.slice(0, 100)}`,
          replyTo: me.email,
          paragraphs: [`Hi ${eventTitle} families,`, body, `From ${from}. Reply to this email to reach them.`, `${APP_URL}${url}`],
        },
      );
      await createAdminClient().from("announcements").update({ emailed_count: r.sent }).eq("id", post.id);
    }
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteAnnouncement(form: FormData) {
  await requireMember();
  const supabase = await createClient();
  await supabase.from("announcements").delete().eq("id", String(form.get("id")));
  revalidatePath("/", "layout");
}

export async function updateMyContact(_prev: PostState, form: FormData): Promise<PostState> {
  const me = await requireMember();
  const phone = String(form.get("phone") ?? "").trim().slice(0, 40) || null;
  const preferred = String(form.get("preferred_name") ?? "").trim().slice(0, 40) || null;
  const supabase = await createClient();
  const { error } = await supabase.from("adults").update({ phone, preferred_name: preferred }).eq("id", me.id);
  if (error) return { error: "Couldn't save." };
  revalidatePath("/family");
  return { ok: true };
}

/** A family answers "may this scout appear in pack photos?" (RLS: own scouts only). */
export async function setPhotoPermission(form: FormData) {
  await requireMember();
  const scoutId = String(form.get("scout_id") ?? "");
  const answer = String(form.get("answer") ?? "");
  if (answer !== "yes" && answer !== "no") return;
  const supabase = await createClient();
  await supabase.from("scouts").update({ photo_permission: answer }).eq("id", scoutId);
  revalidatePath("/family");
  revalidatePath("/");
}

const FEEDBACK_KINDS = { problem: "Problem", idea: "Idea", question: "Question", other: "Note" } as const;

/** "Report a problem or send a note": saved in the app and sent to the pack admins. */
export async function sendFeedback(_prev: PostState & { message?: string }, form: FormData): Promise<PostState & { message?: string }> {
  const me = await requireMember();
  const kind = String(form.get("kind") ?? "problem") as keyof typeof FEEDBACK_KINDS;
  const message = String(form.get("message") ?? "").trim().slice(0, 4000);
  const page = String(form.get("page") ?? "").slice(0, 200) || null;
  if (!FEEDBACK_KINDS[kind]) return { error: "Pick what kind of note this is." };
  if (!message) return { error: "Write a message first." };
  const supabase = await createClient();
  const { error } = await supabase.from("feedback").insert({ adult_id: me.id, kind, message, page });
  if (error) return { error: /lot of messages/i.test(error.message) ? error.message : "Couldn't send that. Try again, or email info@pack361.org." };
  const who = `${me.preferred_name || me.first_name} ${me.last_name}`;
  after(async () => {
    await notifyAdmins(
      { title: `${FEEDBACK_KINDS[kind]} from ${who}`, body: message.slice(0, 160), url: "/admin/messages", tag: "feedback" },
      {
        subject: `Pack app ${FEEDBACK_KINDS[kind].toLowerCase()} from ${who}`,
        paragraphs: [
          `${who} (${me.email}) sent this from the Pack 361 app${page ? ` on ${page}` : ""}:`,
          message,
          "Reply to them by email, then mark it handled in Pack admin → Messages.",
          `${APP_URL}/admin/messages`,
        ],
      },
    );
  });
  return { ok: true, message: "Sent to the pack admins. Thanks!" };
}

/** A new private calendar link (the old one stops working). */
export async function resetCalendarLink() {
  await requireMember();
  const supabase = await createClient();
  await supabase.rpc("reset_calendar_token");
  revalidatePath("/events");
}
