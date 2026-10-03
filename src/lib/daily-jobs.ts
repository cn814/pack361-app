import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushTo } from "./push";
import { APP_URL, emailConfigured, sendEmails, type Email } from "./email";
import { COURSE_BY_KEY, REMINDER_DAYS, TRAINING_IMPORT_DAYS, daysLeft, trainingImportDue, trainingKeeperIds, type CourseKey } from "./training";
import { fmtRange } from "./format";
import { eventPath } from "./featured";
import { PHOTO_BUCKET } from "./photos";
import { daysBetween, easternDate } from "./tz";
import { REGISTRATION_REMINDER_DAYS, RENEW_URL } from "./registration";
import { chargesStillOpen, settleOrder } from "./payments";
import { captureOrder, getOrder, PayPalError, type PayPalOrder } from "./paypal";

// Jobs run once a day by the Vercel cron (/api/cron/daily) with the secret-key client.
// A reminder is only marked as sent once it actually went out (a push reached a phone, or the
// email was accepted); anything that didn't go out is tried again on the next run.

/**
 * Reminder emails for the whole daily run share this budget. The free email plan allows 100 a day
 * in total, and sign-in codes and welcome emails need the rest.
 */
export const REMINDER_EMAILS_PER_RUN = 40;

/** What's left of the run's reminder email budget; every step takes from the same one. */
export type EmailBudget = { left: number };

export function emailBudget(): EmailBudget {
  return { left: REMINDER_EMAILS_PER_RUN };
}

/** "Tonight", "Today" or "Tomorrow" for an event, in Eastern time. */
function whenWord(startsAt: string): string {
  const days = daysBetween(easternDate(Date.now()), easternDate(startsAt));
  if (days <= 0) return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(new Date(startsAt))) >= 16 ? "Tonight" : "Today";
  return days === 1 ? "Tomorrow" : new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" }).format(new Date(startsAt));
}

/** Send the emails that fit what's left of the run's budget; returns how many went out (0 on failure). */
export async function sendSome(emails: Email[], budget: EmailBudget): Promise<{ sent: number; error: string | null }> {
  if (!emails.length || !emailConfigured() || budget.left <= 0) return { sent: 0, error: null };
  const batch = emails.slice(0, budget.left);
  const error = await sendEmails(batch);
  // Counted even on failure: some may have gone out, and the quota matters more than a retry tonight.
  budget.left -= batch.length;
  return { sent: error ? 0 : batch.length, error };
}

/** Remind volunteers about jobs at events starting in the next ~30 hours. */
export async function remindVolunteers(db: SupabaseClient, budget: EmailBudget = emailBudget()) {
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
  const mail = await sendSome(waiting.map((w) => w.email), budget);
  done.push(...waiting.slice(0, mail.sent).map((w) => w.row));
  const stamp = new Date().toISOString();
  const bySlot = new Map<string, string[]>();
  for (const r of done) bySlot.set(r.slot_id, [...(bySlot.get(r.slot_id) ?? []), r.adult_id]);
  for (const [slotId, adultIds] of bySlot) {
    await db.from("volunteer_signups").update({ reminded_at: stamp }).eq("slot_id", slotId).in("adult_id", adultIds);
  }
  if (mail.error) throw new Error(`Volunteer reminder emails failed: ${mail.error}`);
  return { volunteers: rows.length, pushed: done.length - mail.sent, emailed: mail.sent, later: rows.length - done.length };
}

/**
 * Remind leaders 60, 30, 7 and 0 days before a training expires (once per threshold), by push, or
 * by email when no push reached a phone.
 */
export async function remindTraining(db: SupabaseClient, budget: EmailBudget = emailBudget()) {
  const { data, error } = await db
    .from("adult_trainings")
    .select("adult_id, course, expires_on, reminded_days, adult:adults!adult_trainings_adult_id_fkey!inner(first_name, preferred_name, email, is_active)")
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
    const outside = COURSE_BY_KEY[r.course]?.where === "elsewhere"; // CPR / First Aid isn't on my.scouting
    const when = left <= 0 ? "today" : `in ${left} day${left === 1 ? "" : "s"}`;
    const key = { adult_id: r.adult_id, course: r.course, threshold };
    const res = await sendPushTo([r.adult_id], {
      title: `${course} expires ${when}`,
      body: outside ? "Renew it, then update the date in the app." : "Renew it at my.scouting.org, then update the date in the app.",
      url: "/family/training",
      tag: `training-${r.course}`,
    });
    if (res.sent) {
      done.push(key);
      continue;
    }
    // No phone got it: email instead.
    waiting.push({
      key,
      email: {
        to: r.adult.email,
        subject: `Your ${course} training expires ${when}`,
        paragraphs: [
          `Hi ${r.adult.preferred_name || r.adult.first_name},`,
          `Your ${course} training expires ${when} (${new Date(r.expires_on + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}). Leaders need current training to stay registered and to lead outings.`,
          outside
            ? "When you renew it, add the new date in the app (Me → My training)."
            : "Take it at my.scouting.org (My Dashboard → My Training). When you finish, add the new date in the app (Me → My training).",
          `${APP_URL}/family/training`,
        ],
      },
    });
  }
  const mail = await sendSome(waiting.map((w) => w.email), budget);
  done.push(...waiting.slice(0, mail.sent).map((w) => w.key));
  const groups = new Map<string, { course: string; threshold: number; ids: string[] }>();
  for (const k of done) {
    const id = `${k.course}|${k.threshold}`;
    const g = groups.get(id) ?? { course: k.course, threshold: k.threshold, ids: [] };
    g.ids.push(k.adult_id);
    groups.set(id, g);
  }
  for (const g of groups.values()) {
    await db.from("adult_trainings").update({ reminded_days: g.threshold }).eq("course", g.course).in("adult_id", g.ids);
  }
  if (mail.error) throw new Error(`Training reminder emails failed: ${mail.error}`);
  return { training: done.length, pushed: done.length - mail.sent, emailed: mail.sent, later: waiting.length - mail.sent };
}

