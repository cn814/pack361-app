import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pushConfigured, sendPushTo } from "./push";
import { APP_URL, type Email } from "./email";
import { eventPath } from "./featured";
import { fmtDay, fmtRange } from "./format";
import { addDays, easternDate } from "./tz";
import { emailBudget, sendSome, type EmailBudget } from "./daily-jobs";
import { clip, dayBeforeDue, familiesFor, rsvpNudgeDue, shortDay, tomorrowWindow, whenWhere, type AudienceScout } from "./reminder-logic";
import type { DenRank } from "./types";

// Automatic event reminders, run by the daily cron (/api/cron/daily, 5 PM Eastern):
//   day_before   the day before an event (Eastern), to the adults of families who said Going
//                (not waitlisted): time, place, the packing list for a campout, and whether
//                the event has a Signal group.
//   rsvp_nudge   two days before the RSVP-by date, to the families the event is for who haven't
//                answered (pack-wide: every family with an active scout; a den's: that den's
//                families; a rank's: families with a scout of that rank). Not for leader-only
//                events, events without RSVPs, or den meetings and committee meetings.
// Each reminder is claimed in event_auto_reminders before it goes out, so a rerun never sends it
// twice. By push; a family with no phone signed up for alerts gets one email instead (to the
// adult who answered, or one adult), within the run's shared email budget. Adults only:
// scouts have no accounts, so nothing here can reach a scout.

type Kind = "day_before" | "rsvp_nudge";

interface Ev {
  id: string;
  title: string;
  category: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location_name: string | null;
  address: string | null;
  den_id: string | null;
  ranks: DenRank[] | null;
  leaders_only: boolean;
  rsvp_enabled: boolean;
  rsvp_by: string | null;
}

interface AdultRow {
  id: string;
  family_id: string | null;
  email: string | null;
  first_name: string;
  preferred_name: string | null;
}

/** One family (or one adult without a family) who gets a reminder. */
interface Unit {
  adults: AdultRow[];
  /** Who gets the email when no phone in the family has alerts on. */
  emailTo: AdultRow | null;
}

interface Reminder {
  event: Ev;
  kind: Kind;
  units: Unit[];
  push: { title: string; body: string; url: string; tag: string };
  email: (a: AdultRow) => Email;
}

const EVENT_COLS = "id, title, category, starts_at, ends_at, all_day, location_name, address, den_id, ranks, leaders_only, rsvp_enabled, rsvp_by";
/** Their own flow (den meetings) or not for families (committee meetings). */
const NO_NUDGE = new Set(["Den Meeting", "Committee"]);
const NO_DAY_BEFORE = new Set(["Den Meeting"]);

const hi = (a: AdultRow) => `Hi ${a.preferred_name || a.first_name},`;

