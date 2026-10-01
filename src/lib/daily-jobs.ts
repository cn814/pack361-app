import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushTo } from "./push";
import { APP_URL, emailConfigured, sendEmails, type Email } from "./email";
import { COURSE_BY_KEY, REMINDER_DAYS, daysLeft, type CourseKey } from "./training";
import { fmtRange } from "./format";
import { eventPath } from "./featured";
import { PHOTO_BUCKET } from "./photos";
import { daysBetween, easternDate } from "./tz";
import { chargesStillOpen, settleOrder } from "./payments";
import { captureOrder, getOrder, PayPalError, type PayPalOrder } from "./paypal";

// Jobs run once a day by the Vercel cron (/api/cron/daily) with the secret-key client.
// A reminder is only marked as sent once it actually went out (a push reached a phone, or the
// email was accepted); anything that didn't go out is tried again on the next run.

/** At most this many reminder emails per run, leaving room in the daily email quota. */
const EMAILS_PER_RUN = 60;

/** "Tonight", "Today" or "Tomorrow" for an event, in Eastern time. */
function whenWord(startsAt: string): string {
  const days = daysBetween(easternDate(Date.now()), easternDate(startsAt));
  if (days <= 0) return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(new Date(startsAt))) >= 16 ? "Tonight" : "Today";
  return days === 1 ? "Tomorrow" : new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" }).format(new Date(startsAt));
}

/** Send the emails that fit this run; returns how many went out (0 on failure). */
async function sendSome(emails: Email[]): Promise<{ sent: number; error: string | null }> {
  if (!emails.length || !emailConfigured()) return { sent: 0, error: null };
  const batch = emails.slice(0, EMAILS_PER_RUN);
  const error = await sendEmails(batch);
  return { sent: error ? 0 : batch.length, error };
}

/** Remind volunteers about jobs at events starting in the next ~30 hours. */
export async function remindVolunteers(db: SupabaseClient) {
  const now = Date.now();
  const { data, error } = await db
    .from("volunteer_signups")
    .select(
      "slot_id, adult_id, slot:volunteer_slots!inner(role_title, shift_label, event:events!inner(id, title, category, starts_at, ends_at, all_day)), adult:adults!inner(first_name, preferred_name, email, is_active)",
    )
    .is("reminded_at", null)
    .gte("slot.event.starts_at", new Date(now).toISOString())
    .lte("slot.event.starts_at", new Date(now + 30 * 3600 * 1000).toISOString())
    .is("slot.event.archived_at", null);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as unknown as {
    slot_id: string;
    adult_id: string;
    slot: { role_title: string; shift_label: string | null; event: { id: string; title: string; category: string; starts_at: string; ends_at: string | null; all_day: boolean } };
    adult: { first_name: string; preferred_name: string | null; email: string; is_active: boolean };
  }[]).filter((r) => r.adult.is_active);
  const done: typeof rows = [];
  const waiting: { row: (typeof rows)[number]; email: Email }[] = [];
  for (const r of rows) {
    const e = r.slot.event;
    const job = `${r.slot.role_title}${r.slot.shift_label ? ` (${r.slot.shift_label})` : ""}`;
    const res = await sendPushTo([r.adult_id], {
      title: `${whenWord(e.starts_at)}: ${e.title}`,
      body: `Thanks for volunteering: ${job}.`,
      url: `${eventPath(e)}#volunteer`,
      tag: `volunteer-${r.slot_id}`,
    });
    if (res.sent) {
      done.push(r);
      continue;
    }
    waiting.push({
      row: r,
      email: {
        to: r.adult.email,
        subject: `Reminder: ${job} at ${e.title}`,
        paragraphs: [
          `Hi ${r.adult.preferred_name || r.adult.first_name},`,
          `Thanks for signing up to help at ${e.title} (${fmtRange(e.starts_at, e.ends_at, e.all_day)}). Your job: ${job}.`,
          "If you can't make it anymore, tap \"I can't make it\" on the event page so someone else can step in.",
          `${APP_URL}${eventPath(e)}`,
        ],
      },
    });
  }
  const mail = await sendSome(waiting.map((w) => w.email));
  done.push(...waiting.slice(0, mail.sent).map((w) => w.row));
  const stamp = new Date().toISOString();
  for (const r of done) {
    await db.from("volunteer_signups").update({ reminded_at: stamp }).eq("slot_id", r.slot_id).eq("adult_id", r.adult_id);
  }
  if (mail.error) throw new Error(`Volunteer reminder emails failed: ${mail.error}`);
  return { volunteers: rows.length, pushed: done.length - mail.sent, emailed: mail.sent, later: rows.length - done.length };
}