/**
 * Scouting America registration: remind families 30, 7 and 0 days before a scout's registration
 * expires (and adults about their own), once per threshold. By push to the family's active adults,
 * or by email to each of them when no push reached anyone. Families renew and pay at my.scouting.org.
 */
export async function remindRegistration(db: SupabaseClient, budget: EmailBudget = emailBudget()) {
  const today = easternDate(Date.now());
  const shift = (days: number) => easternDate(Date.now() + days * 86400000);
  const lo = shift(-1);
  const hi = shift(31);
  const adultCols = "id, family_id, first_name, preferred_name, email, registration_expires_on, registration_reminded_days";
  const [scoutRes, ownRes] = await Promise.all([
    db
      .from("scouts")
      .select("id, family_id, first_name, registration_expires_on, registration_reminded_days")
      .eq("is_active", true)
      .gte("registration_expires_on", lo)
      .lte("registration_expires_on", hi),
    // Adults whose own registration is due soon.
    db.from("adults").select(adultCols).eq("is_active", true).gte("registration_expires_on", lo).lte("registration_expires_on", hi),
  ]);
  if (scoutRes.error) throw new Error(scoutRes.error.message);
  if (ownRes.error) throw new Error(ownRes.error.message);
  // And the adults of families with a scout due soon, who get that scout's reminder.
  const families = [...new Set((scoutRes.data ?? []).map((s) => s.family_id as string))];
  const familyRes = families.length
    ? await db.from("adults").select(adultCols).eq("is_active", true).in("family_id", families)
    : { data: [], error: null };
  if (familyRes.error) throw new Error(familyRes.error.message);
  type AdultRow = {
    id: string;
    family_id: string | null;
    first_name: string;
    preferred_name: string | null;
    email: string;
    registration_expires_on: string | null;
    registration_reminded_days: number | null;
  };
  const adults = [...new Map(([...(ownRes.data ?? []), ...(familyRes.data ?? [])] as AdultRow[]).map((a) => [a.id, a])).values()];
  const scouts = (scoutRes.data ?? []) as {
    id: string;
    family_id: string;
    first_name: string;
    registration_expires_on: string;
    registration_reminded_days: number | null;
  }[];

  // Smallest threshold at or above the days left, if that reminder hasn't gone out yet.
  const thresholdFor = (expires: string, reminded: number | null) => {
    const left = daysBetween(today, expires);
    const t = [...REGISTRATION_REMINDER_DAYS].sort((a, b) => a - b).find((d) => left <= d);
    return t === undefined || (reminded !== null && t >= reminded) ? null : t;
  };
  const longDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  type Item = { table: "scouts" | "adults"; id: string; threshold: number; to: AdultRow[]; line: string };
  const items: Item[] = [];
  for (const s of scouts) {
    const threshold = thresholdFor(s.registration_expires_on, s.registration_reminded_days);
    const to = adults.filter((a) => a.family_id === s.family_id);
    if (threshold === null || !to.length) continue;
    items.push({
      table: "scouts",
      id: s.id,
      threshold,
      to,
      line: `${s.first_name}'s Scouting America registration expires ${longDate(s.registration_expires_on)}. Renew at my.scouting.org.`,
    });
  }
  for (const a of adults) {
    const on = a.registration_expires_on;
    if (!on || on < lo || on > hi) continue;
    const threshold = thresholdFor(on, a.registration_reminded_days);
    if (threshold === null) continue;
    items.push({
      table: "adults",
      id: a.id,
      threshold,
      to: [a],
      line: `Your Scouting America registration expires ${longDate(on)}. Renew at my.scouting.org.`,
    });
  }

  const done: Item[] = [];
  const waiting: { item: Item; emails: Email[] }[] = [];
  for (const it of items) {
    const res = await sendPushTo(
      it.to.map((a) => a.id),
      { title: "Time to renew registration", body: it.line, url: "/family/household", tag: `registration-${it.id}` },
    );
    if (res.sent) {
      done.push(it);
      continue;
    }
    waiting.push({
      item: it,
      emails: it.to.map((a) => ({
        to: a.email,
        subject: it.line.split(". ")[0],
        paragraphs: [
          `Hi ${a.preferred_name || a.first_name},`,
          it.line,
          "Families renew and pay Scouting America registration themselves at my.scouting.org; the pack doesn't collect it.",
          RENEW_URL,
        ],
      })),
    });
  }
  // Whole reminders only, up to what's left of the run's email budget; the rest wait for the next run.
  const fits: typeof waiting = [];
  let count = 0;
  for (const w of waiting) {
    if (count + w.emails.length > budget.left) break;
    fits.push(w);
    count += w.emails.length;
  }
  const mail = await sendSome(fits.flatMap((w) => w.emails), budget);
  if (mail.sent) done.push(...fits.map((w) => w.item));
  const groups = new Map<string, { table: Item["table"]; threshold: number; ids: string[] }>();
  for (const it of done) {
    const id = `${it.table}|${it.threshold}`;
    const g = groups.get(id) ?? { table: it.table, threshold: it.threshold, ids: [] };
    g.ids.push(it.id);
    groups.set(id, g);
  }
  for (const g of groups.values()) {
    await db.from(g.table).update({ registration_reminded_days: g.threshold }).in("id", g.ids);
  }
  if (mail.error) throw new Error(`Registration reminder emails failed: ${mail.error}`);
  return { registration: done.length, emailed: mail.sent, later: items.length - done.length };
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
    .select("id, amount_cents, provider_order_id, charge_ids, charge_cents, created_at")
    .eq("status", "created")
    .lt("created_at", new Date(now - 15 * 60000).toISOString())
    .order("created_at")
    .limit(40);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as {
    id: string;
    amount_cents: number;
    provider_order_id: string;
    charge_ids: string[];
    charge_cents: number[];
    created_at: string;
  }[];
  const out = { checked: rows.length, recorded: 0, canceled: 0, waiting: 0, errors: [] as string[] };
  // Closing a checkout lets go of its hold on the charges (database trigger).
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
        if (!(await chargesStillOpen(db, p))) {
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

/**
 * Once a month, when the pack's training hasn't been imported from my.scouting for a month, email
 * the Committee Chair (or whoever keeps training; see trainingKeeperIds) a reminder to do it.
 * A phone alert and an email (it's monthly, so both); at most one reminder every 30 days.
 */
export async function remindTrainingImport(db: SupabaseClient, budget: EmailBudget = emailBudget()) {
  const { data: rows } = await db.from("pack_settings").select("key, value").in("key", ["training_last_import", "training_import_reminded"]);
  const get = (k: string) => (rows ?? []).find((r) => r.key === k)?.value as string | undefined;
  const last = get("training_last_import");
  if (!trainingImportDue(last)) return { due: false };
  if (!trainingImportDue(get("training_import_reminded"))) return { due: true, reminded: "recently" };

  const { data, error } = await db
    .from("adults")
    .select("id, first_name, preferred_name, email, role, position_title")
    .eq("is_active", true)
    .in("role", ["committee", "cubmaster", "admin"]);
  if (error) throw new Error(error.message);
  const people = (data ?? []) as { id: string; first_name: string; preferred_name: string | null; email: string; role: string; position_title: string | null }[];
  const keepers = new Set(trainingKeeperIds(people));
  const to = people.filter((p) => keepers.has(p.id));
  if (!to.length) return { due: true, sent: 0 };

  const ago = last ? `It was last updated ${Math.floor((Date.now() - Date.parse(last)) / 86400000)} days ago.` : "It hasn't been imported yet.";
  const push = await sendPushTo(to.map((p) => p.id), {
    title: "Update everyone's training",
    body: "Upload this month's my.scouting training report (about 5 minutes).",
    url: "/leaders/training/import",
    tag: "training-import",
  });
  let emailed = 0;
  let mailError: string | null = null;
  {
    const mail = await sendSome(
      to.map((p) => ({
        to: p.email,
        subject: "Time to update everyone's training in the Pack 361 app",
        paragraphs: [
          `Hi ${p.preferred_name || p.first_name},`,
          `${ago} Once a month, upload the training report from my.scouting so every leader's training (Safeguarding Youth, position training, Hazardous Weather) stays current in the app and the right people get renewal reminders.`,
          "On a computer: sign in at my.scouting.org, open Training Manager, run the leader training report for Pack 361, export it as CSV or Excel, then upload it in the app (Leaders → Training → Import from my.scouting). About 5 minutes.",
          `${APP_URL}/leaders/training/import`,
        ],
      })),
      budget,
    );
    emailed = mail.sent;
    mailError = mail.error;
  }
  // Record the reminder whenever anyone got it (phone or email), even if some emails failed,
  // so tomorrow doesn't push the same alert again.
  const errors: string[] = mailError ? [mailError] : [];
  if (push.sent || emailed) {
    const { error: saveErr } = await db
      .from("pack_settings")
      .upsert({ key: "training_import_reminded", value: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (saveErr) errors.push(`Couldn't record the reminder: ${saveErr.message}`);
  }
  return { due: true, pushed: push.sent, emailed, every: TRAINING_IMPORT_DAYS, ...(errors.length ? { errors } : {}) };
}