export async function remindEvents(db: SupabaseClient, budget: EmailBudget = emailBudget()) {
  const now = Date.now();
  const today = easternDate(now);
  const win = tomorrowWindow(today);

  const [tomorrowRes, nudgeRes] = await Promise.all([
    db
      .from("events")
      .select(EVENT_COLS)
      .gte("starts_at", win.from)
      .lt("starts_at", win.to)
      .eq("rsvp_enabled", true)
      .is("archived_at", null),
    db
      .from("events")
      .select(EVENT_COLS)
      .eq("rsvp_by", addDays(today, 2))
      .eq("rsvp_enabled", true)
      .eq("leaders_only", false)
      .gt("starts_at", new Date(now).toISOString())
      .is("archived_at", null),
  ]);
  if (tomorrowRes.error) throw new Error(tomorrowRes.error.message);
  if (nudgeRes.error) throw new Error(nudgeRes.error.message);
  const tomorrow = ((tomorrowRes.data ?? []) as Ev[]).filter((e) => !NO_DAY_BEFORE.has(e.category) && dayBeforeDue(e.starts_at, today));
  const nudge = ((nudgeRes.data ?? []) as Ev[]).filter((e) => !NO_NUDGE.has(e.category) && rsvpNudgeDue(e.rsvp_by, today));
  if (!tomorrow.length && !nudge.length) return { day_before: 0, rsvp_nudge: 0 };

  // Answers for both lists. "*" so the waitlist column is read when it exists (a waitlisted
  // "yes" isn't going yet), without breaking where it doesn't.
  const eventIds = [...new Set([...tomorrow, ...nudge].map((e) => e.id))];
  const { data: rsvpRows, error: rsvpErr } = await db.from("event_rsvps").select("*").in("event_id", eventIds);
  if (rsvpErr) throw new Error(rsvpErr.message);
  const rsvps = (rsvpRows ?? []) as { event_id: string; family_id: string | null; adult_id: string | null; status: string; waitlisted?: boolean | null }[];

  // Families with active scouts (who an event is for), only needed for nudges.
  let scouts: AudienceScout[] = [];
  if (nudge.length) {
    const [{ data: s, error: sErr }, { data: fams, error: fErr }] = await Promise.all([
      db.from("scouts").select("family_id, den_id, den:dens(rank)").eq("is_active", true),
      db.from("families").select("id").eq("is_active", true),
    ]);
    if (sErr) throw new Error(sErr.message);
    if (fErr) throw new Error(fErr.message);
    const active = new Set(((fams ?? []) as { id: string }[]).map((f) => f.id));
    scouts = ((s ?? []) as unknown as { family_id: string; den_id: string | null; den: { rank: DenRank } | null }[])
      .filter((x) => active.has(x.family_id))
      .map((x) => ({ family_id: x.family_id, den_id: x.den_id, rank: x.den?.rank ?? null }));
  }

  // Who's going tomorrow, and who each nudge is for.
  const going = new Map<string, typeof rsvps>();
  for (const e of tomorrow) going.set(e.id, rsvps.filter((r) => r.event_id === e.id && r.status === "yes" && r.waitlisted !== true));
  const nudgeFamilies = new Map<string, string[]>();
  for (const e of nudge) {
    const answered = new Set(rsvps.filter((r) => r.event_id === e.id && r.family_id).map((r) => r.family_id as string));
    nudgeFamilies.set(e.id, familiesFor(e, scouts).filter((f) => !answered.has(f)));
  }

  // The adults of all those families (and adults going on their own).
  const familyIds = new Set<string>();
  const soloIds = new Set<string>();
  for (const list of going.values())
    for (const r of list) {
      if (r.family_id) familyIds.add(r.family_id);
      else if (r.adult_id) soloIds.add(r.adult_id);
    }
  for (const list of nudgeFamilies.values()) for (const f of list) familyIds.add(f);
  const adults = await loadAdults(db, [...familyIds], [...soloIds]);
  const byFamily = new Map<string, AdultRow[]>();
  for (const a of adults) if (a.family_id) byFamily.set(a.family_id, [...(byFamily.get(a.family_id) ?? []), a]);
  const byId = new Map(adults.map((a) => [a.id, a]));

  // Extras for tomorrow's events: Signal groups and campout packing lists.
  const campouts = tomorrow.filter((e) => e.category === "Campout");
  const [signalRes, packRes] = await Promise.all([
    tomorrow.length ? db.from("event_signal").select("event_id").in("event_id", tomorrow.map((e) => e.id)) : Promise.resolve({ data: [] }),
    campouts.length
      ? db
          .from("packing_items")
          .select("event_id, label, required, sort_order")
          .or(`event_id.is.null,event_id.in.(${campouts.map((e) => e.id).join(",")})`)
          .eq("required", true)
          .order("sort_order")
      : Promise.resolve({ data: [] }),
  ]);
  const signal = new Set(((signalRes.data ?? []) as { event_id: string }[]).map((s) => s.event_id));
  const packing = (packRes.data ?? []) as { event_id: string | null; label: string }[];
  const bring = (eventId: string) => {
    const own = packing.filter((p) => p.event_id === eventId);
    return (own.length ? own : packing.filter((p) => !p.event_id)).map((p) => p.label);
  };

  const reminders: Reminder[] = [];
  for (const e of tomorrow) {
    const units: Unit[] = [];
    for (const r of going.get(e.id) ?? []) {
      const list = r.family_id ? (byFamily.get(r.family_id) ?? []) : r.adult_id && byId.has(r.adult_id) ? [byId.get(r.adult_id)!] : [];
      if (!list.length) continue;
      units.push({ adults: list, emailTo: list.find((a) => a.id === r.adult_id && a.email) ?? list.find((a) => a.email) ?? null });
    }
    const items = e.category === "Campout" ? bring(e.id) : [];
    const what = items.length ? `What to bring: ${items.slice(0, 3).join(", ").toLowerCase()}${items.length > 3 ? " and the rest of the packing list" : ""}.` : null;
    const sig = signal.has(e.id) ? "Signal group on the event page." : null;
    const url = eventPath(e);
    reminders.push({
      event: e,
      kind: "day_before",
      units,
      push: { title: `Tomorrow: ${e.title}`, body: clip([`${whenWhere(e)}.`, what, sig].filter(Boolean).join(" ")), url, tag: `event-tomorrow-${e.id}` },
      email: (a) => ({
        to: a.email!,
        subject: `Tomorrow: ${e.title}`,
        paragraphs: [
          hi(a),
          `See you tomorrow at ${e.title}: ${fmtRange(e.starts_at, e.ends_at, e.all_day)}${e.location_name ? `, ${e.location_name}` : ""}${e.address ? ` (${e.address})` : ""}.`,
          ...(items.length ? [`What to bring: ${items.join(", ")}. The full packing list is on the campout page.`] : []),
          ...(sig ? ["There's a Signal group for this event: the link is on the event page."] : []),
          "If your plans changed, update your RSVP on the event page.",
          `${APP_URL}${url}`,
        ],
      }),
    });
  }
  for (const e of nudge) {
    const units: Unit[] = [];
    for (const f of nudgeFamilies.get(e.id) ?? []) {
      const list = byFamily.get(f) ?? [];
      if (list.length) units.push({ adults: list, emailTo: list.find((a) => a.email) ?? null });
    }
    const by = shortDay(e.rsvp_by!);
    const url = `${eventPath(e)}#rsvp`;
    reminders.push({
      event: e,
      kind: "rsvp_nudge",
      units,
      push: {
        title: `RSVP for ${e.title}`,
        body: clip(`Please answer by ${by}, going or not. ${fmtDay(e.starts_at)}, ${whenWhere(e)}.`),
        url,
        tag: `rsvp-nudge-${e.id}`,
      },
      email: (a) => ({
        to: a.email!,
        subject: `Please RSVP for ${e.title} by ${by}`,
        paragraphs: [
          hi(a),
          `${e.title} is ${fmtRange(e.starts_at, e.ends_at, e.all_day)}${e.location_name ? ` at ${e.location_name}` : ""}. Leaders need a headcount: please answer by ${by}, even if you can't make it.`,
          `${APP_URL}${url}`,
        ],
      }),
    });
  }

  // Claim each reminder before it goes out (a rerun or a second run the same day sends nothing).
  const out = { day_before: 0, rsvp_nudge: 0, families: 0, pushed: 0, emailed: 0, no_email_room: 0, errors: [] as string[] };
  const sent: Reminder[] = [];
  for (const r of reminders) {
    if (!r.units.length) continue;
    const { data: claimed, error } = await db
      .from("event_auto_reminders")
      .upsert({ event_id: r.event.id, kind: r.kind, sent_on: today, recipients: r.units.length }, { onConflict: "event_id,kind,sent_on", ignoreDuplicates: true })
      .select("event_id");
    if (error) {
      out.errors.push(`Couldn't record the ${r.kind === "day_before" ? "reminder" : "RSVP nudge"} for ${r.event.title}: ${error.message}`);
      continue;
    }
    if (!claimed?.length) continue; // already went out today
    const res = await sendPushTo(r.units.flatMap((u) => u.adults.map((a) => a.id)), r.push);
    out.pushed += res.sent;
    out[r.kind]++;
    out.families += r.units.length;
    sent.push(r);
  }

  // Families where no phone has alerts turned on (checked after sending, so phones that just
  // turned out to be gone count as none) get one email instead, while the budget lasts.
  const everyone = [...new Set(sent.flatMap((r) => r.units.flatMap((u) => u.adults.map((a) => a.id))))];
  const withPush = new Set<string>();
  if (pushConfigured() && everyone.length) {
    for (let i = 0; i < everyone.length; i += 200) {
      const { data } = await db.from("push_subscriptions").select("adult_id").in("adult_id", everyone.slice(i, i + 200));
      for (const s of (data ?? []) as { adult_id: string }[]) withPush.add(s.adult_id);
    }
  }
  const emails: Email[] = [];
  for (const r of sent) {
    for (const u of r.units) {
      if (u.adults.some((a) => withPush.has(a.id)) || !u.emailTo?.email?.includes("@")) continue;
      emails.push(r.email(u.emailTo));
    }
  }
  if (emails.length) {
    const room = Math.max(0, budget.left);
    const mail = await sendSome(emails, budget);
    out.emailed = mail.sent;
    out.no_email_room = Math.max(0, emails.length - room);
    if (mail.error) out.errors.push(`Reminder emails failed: ${mail.error}`);
  }
  return out;
}

async function loadAdults(db: SupabaseClient, familyIds: string[], adultIds: string[]): Promise<AdultRow[]> {
  const cols = "id, family_id, email, first_name, preferred_name";
  const out = new Map<string, AdultRow>();
  for (let i = 0; i < familyIds.length; i += 200) {
    const { data, error } = await db.from("adults").select(cols).in("family_id", familyIds.slice(i, i + 200)).eq("is_active", true);
    if (error) throw new Error(error.message);
    for (const a of (data ?? []) as AdultRow[]) out.set(a.id, a);
  }
  if (adultIds.length) {
    const { data, error } = await db.from("adults").select(cols).in("id", adultIds).eq("is_active", true);
    if (error) throw new Error(error.message);
    for (const a of (data ?? []) as AdultRow[]) out.set(a.id, a);
  }
  return [...out.values()];
}
