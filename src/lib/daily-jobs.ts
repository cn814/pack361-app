import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushTo } from "./push";
import { APP_URL, emailConfigured, sendEmails, type Email } from "./email";
import { COURSE_BY_KEY, REMINDER_DAYS, daysLeft, type CourseKey } from "./training";
import { fmtRange } from "./format";
import { eventPath } from "./featured";
import { PHOTO_BUCKET } from "./photos";

// Jobs run once a day by the Vercel cron (/api/cron/daily) with the secret-key client.

/** Remind volunteers about jobs at events starting in the next ~30 hours. */
export async function remindVolunteers(db: SupabaseClient) {
  const now = Date.now();
  const { data } = await db
    .from("volunteer_signups")
    .select(
      "slot_id, adult_id, slot:volunteer_slots!inner(role_title, shift_label, event:events!inner(id, title, category, starts_at, ends_at)), adult:adults!inner(first_name, preferred_name, email, is_active)",
    )
    .is("reminded_at", null)
    .gte("slot.event.starts_at", new Date(now).toISOString())
    .lte("slot.event.starts_at", new Date(now + 30 * 3600 * 1000).toISOString());
  const rows = (data ?? []) as unknown as {
    slot_id: string;
    adult_id: string;
    slot: { role_title: string; shift_label: string | null; event: { id: string; title: string; category: string; starts_at: string; ends_at: string | null } };
    adult: { first_name: string; preferred_name: string | null; email: string; is_active: boolean };
  }[];
  let pushed = 0;
  const emails: Email[] = [];
  for (const r of rows.filter((r) => r.adult.is_active)) {
    const e = r.slot.event;
    const job = `${r.slot.role_title}${r.slot.shift_label ? ` (${r.slot.shift_label})` : ""}`;
    const res = await sendPushTo([r.adult_id], {
      title: `Tomorrow: ${e.title}`,
      body: `Thanks for volunteering: ${job}.`,
      url: `${eventPath(e)}#volunteer`,
      tag: `volunteer-${r.slot_id}`,
    });
    pushed += res.sent;
    if (!res.sent) {
      emails.push({
        to: r.adult.email,
        subject: `Reminder: ${job} at ${e.title}`,
        paragraphs: [
          `Hi ${r.adult.preferred_name || r.adult.first_name},`,
          `Thanks for signing up to help at ${e.title} (${fmtRange(e.starts_at, e.ends_at)}). Your job: ${job}.`,
          "If you can't make it anymore, tap \"I can't make it\" on the event page so someone else can step in.",
          `${APP_URL}${eventPath(e)}`,
        ],
      });
    }
  }
  if (emails.length && emailConfigured()) await sendEmails(emails.slice(0, 100));
  if (rows.length) {
    for (const r of rows) {
      await db.from("volunteer_signups").update({ reminded_at: new Date().toISOString() }).eq("slot_id", r.slot_id).eq("adult_id", r.adult_id);
    }
  }
  return { volunteers: rows.length, pushed, emailed: emailConfigured() ? emails.length : 0 };
}

/** Remind leaders 60, 30, 7 and 0 days before a training expires (once per threshold). */
export async function remindTraining(db: SupabaseClient) {
  const { data } = await db
    .from("adult_trainings")
    .select("adult_id, course, expires_on, reminded_days, adult:adults!inner(first_name, preferred_name, email, is_active)")
    .not("expires_on", "is", null)
    .lte("expires_on", new Date(Date.now() + 61 * 86400000).toISOString().slice(0, 10))
    .gte("expires_on", new Date(Date.now() - 86400000).toISOString().slice(0, 10));
  const rows = (data ?? []) as unknown as {
    adult_id: string;
    course: CourseKey;
    expires_on: string;
    reminded_days: number | null;
    adult: { first_name: string; preferred_name: string | null; email: string; is_active: boolean };
  }[];
  const emails: Email[] = [];
  let sent = 0;
  for (const r of rows.filter((r) => r.adult.is_active)) {
    const left = daysLeft(r.expires_on)!;
    // Smallest threshold at or above the days left; send once per threshold.
    const threshold = [...REMINDER_DAYS].sort((a, b) => a - b).find((d) => left <= d);
    if (threshold === undefined || (r.reminded_days !== null && threshold >= r.reminded_days)) continue;
    const course = COURSE_BY_KEY[r.course]?.label ?? r.course;
    const when = left <= 0 ? "today" : `in ${left} day${left === 1 ? "" : "s"}`;
    await sendPushTo([r.adult_id], {
      title: `${course} expires ${when}`,
      body: "Renew it at my.scouting.org, then update the date in the app.",
      url: "/family",
      tag: `training-${r.course}`,
    });
    emails.push({
      to: r.adult.email,
      subject: `Your ${course} training expires ${when}`,
      paragraphs: [
        `Hi ${r.adult.preferred_name || r.adult.first_name},`,
        `Your ${course} training expires ${when} (${new Date(r.expires_on + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}). Leaders need current training to stay registered and to lead outings.`,
        "Take it at my.scouting.org (My Dashboard → My Training). When you finish, add the new date under My training in the app.",
        `${APP_URL}/family`,
      ],
    });
    await db.from("adult_trainings").update({ reminded_days: threshold }).eq("adult_id", r.adult_id).eq("course", r.course);
    sent++;
  }
  if (emails.length && emailConfigured()) await sendEmails(emails.slice(0, 100));
  return { training: sent };
}

/** Delete photos older than the pack's keep-for setting (files and rows). */
export async function purgeOldPhotos(db: SupabaseClient) {
  const { data: setting } = await db.from("pack_settings").select("value").eq("key", "photo_keep_months").maybeSingle();
  const months = Math.max(1, Number(setting?.value ?? 24) || 24);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const { data } = await db.from("photos").select("id, storage_path, thumb_path").lt("created_at", cutoff.toISOString()).limit(500);
  const rows = (data ?? []) as { id: string; storage_path: string; thumb_path: string | null }[];
  if (!rows.length) return { photos_deleted: 0 };
  const paths = rows.flatMap((r) => [r.storage_path, r.thumb_path]).filter(Boolean) as string[];
  await db.storage.from(PHOTO_BUCKET).remove(paths);
  await db.from("photos").delete().in("id", rows.map((r) => r.id));
  return { photos_deleted: rows.length };
}
