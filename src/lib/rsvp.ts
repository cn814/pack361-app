import "server-only";
import { createClient } from "./supabase/server";
import { easternDate } from "./tz";
import { eventOver } from "./format";
import type { PackEvent } from "./types";

export interface MyRsvp {
  status: "yes" | "maybe" | "no";
  scouts: number;
  adults: number;
  note: string | null;
  /** Said yes, but the event was full: on the waitlist (still "yes"). */
  waitlisted?: boolean;
  /** Place on the waitlist (1 = next in). */
  waitlist_spot?: number | null;
}
export interface RsvpCounts {
  /** Families who are in (waitlisted families are counted apart). */
  families_yes: number;
  families_maybe: number;
  families_no: number;
  scouts: number;
  adults: number;
  families_waitlist: number;
  waitlist_people: number;
  /** Most people (scouts + adults) who can come; null = no limit. */
  rsvp_limit: number | null;
}
export interface RsvpRow extends MyRsvp {
  name: string;
  updated_at: string;
  waitlisted_at?: string | null;
}

/** Spots left under the limit (never below 0), or null with no limit. */
export function spotsLeft(c: Pick<RsvpCounts, "rsvp_limit" | "scouts" | "adults">): number | null {
  return c.rsvp_limit == null ? null : Math.max(c.rsvp_limit - c.scouts - c.adults, 0);
}

/** Can families still answer? */
export function rsvpOpen(e: Pick<PackEvent, "rsvp_enabled" | "rsvp_by" | "archived_at" | "starts_at" | "ends_at" | "all_day">): boolean {
  if (!e.rsvp_enabled || e.archived_at) return false;
  // All-day events stay open through the end of their (last) day, not midnight that morning.
  if (eventOver(e)) return false;
  return !e.rsvp_by || e.rsvp_by >= easternDate(Date.now());
}

export async function getRsvp(eventId: string, me: { id: string; family_id: string | null }, leader: boolean) {
  const supabase = await createClient();
  const mineQ = supabase.from("event_rsvps").select("status, scouts, adults, note, waitlisted").eq("event_id", eventId);
  const [{ data: mine }, { data: counts }, list] = await Promise.all([
    me.family_id ? mineQ.eq("family_id", me.family_id).maybeSingle() : mineQ.is("family_id", null).eq("adult_id", me.id).maybeSingle(),
    supabase.rpc("rsvp_counts", { p_event_id: eventId }),
    leader
      ? supabase
          .from("event_rsvps")
          .select(
            "status, scouts, adults, note, waitlisted, waitlisted_at, updated_at, family:families(family_name), adult:adults(first_name, preferred_name, last_name)",
          )
          .eq("event_id", eventId)
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const c: Partial<RsvpCounts> & { my_waitlist_spot?: number | null } = ((counts ?? []) as RsvpCounts[])[0] ?? {};
  const rows: RsvpRow[] = ((list.data ?? []) as unknown as (MyRsvp & {
    updated_at: string;
    waitlisted_at: string | null;
    family: { family_name: string } | null;
    adult: { first_name: string; preferred_name: string | null; last_name: string } | null;
  })[]).map((r) => ({
    status: r.status,
    scouts: r.scouts,
    adults: r.adults,
    note: r.note,
    waitlisted: Boolean(r.waitlisted),
    waitlisted_at: r.waitlisted_at,
    updated_at: r.updated_at,
    name: r.family
      ? `${r.family.family_name} family`
      : r.adult
        ? `${r.adult.preferred_name || r.adult.first_name} ${r.adult.last_name}`
        : "Someone",
  }));
  // Leaders: the waitlist in line order, after everyone else.
  const waiting = rows.filter((r) => r.waitlisted).sort((a, b) => (a.waitlisted_at ?? "").localeCompare(b.waitlisted_at ?? ""));
  const m = (mine as MyRsvp | null) ?? null;
  return {
    mine: m ? { ...m, waitlisted: Boolean(m.waitlisted), waitlist_spot: m.waitlisted ? Number(c.my_waitlist_spot ?? 0) || null : null } : null,
    counts: {
      families_yes: Number(c.families_yes ?? 0),
      families_maybe: Number(c.families_maybe ?? 0),
      families_no: Number(c.families_no ?? 0),
      scouts: Number(c.scouts ?? 0),
      adults: Number(c.adults ?? 0),
      families_waitlist: Number(c.families_waitlist ?? 0),
      waitlist_people: Number(c.waitlist_people ?? 0),
      rsvp_limit: c.rsvp_limit == null ? null : Number(c.rsvp_limit),
    } satisfies RsvpCounts,
    rows: [...rows.filter((r) => !r.waitlisted), ...waiting],
  };
}
