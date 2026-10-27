import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { adminConfigured, createAdminClient } from "./supabase/admin";
import { sendPushTo } from "./push";
import { notifyAdmins } from "./notify";
import { addDays, easternDate } from "./tz";

// The pack gear closet: tents, cooking kits, spare uniforms and the like that families can
// borrow. Families ask; leaders approve, hand out and check back in (/gear/manage).

export const GEAR_CATEGORIES = ["Tents", "Sleeping", "Cooking", "Activities", "Recruitment", "Uniforms", "Other"] as const;
export type GearCategory = (typeof GEAR_CATEGORIES)[number];

export type LoanStatus = "requested" | "approved" | "declined" | "out" | "returned";

export const LOAN_STATUS_LABEL: Record<LoanStatus, string> = {
  requested: "Waiting",
  approved: "Ready to pick up",
  declined: "Declined",
  out: "Picked up",
  returned: "Returned",
};

export const LOAN_STATUS_STYLE: Record<LoanStatus, string> = {
  requested: "bg-gold-50 text-gold-800",
  approved: "bg-mint text-pine",
  declined: "bg-danger-50 text-danger",
  out: "bg-surface text-navy",
  returned: "bg-surface text-muted",
};

/** Days between overdue reminders for one loan. */
export const GEAR_REMINDER_DAYS = 3;

export interface GearItem {
  id: string;
  name: string;
  category: GearCategory;
  description: string | null;
  quantity: number;
  condition_note: string | null;
  /** Where it's kept between campouts: "Pack shed", "At the Greenspoon house". */
  location: string | null;
  active: boolean;
  /** Not spoken for by an approved or picked-up loan. */
  available: number;
}

export interface GearLoan {
  id: string;
  item_id: string;
  family_id: string;
  quantity: number;
  status: LoanStatus;
  requested_at: string;
  needed_on: string | null;
  due_on: string;
  out_at: string | null;
  returned_at: string | null;
  note: string | null;
  leader_note: string | null;
  item: { name: string; category: string } | null;
  event: { id: string; title: string; category: string; starts_at: string } | null;
}

/** A loan as leaders see it: with the family name and who asked (no contact details). */
export interface ManagedLoan extends GearLoan {
  family: { family_name: string } | null;
  adult: { first_name: string; preferred_name: string | null; last_name: string } | null;
}

const ITEM_COLS = "id, name, category, description, quantity, condition_note, location, active";
const LOAN_COLS =
  "id, item_id, family_id, quantity, status, requested_at, needed_on, due_on, out_at, returned_at, note, leader_note, item:gear_items(name, category), event:events(id, title, category, starts_at)";

/** Today's date in Eastern time (YYYY-MM-DD). */
export function gearToday(): string {
  return easternDate(Date.now());
}

export function isOverdue(l: { status: LoanStatus; due_on: string }, today = gearToday()): boolean {
  return l.status === "out" && l.due_on < today;
}

/** The closet with what's left of each item. `all` includes put-away items (leaders). */
export async function getGearItems(opts: { all?: boolean } = {}): Promise<GearItem[]> {
  const supabase = await createClient();
  let q = supabase.from("gear_items").select(ITEM_COLS).order("category").order("name");
  if (!opts.all) q = q.eq("active", true);
  const [{ data }, { data: used }] = await Promise.all([q, supabase.rpc("gear_in_use")]);
  const inUse = new Map(((used ?? []) as { item_id: string; in_use: number }[]).map((u) => [u.item_id, u.in_use]));
  return ((data ?? []) as Omit<GearItem, "available">[]).map((i) => ({
    ...i,
    available: Math.max(0, i.quantity - (inUse.get(i.id) ?? 0)),
  }));
}

export async function getGearItem(id: string): Promise<GearItem | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const [{ data }, { data: used }] = await Promise.all([
    supabase.from("gear_items").select(ITEM_COLS).eq("id", id).maybeSingle(),
    supabase.rpc("gear_in_use"),
  ]);
  if (!data) return null;
  const n = ((used ?? []) as { item_id: string; in_use: number }[]).find((u) => u.item_id === id)?.in_use ?? 0;
  const item = data as Omit<GearItem, "available">;
  return { ...item, available: Math.max(0, item.quantity - n) };
}

