import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { adminConfigured, createAdminClient } from "./supabase/admin";
import { isCommittee, isLeader } from "./data";
import { formState, type HealthForm } from "./paperwork";
import { eventIsFor } from "./slips";
import { campingNights } from "./attendance";
import { isCurrent, type TrainingRow } from "./training";
import { easternDate } from "./tz";
import { eventOver } from "./format";
import { fmtMoney } from "./money";
import { eventHref } from "./volunteer";
import type { Adult, DenRank, PackEvent } from "./types";

// "Ready to go?": for leaders, what the families going to an event still need to do. Only
// names and "needs a medical form" are shown, never anything from the forms themselves.

export type ReadyKind = "medical" | "slips" | "pay" | "jobs";
export const READY_KINDS: ReadyKind[] = ["medical", "slips", "pay", "jobs"];
/** The same reminder goes out at most this often (the database enforces it too). */
export const REMIND_EVERY_HOURS = 12;

export interface ReadyFamily {
  /** family id, or "a:<adult id>" for an adult with no family. */
  key: string;
  name: string;
  /** Who or what: "Sky, Alex" or "$25". */
  detail: string;
}

export interface ReadyRow {
  kind: ReadyKind;
  title: string;
  /** Short count: "3 people in 2 families". */
  summary: string;
  families: ReadyFamily[];
  /** Volunteer jobs still open (jobs row). */
  jobs?: { title: string; open: number }[];
  /** Extra line, e.g. forms turned in but not yet checked by a leader. */
  note?: string;
  /** Default reminder text. */
  message: string;
  lastSent: string | null;
  /** When it can go out again (null = now). */
  nextAt: string | null;
}

export interface TrainingCheck {
  course: "baloo" | "hazardous_weather";
  label: string;
  /** Adults going who have it current. */
  names: string[];
}

export interface ReadyReport {
  eventId: string;
  going: number;
  /** Whether payments were checked (key leaders only). */
  money: boolean;
  rows: ReadyRow[];
  /** Training checks, for overnight events only. */
  training: TrainingCheck[] | null;
}

interface Going {
  key: string;
  family_id: string | null;
  adult_id: string | null;
  scouts: number;
  adults: number;
}
interface FamPerson {
  id: string;
  first_name: string;
  preferred_name?: string | null;
  last_name?: string;
  family_id: string | null;
}
interface ScoutRow extends FamPerson {
  den: { id: string; rank: DenRank; name: string } | null;
}

/** Overnight: camping nights, or a campout. */
export function isOvernight(e: Pick<PackEvent, "category" | "starts_at" | "ends_at" | "camping_nights">): boolean {
  return e.category === "Campout" || campingNights(e) > 0;
}

export function defaultReminder(kind: ReadyKind, title: string, openJobs = 0): string {
  const t = title.slice(0, 80);
  switch (kind) {
    case "medical":
      return `Reminder for ${t}: please turn in your medical form (Parts A and B) for everyone going. Mark it turned in under Me → Medical forms.`;
    case "slips":
      return `Reminder for ${t}: please sign the permission slip for your scout. It takes a minute on the event page.`;
    case "pay":
      return `Reminder for ${t}: your event cost isn't paid yet. You can pay right on the event page.`;
    case "jobs":
      return `${t} still needs help: ${openJobs} volunteer ${openJobs === 1 ? "spot is" : "spots are"} open. Can you take one?`;
  }
}

