"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/ActionForm";
import { getEvent, isLeader, requireMember } from "@/lib/data";
import { READY_KINDS, REMIND_EVERY_HOURS, canSeeMoney, defaultReminder, reminderAudience, reminderUrl, type ReadyKind } from "@/lib/ready";
import { sendPushTo } from "@/lib/push";
import { sendBulk } from "@/lib/bulk-email";
import { APP_URL } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * "Ready to go?": a leader reminds just the families on one row (no medical form, unsigned slip,
 * unpaid, or everyone going when volunteer jobs are open). A phone alert, and email if ticked.
 * The same reminder goes out at most once every 12 hours per event.
 */
export async function remindFamilies(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  if (!isLeader(me)) return { error: "Only leaders can send reminders." };
  const eventId = String(form.get("event_id") ?? "");
  const kind = String(form.get("kind") ?? "") as ReadyKind;
  if (!UUID.test(eventId) || !READY_KINDS.includes(kind)) return { error: "That reminder wasn't found." };
  if (kind === "pay" && !canSeeMoney(me)) return { error: "Only pack leadership can send payment reminders." };
  const e = await getEvent(eventId);
  if (!e) return { error: "That event wasn't found." };
  const email = form.getAll("email").includes("on");

  const who = await reminderAudience(e, me, kind);
  if (!who.families) return { error: "Nobody needs this reminder right now." };
  const typed = String(form.get("message") ?? "").trim().slice(0, 300);
  const message = typed || defaultReminder(kind, e.title, who.openJobs);

  const supabase = await createClient();
  const { data: claimed, error } = await supabase.rpc("claim_event_reminder", { p_event_id: e.id, p_kind: kind, p_families: who.families });
  if (error) return { error: "Couldn't send that. Try again." };
  if (!claimed) return { error: `This reminder already went out in the last ${REMIND_EVERY_HOURS} hours.` };

  const people = who.people.filter((p) => p.id !== me.id);
  const url = reminderUrl(kind, e);
  const title = e.title.slice(0, 60);
  after(async () => {
    await sendPushTo(
      people.map((p) => p.id),
      { title: kind === "jobs" ? `${title}: volunteers needed` : `Reminder: ${title}`, body: message.slice(0, 180), url, tag: `ready-${kind}-${e.id}` },
    );
    if (email && people.length) {
      const from = `${me.preferred_name || me.first_name} ${me.last_name}`;
      await sendBulk(
        people.map((p) => ({ email: p.email, name: p.preferred_name || p.first_name })),
        {
          subject: kind === "jobs" ? `${title}: volunteers needed` : `Reminder: ${title}`,
          replyTo: me.email,
          paragraphs: ["Hi,", message, `From ${from}. Reply to this email to reach them.`, `${APP_URL}${url}`],
        },
      );
    }
  });
  revalidatePath(`/events/${e.id}`);
  revalidatePath(`/campouts/${e.id}`);
  const n = who.families;
  return { ok: true, message: `Sent to ${n} ${n === 1 ? "family" : "families"}.` };
}
