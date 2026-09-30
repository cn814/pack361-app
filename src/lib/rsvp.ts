import "server-only";
import { createClient } from "./supabase/server";
import { easternDate } from "./tz";
import type { PackEvent } from "./types";

export interface MyRsvp {
  status: "yes" | "maybe" | "no";
  scouts: number;
  adults: number;
  note: string | null;
}
export interface RsvpCounts {
  families_yes: number;
  families_maybe: number;
  families_no: number;
  scouts: number;
  adults: number;
}
export interface RsvpRow extends MyRsvp {
  name: string;
  updated_at: string;
}

/** Can families still answer? */
export function rsvpOpen(e: Pick<PackEvent, "rsvp_enabled" | "rsvp_by" | "archived_at" | "starts_at" | "ends_at">): boolean {
  if (!e.rsvp_enabled || e.archived_at) return false;
  if (Date.parse(e.ends_at ?? e.starts_at) < Date.now()) return false;
  return !e.rsvp_by || e.rsvp_by >= easternDate(Date.now());
}

export async function getRsvp(eventId: string, me: { id: string; family_id: string | null }, leader: boolean) {
  const supabase = await createClient();
  const mineQ = supabase.from("event_rsvps").select("status, scouts, adults, note").eq("event_id", eventId);
  const [{ data: mine }, { data: counts }, list] = await Promise.all([
    me.family_id ? mineQ.eq("family_id", me.family_id).maybeSingle() : mineQ.is("family_id", null).eq("adult_id", me.id).maybeSingle(),
    supabase.rpc("rsvp_counts", { p_event_id: eventId }),
    leader
      ? supabase
          .from("event_rsvps")
          .select("status, scouts, adults, note, updated_at, family:families(family_name), adult:adults(first_name, preferred_name, last_name)")
          .eq("event_id", eventId)
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const c = ((counts ?? []) as RsvpCounts[])[0] ?? { families_yes: 0, families_maybe: 0, families_no: 0, scouts: 0, adults: 0 };
  const rows: RsvpRow[] = ((list.data ?? []) as unknown as (MyRsvp & {
    updated_at: string;
    family: { family_name: string } | null;
    adult: { first_name: string; preferred_name: string | null; last_name: string } | null;
  })[]).map((r) => ({
    status: r.status,
    scouts: r.scouts,
    adults: r.adults,
    note: r.note,
    updated_at: r.updated_at,
    name: r.family
      ? `${r.family.family_name} family`
      : r.adult
        ? `${r.adult.preferred_name || r.adult.first_name} ${r.adult.last_name}`
        : "Someone",
  }));
  return {
    mine: (mine as MyRsvp | null) ?? null,
    counts: {
      families_yes: Number(c.families_yes),
      families_maybe: Number(c.families_maybe),
      families_no: Number(c.families_no),
      scouts: Number(c.scouts),
      adults: Number(c.adults),
    },
    rows,
  };
}
