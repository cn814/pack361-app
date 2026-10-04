import "server-only";
import { createClient } from "./supabase/server";
import type { PackEvent } from "./types";

// Carpool board on events and den meetings that involve driving. events.carpool: true/false = a
// leader turned it on or off for this event; null = decided here: on for events with a place to
// drive to (den meetings only when they have an address, meaning off-site), off for pack and
// committee meetings and leaders-only events. Den meetings planned in the app: on when they have
// an address (the meeting form's "Address (for off-site meetings)").

/** Regular meetings at the usual place: no carpool board unless a leader turns it on. */
const NO_DRIVE = new Set(["Pack Meeting", "Committee", "Leaders"]);

export function carpoolOn(e: Pick<PackEvent, "category" | "location_name" | "address" | "leaders_only"> & { carpool?: boolean | null }): boolean {
  if (e.carpool === true || e.carpool === false) return e.carpool;
  if (e.leaders_only || NO_DRIVE.has(e.category)) return false;
  if (e.category === "Den Meeting") return Boolean(e.address?.trim());
  return Boolean(e.location_name?.trim() || e.address?.trim());
}

/** What a carpool board is on: a calendar event or a den meeting planned in the app. */
export type CarpoolTarget = { kind: "event"; id: string } | { kind: "meeting"; id: string };

export interface CarpoolPost {
  id: string;
  kind: "offer" | "need";
  seats: number;
  leaving_from: string | null;
  contact: string | null;
  note: string | null;
  updated_at: string;
  name: string;
  family_name: string | null;
  mine: boolean;
}

export async function getCarpoolBoard(target: CarpoolTarget): Promise<CarpoolPost[]> {
  const supabase = await createClient();
  const { data } =
    target.kind === "event"
      ? await supabase.rpc("event_carpool_board", { p_event_id: target.id })
      : await supabase.rpc("meeting_carpool_board", { p_meeting_id: target.id });
  return ((data ?? []) as CarpoolPost[]).map((p) => ({ ...p, seats: Number(p.seats) }));
}