/** The signed-in family's requests and loans, newest first. */
export async function getFamilyLoans(familyId: string | null): Promise<GearLoan[]> {
  if (!familyId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("gear_loans")
    .select(LOAN_COLS)
    .eq("family_id", familyId)
    .order("requested_at", { ascending: false })
    .limit(30);
  return (data ?? []) as unknown as GearLoan[];
}

/** For leaders: everything waiting, ready or out, plus the last few that finished. */
export async function getManagedLoans(): Promise<{ open: ManagedLoan[]; recent: ManagedLoan[] }> {
  const supabase = await createClient();
  const [{ data: open }, { data: recent }] = await Promise.all([
    supabase.from("gear_loans").select(LOAN_COLS).in("status", ["requested", "approved", "out"]).order("due_on").limit(200),
    supabase.from("gear_loans").select(LOAN_COLS).in("status", ["returned", "declined"]).order("requested_at", { ascending: false }).limit(15),
  ]);
  // Family names come from gear_borrowers(): a quartermaster who isn't a leader can't read
  // other families' rows directly.
  const all = [...(open ?? []), ...(recent ?? [])] as unknown as GearLoan[];
  const { data: people } = all.length
    ? await supabase.rpc("gear_borrowers", { p_loan_ids: all.map((l) => l.id) })
    : { data: [] };
  const byLoan = new Map(
    ((people ?? []) as { loan_id: string; family_name: string; first_name: string | null; preferred_name: string | null; last_name: string | null }[]).map((p) => [
      p.loan_id,
      p,
    ]),
  );
  const named = (rows: unknown[] | null): ManagedLoan[] =>
    ((rows ?? []) as GearLoan[]).map((l) => {
      const p = byLoan.get(l.id);
      return {
        ...l,
        family: p ? { family_name: p.family_name } : null,
        adult: p?.first_name ? { first_name: p.first_name, preferred_name: p.preferred_name, last_name: p.last_name ?? "" } : null,
      };
    });
  return { open: named(open), recent: named(recent) };
}

/** How many requests are waiting for a leader (for menus). */
export async function countWaitingGear(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("gear_loans").select("id", { count: "exact", head: true }).eq("status", "requested");
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Notifications (best effort; never block saving)
// ---------------------------------------------------------------------------

/** Active adults in a family, read with the secret key (leaders' sessions can't always). */
async function familyAdultIds(db: SupabaseClient, familyId: string): Promise<string[]> {
  const { data } = await db.from("adults").select("id").eq("family_id", familyId).eq("is_active", true);
  return ((data ?? []) as { id: string }[]).map((a) => a.id);
}

/**
 * Who hears about new gear requests: the quartermaster (any role, by pack position), and leaders
 * whose position mentions gear. With none on the roster, the pack admins and Cubmaster.
 */
async function gearKeepers(db: SupabaseClient): Promise<string[]> {
  const [{ data: qm }, { data: gear }] = await Promise.all([
    db.from("adults").select("id").eq("is_active", true).ilike("position_title", "%quartermaster%"),
    db.from("adults").select("id").in("role", ["den_leader", "committee", "cubmaster", "admin"]).eq("is_active", true).ilike("position_title", "%gear%"),
  ]);
  return [...new Set([...(qm ?? []), ...(gear ?? [])].map((a) => (a as { id: string }).id))];
}

/** A family asked to borrow something: a phone alert for whoever looks after the gear. */
export async function notifyGearRequest(r: { family: string; item: string; quantity: number; requesterId: string }) {
  try {
    if (!adminConfigured()) return;
    const push = {
      title: "Gear request",
      body: `The ${r.family} family asked to borrow ${r.quantity > 1 ? `${r.quantity} × ` : ""}${r.item}.`,
      url: "/gear/manage",
      tag: "gear-request",
    };
    const keepers = (await gearKeepers(createAdminClient())).filter((id) => id !== r.requesterId);
    if (keepers.length) await sendPushTo(keepers, push);
    else await notifyAdmins(push);
  } catch {
    // Best effort.
  }
}

/** Tell the family their request was approved or declined. */
export async function notifyGearDecision(loanId: string) {
  try {
    if (!adminConfigured()) return;
    const db = createAdminClient();
    const { data } = await db
      .from("gear_loans")
      .select("id, family_id, quantity, status, needed_on, leader_note, item:gear_items(name)")
      .eq("id", loanId)
      .maybeSingle();
    const l = data as unknown as {
      family_id: string;
      quantity: number;
      status: LoanStatus;
      needed_on: string | null;
      leader_note: string | null;
      item: { name: string } | null;
    } | null;
    if (!l || (l.status !== "approved" && l.status !== "declined")) return;
    const what = `${l.quantity > 1 ? `${l.quantity} × ` : ""}${l.item?.name ?? "gear"}`;
    const body =
      l.status === "approved"
        ? `${what} is ready for you. The quartermaster will get it to you${l.needed_on ? ` by ${shortDay(l.needed_on)}` : ""}.`
        : // The leader's note stays in the app, not on the lock screen.
          `Sorry, ${what} isn't available.${l.leader_note ? " A leader left a note." : ""}`;
    await sendPushTo(await familyAdultIds(db, l.family_id), {
      title: l.status === "approved" ? "Gear request approved" : "Gear request declined",
      body: body.slice(0, 180),
      url: "/gear",
      tag: `gear-${loanId}`,
    });
  } catch {
    // Best effort.
  }
}

function shortDay(d: string) {
  return new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Daily job
// ---------------------------------------------------------------------------

/**
 * Daily (cron, secret-key client): a phone reminder to the borrowing family for gear that's
 * past its return date, at most once every few days per loan. A reminder only counts once it
 * reached a phone; otherwise it's tried again on the next run.
 */
export async function gearJob(db: SupabaseClient): Promise<{ reminded: number; errors?: string[] }> {
  const today = gearToday();
  const since = new Date(Date.now() - GEAR_REMINDER_DAYS * 86400000 + 3600000).toISOString();
  const { data, error } = await db
    .from("gear_loans")
    .select("id, family_id, quantity, due_on, reminded_at, item:gear_items(name)")
    .eq("status", "out")
    .lt("due_on", today)
    .or(`reminded_at.is.null,reminded_at.lt.${since}`)
    .limit(200);
  if (error) return { reminded: 0, errors: [error.message] };
  const loans = (data ?? []) as unknown as { id: string; family_id: string; quantity: number; due_on: string; item: { name: string } | null }[];
  let reminded = 0;
  const errors: string[] = [];
  for (const l of loans) {
    const adults = await familyAdultIds(db, l.family_id);
    if (!adults.length) continue;
    const what = `${l.quantity > 1 ? `${l.quantity} × ` : ""}${l.item?.name ?? "pack gear"}`;
    const late = Math.max(1, Math.round((Date.parse(today) - Date.parse(l.due_on)) / 86400000));
    const res = await sendPushTo(adults, {
      title: "Time to bring back pack gear",
      body: `${what} was due back ${late === 1 ? "yesterday" : `${shortDay(l.due_on)}`}. Please return it to the quartermaster, or ask for more time.`,
      url: "/gear",
      tag: `gear-due-${l.id}`,
    });
    errors.push(...res.errors);
    if (!res.sent) continue;
    const { error: upd } = await db.from("gear_loans").update({ reminded_at: new Date().toISOString() }).eq("id", l.id);
    if (upd) errors.push(upd.message);
    else reminded++;
  }
  const unique = [...new Set(errors)];
  return unique.length ? { reminded, errors: unique } : { reminded };
}

/** Default return date for a new request: two days after the event, or a week from today. */
export function defaultDueOn(eventStartsAt?: string | null): string {
  return eventStartsAt ? addDays(easternDate(eventStartsAt), 2) : addDays(gearToday(), 7);
}