/** Where the reminder's alert opens. */
export function reminderUrl(kind: ReadyKind, e: { id: string; category: string }): string {
  if (kind === "medical") return "/family/forms";
  const base = eventHref(e);
  return kind === "slips" ? `${base}#slip` : kind === "jobs" ? `${base}#volunteer` : `${base}#rsvp`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const first = (p: { first_name: string; preferred_name?: string | null }) => p.preferred_name || p.first_name;

/**
 * Who may see (and remind about) the "Not paid yet" row: key leaders only, checked on the
 * real role as well as the shown one, so "View as" can only take it away, never grant it.
 */
export function canSeeMoney(me: Adult): boolean {
  return isCommittee(me) && isCommittee({ ...me, role: me.real_role ?? me.role });
}

/** The database client for a leader's readiness check: the secret key when set up, else theirs. */
async function leaderDb(): Promise<SupabaseClient> {
  return adminConfigured() ? createAdminClient() : await createClient();
}

/**
 * Everything the card needs, plus which families each reminder goes to. Callers must check
 * the viewer is a leader first (this reads other families' paperwork and charges).
 */
async function load(e: PackEvent, money: boolean) {
  const db = await leaderDb();
  const { data: rsvps } = await db
    .from("event_rsvps")
    .select("family_id, adult_id, scouts, adults")
    .eq("event_id", e.id)
    .eq("status", "yes")
    .eq("waitlisted", false);
  const going: Going[] = ((rsvps ?? []) as Omit<Going, "key">[]).map((r) => ({ ...r, key: r.family_id ?? `a:${r.adult_id}` }));
  const famIds = going.map((g) => g.family_id).filter((x): x is string => Boolean(x));
  const soloIds = going.filter((g) => !g.family_id).map((g) => g.adult_id).filter((x): x is string => Boolean(x));
  const overnight = isOvernight(e);
  const none = Promise.resolve({ data: [] as unknown[] });

  const [fams, scouts, famAdults, soloAdults, slips, charges, slots, reminders] = await Promise.all([
    famIds.length ? db.from("families").select("id, family_name").in("id", famIds) : none,
    famIds.length
      ? db.from("scouts").select("id, first_name, family_id, den:dens(id, rank, name)").in("family_id", famIds).eq("is_active", true)
      : none,
    famIds.length
      ? db.from("adults").select("id, first_name, preferred_name, last_name, family_id").in("family_id", famIds).eq("is_active", true)
      : none,
    soloIds.length ? db.from("adults").select("id, first_name, preferred_name, last_name, family_id").in("id", soloIds) : none,
    e.slip_required ? db.from("permission_slips").select("scout_id").eq("event_id", e.id) : none,
    money ? db.from("charges").select("family_id, adult_id, amount_cents").eq("event_id", e.id).eq("kind", "event").eq("status", "open") : none,
    db.from("volunteer_slots").select("id, role_title, capacity, signups:volunteer_signups(adult_id)").eq("event_id", e.id),
    db.from("event_reminders").select("kind, sent_at").eq("event_id", e.id),
  ]);
  const scoutRows = ((scouts.data ?? []) as unknown as ScoutRow[]).filter((s) => eventIsFor(e, s));
  const adultRows = [...((famAdults.data ?? []) as FamPerson[]), ...((soloAdults.data ?? []) as FamPerson[])];
  const sIds = scoutRows.map((s) => s.id);
  const aIds = adultRows.map((a) => a.id);
  const [scoutForms, adultForms, trainings] = await Promise.all([
    sIds.length ? db.from("health_forms").select("id, scout_id, adult_id, status, form_date, expires_on, updated_at").in("scout_id", sIds) : none,
    aIds.length ? db.from("health_forms").select("id, scout_id, adult_id, status, form_date, expires_on, updated_at").in("adult_id", aIds) : none,
    overnight && aIds.length
      ? db.from("adult_trainings").select("adult_id, course, completed_on, expires_on").in("adult_id", aIds).in("course", ["baloo", "hazardous_weather"])
      : none,
  ]);
  return {
    going,
    overnight,
    famName: new Map(((fams.data ?? []) as { id: string; family_name: string }[]).map((f) => [f.id, f.family_name])),
    scouts: scoutRows,
    adults: adultRows,
    forms: [...((scoutForms.data ?? []) as HealthForm[]), ...((adultForms.data ?? []) as HealthForm[])],
    signed: new Set(((slips.data ?? []) as { scout_id: string }[]).map((s) => s.scout_id)),
    charges: (charges.data ?? []) as { family_id: string | null; adult_id: string | null; amount_cents: number }[],
    slots: (slots.data ?? []) as { id: string; role_title: string; capacity: number; signups: { adult_id: string }[] }[],
    reminders: new Map(((reminders.data ?? []) as { kind: ReadyKind; sent_at: string }[]).map((r) => [r.kind, r.sent_at])),
    trainings: (trainings.data ?? []) as TrainingRow[],
    money,
  };
}

type Loaded = Awaited<ReturnType<typeof load>>;

function build(e: PackEvent, d: Loaded, now = Date.now()): ReadyReport {
  const onDate = easternDate(e.starts_at);
  const formOf = new Map<string, HealthForm>();
  for (const f of d.forms) formOf.set((f.scout_id ?? f.adult_id) as string, f);
  const familyName = (g: Going) => {
    if (g.family_id) return `${d.famName.get(g.family_id) ?? "A"} family`;
    const a = d.adults.find((x) => x.id === g.adult_id);
    return a ? `${first(a)} ${a.last_name ?? ""}`.trim() : "Someone";
  };

  // Medical forms: as many people with a current form as the family said are coming (like
  // permission slips), naming those without one. "Turned in" counts; a leader checks it later.
  const medical: ReadyFamily[] = [];
  let medicalPeople = 0;
  let waitingCheck = 0;
  for (const g of d.going) {
    const kids = g.family_id ? d.scouts.filter((s) => s.family_id === g.family_id) : [];
    const grownups = g.family_id ? d.adults.filter((a) => a.family_id === g.family_id) : d.adults.filter((a) => a.id === g.adult_id);
    const missing: string[] = [];
    for (const [people, count] of [
      [kids, g.scouts],
      [grownups, g.adults],
    ] as const) {
      const need = Math.min(count, people.length);
      if (!need) continue;
      const states = people.map((p) => ({ p, s: formState(formOf.get(p.id), onDate) }));
      const ok = states.filter((x) => x.s === "current" || x.s === "expiring" || x.s === "submitted");
      waitingCheck += Math.min(ok.filter((x) => x.s === "submitted").length, need);
      if (ok.length < need) {
        const without = states.filter((x) => !ok.includes(x)).map((x) => first(x.p));
        missing.push(...without);
        medicalPeople += need - ok.length;
      }
    }
    if (missing.length) medical.push({ key: g.key, name: familyName(g), detail: missing.join(", ") });
  }

  // Permission slips: one per scout going, among the family's scouts the event is for.
  const slips: ReadyFamily[] = [];
  let slipScouts = 0;
  if (e.slip_required) {
    for (const g of d.going) {
      if (!g.family_id || !g.scouts) continue;
      const kids = d.scouts.filter((s) => s.family_id === g.family_id);
      const need = Math.min(Math.max(g.scouts, 1), kids.length);
      const done = kids.filter((s) => d.signed.has(s.id)).length;
      if (done < need) {
        slips.push({ key: g.key, name: familyName(g), detail: kids.filter((s) => !d.signed.has(s.id)).map(first).join(", ") });
        slipScouts += need - done;
      }
    }
  }

  // Unpaid: open event charges (the RSVP's and any a leader added) of families going. Only
  // loaded for key leaders (see canSeeMoney); den leaders get no money row at all.
  const pay: ReadyFamily[] = [];
  let unpaid = 0;
  for (const g of d.going) {
    const mine = d.charges.filter((c) => (g.family_id ? c.family_id === g.family_id : !c.family_id && c.adult_id === g.adult_id));
    const cents = mine.reduce((s, c) => s + c.amount_cents, 0);
    if (cents > 0) {
      pay.push({ key: g.key, name: familyName(g), detail: fmtMoney(cents) });
      unpaid += cents;
    }
  }

  // Volunteer jobs with open spots: the reminder goes to every family going.
  const jobs = d.slots.map((s) => ({ title: s.role_title, open: Math.max(s.capacity - s.signups.length, 0) })).filter((j) => j.open > 0);
  const openSpots = jobs.reduce((s, j) => s + j.open, 0);

  const sentInfo = (kind: ReadyKind) => {
    const at = d.reminders.get(kind) ?? null;
    const next = at ? Date.parse(at) + REMIND_EVERY_HOURS * 3600000 : 0;
    return { lastSent: at, nextAt: next > now ? new Date(next).toISOString() : null };
  };
  const rows: ReadyRow[] = [];
  if (medical.length || waitingCheck) {
    rows.push({
      kind: "medical",
      title: "Medical forms",
      summary: medical.length ? `${plural(medicalPeople, "person", "people")} in ${plural(medical.length, "family", "families")} need a medical form` : "Everyone going has turned one in",
      families: medical,
      note: waitingCheck ? `${plural(waitingCheck, "form")} turned in, waiting for a leader to mark received.` : undefined,
      message: defaultReminder("medical", e.title),
      ...sentInfo("medical"),
    });
  }
  if (slips.length) {
    rows.push({
      kind: "slips",
      title: "Permission slips",
      summary: `${plural(slipScouts, "scout")} in ${plural(slips.length, "family", "families")} not signed`,
      families: slips,
      message: defaultReminder("slips", e.title),
      ...sentInfo("slips"),
    });
  }
  if (d.money && pay.length) {
    rows.push({
      kind: "pay",
      title: "Not paid yet",
      summary: `${plural(pay.length, "family", "families")} · ${fmtMoney(unpaid)} in all`,
      families: pay,
      message: defaultReminder("pay", e.title),
      ...sentInfo("pay"),
    });
  }
  if (jobs.length) {
    rows.push({
      kind: "jobs",
      title: "Volunteer jobs",
      summary: `${plural(openSpots, "spot")} open in ${plural(jobs.length, "job")}`,
      families: d.going.map((g) => ({ key: g.key, name: familyName(g), detail: "" })),
      jobs,
      message: defaultReminder("jobs", e.title, openSpots),
      ...sentInfo("jobs"),
    });
  }

  let training: TrainingCheck[] | null = null;
  if (d.overnight) {
    // Adults going: everyone in a family that said it's bringing adults, plus adults on their own.
    const goingAdults = d.adults.filter((a) =>
      a.family_id ? d.going.some((g) => g.family_id === a.family_id && g.adults > 0) : d.going.some((g) => g.adult_id === a.id && g.adults > 0),
    );
    training = (
      [
        ["baloo", "BALOO"],
        ["hazardous_weather", "Hazardous Weather"],
      ] as const
    ).map(([course, label]) => ({
      course,
      label,
      names: goingAdults
        .filter((a) => isCurrent(d.trainings.find((t) => t.adult_id === a.id && t.course === course)))
        .map((a) => `${first(a)} ${a.last_name ?? ""}`.trim()),
    }));
  }

  return { eventId: e.id, going: d.going.length, money: d.money, rows, training };
}

/** The "Ready to go?" report for an event (leaders only; null for anyone else, or once it's over). */
export async function getReadiness(e: PackEvent, me: Adult): Promise<ReadyReport | null> {
  if (!isLeader(me) || !e.rsvp_enabled || e.archived_at || eventOver(e)) return null;
  return build(e, await load(e, canSeeMoney(me)));
}

/**
 * The adults a reminder goes to (leaders only): every active adult in the families on that row,
 * or the adult themself when they answered with no family. Worked out fresh on the server.
 */
export async function reminderAudience(
  e: PackEvent,
  me: Adult,
  kind: ReadyKind,
): Promise<{ families: number; openJobs: number; people: { id: string; email: string; first_name: string; preferred_name: string | null }[] }> {
  const empty = { families: 0, openJobs: 0, people: [] };
  if (!isLeader(me)) return empty;
  if (kind === "pay" && !canSeeMoney(me)) return empty;
  const d = await load(e, kind === "pay");
  const row = build(e, d).rows.find((r) => r.kind === kind);
  if (!row || (kind === "medical" && !row.families.length)) return empty;
  const keys = row.families.map((f) => f.key);
  const famIds = keys.filter((k) => !k.startsWith("a:"));
  const soloIds = keys.filter((k) => k.startsWith("a:")).map((k) => k.slice(2));
  const db = await leaderDb();
  const cols = "id, email, first_name, preferred_name";
  const none = Promise.resolve({ data: [] as unknown[] });
  const [{ data: parents }, { data: solo }] = await Promise.all([
    famIds.length ? db.from("adults").select(cols).in("family_id", famIds).eq("is_active", true) : none,
    soloIds.length ? db.from("adults").select(cols).in("id", soloIds).eq("is_active", true) : none,
  ]);
  const byId = new Map<string, { id: string; email: string; first_name: string; preferred_name: string | null }>();
  for (const a of [...(parents ?? []), ...(solo ?? [])] as { id: string; email: string; first_name: string; preferred_name: string | null }[]) byId.set(a.id, a);
  return { families: keys.length, openJobs: (row.jobs ?? []).reduce((s, j) => s + j.open, 0), people: [...byId.values()] };
}