/** Remind leaders 60, 30, 7 and 0 days before a training expires (once per threshold). */
export async function remindTraining(db: SupabaseClient) {
  const { data, error } = await db
    .from("adult_trainings")
    .select("adult_id, course, expires_on, reminded_days, adult:adults!inner(first_name, preferred_name, email, is_active)")
    .not("expires_on", "is", null)
    .lte("expires_on", new Date(Date.now() + 61 * 86400000).toISOString().slice(0, 10))
    .gte("expires_on", new Date(Date.now() - 86400000).toISOString().slice(0, 10));
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as {
    adult_id: string;
    course: CourseKey;
    expires_on: string;
    reminded_days: number | null;
    adult: { first_name: string; preferred_name: string | null; email: string; is_active: boolean };
  }[];
  const done: { adult_id: string; course: string; threshold: number }[] = [];
  const waiting: { key: { adult_id: string; course: string; threshold: number }; email: Email }[] = [];
  for (const r of rows.filter((r) => r.adult.is_active)) {
    const left = daysLeft(r.expires_on)!;
    // Smallest threshold at or above the days left; send once per threshold.
    const threshold = [...REMINDER_DAYS].sort((a, b) => a - b).find((d) => left <= d);
    if (threshold === undefined || (r.reminded_days !== null && threshold >= r.reminded_days)) continue;
    const course = COURSE_BY_KEY[r.course]?.label ?? r.course;
    const when = left <= 0 ? "today" : `in ${left} day${left === 1 ? "" : "s"}`;
    const key = { adult_id: r.adult_id, course: r.course, threshold };
    const res = await sendPushTo([r.adult_id], {
      title: `${course} expires ${when}`,
      body: "Renew it at my.scouting.org, then update the date in the app.",
      url: "/family",
      tag: `training-${r.course}`,
    });
    // Email too: training matters enough to land in the inbox as well as on the phone.
    waiting.push({
      key,
      email: {
        to: r.adult.email,
        subject: `Your ${course} training expires ${when}`,
        paragraphs: [
          `Hi ${r.adult.preferred_name || r.adult.first_name},`,
          `Your ${course} training expires ${when} (${new Date(r.expires_on + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}). Leaders need current training to stay registered and to lead outings.`,
          "Take it at my.scouting.org (My Dashboard → My Training). When you finish, add the new date under My training in the app.",
          `${APP_URL}/family`,
        ],
      },
    });
    if (res.sent) done.push(key);
  }
  const mail = await sendSome(waiting.map((w) => w.email));
  for (const w of waiting.slice(0, mail.sent)) if (!done.includes(w.key)) done.push(w.key);
  for (const k of done) {
    await db.from("adult_trainings").update({ reminded_days: k.threshold }).eq("adult_id", k.adult_id).eq("course", k.course);
  }
  if (mail.error) throw new Error(`Training reminder emails failed: ${mail.error}`);
  return { training: done.length, later: waiting.length - done.length };
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
  // Files first; keep the rows (and try again tomorrow) if Storage refused, so no file is orphaned.
  const { error: fileError } = await db.storage.from(PHOTO_BUCKET).remove(paths);
  if (fileError) throw new Error(`Couldn't delete old photo files: ${fileError.message}`);
  const { error } = await db.from("photos").delete().in("id", rows.map((r) => r.id));
  if (error) throw new Error(error.message);
  return { photos_deleted: rows.length };
}

/**
 * Finish PayPal checkouts the family's browser didn't (closed the page, lost signal). For each
 * checkout still "created" after 15 minutes: an APPROVED order is captured, a COMPLETED one is
 * recorded, and one never approved within 3 days is closed. Recording is idempotent, so racing
 * the family's own capture can't mark anything paid twice.
 */
export async function reconcilePayments(db: SupabaseClient) {
  const now = Date.now();
  const { data, error } = await db
    .from("payments")
    .select("id, amount_cents, provider_order_id, charge_ids, created_at")
    .eq("status", "created")
    .lt("created_at", new Date(now - 15 * 60000).toISOString())
    .order("created_at")
    .limit(40);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: string; amount_cents: number; provider_order_id: string; charge_ids: string[]; created_at: string }[];
  const out = { checked: rows.length, recorded: 0, canceled: 0, waiting: 0, errors: [] as string[] };
  const close = async (id: string, why: string) => {
    await db.from("payments").update({ status: "canceled", error: why }).eq("id", id).eq("status", "created");
    out.canceled++;
  };
  for (const p of rows) {
    const old = Date.parse(p.created_at) < now - 3 * 86400000;
    try {
      let order: PayPalOrder;
      try {
        order = await getOrder(p.provider_order_id);
      } catch (e) {
        // PayPal forgets orders that were never approved.
        if (e instanceof PayPalError && e.status === 404 && old) {
          await close(p.id, "Never approved in PayPal.");
          continue;
        }
        throw e;
      }
      if (order.status === "APPROVED") {
        if (!(await chargesStillOpen(db, p.charge_ids))) {
          await close(p.id, "Items changed before the payment was taken; nothing was charged.");
          continue;
        }
        try {
          order = await captureOrder(p.provider_order_id);
        } catch (e) {
          if (!(e instanceof PayPalError && e.issue === "ORDER_ALREADY_CAPTURED")) throw e;
          order = await getOrder(p.provider_order_id);
        }
      }
      if (order.status === "COMPLETED") {
        const r = await settleOrder(db, p, order);
        if (r === "recorded" || r === "partial" || r === "mismatch") out.recorded++;
        else if (r === "pending") out.waiting++;
        else if (r === "wrong_order") out.errors.push(`Payment ${p.id}: PayPal order doesn't match`);
        continue;
      }
      if (old) await close(p.id, "Never approved in PayPal.");
      else out.waiting++;
    } catch (e) {
      // Status codes and PayPal's issue name only; nothing secret.
      out.errors.push(`Payment ${p.id}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }
  return out;
}
