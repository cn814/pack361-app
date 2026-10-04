import "server-only";
import { createClient } from "./supabase/server";
import type { PackEvent } from "./types";

// Carpool board on events that involve driving. events.carpool: true/false = a leader turned it
// on or off for this event; null = decided here: on for events with a place to drive to, off for
// regular meetings and leaders-only events.

/** Categories that are regular meetings at the usual place: no carpool board unless turned on. */
const NO_DRIVE = new Set(["Pack Meeting", "Den Meeting", "Committee", "Leaders"]);

export function carpoolOn(e: Pick<PackEvent, "category" | "location_name" | "address" | "leaders_only"> & { carpool?: boolean | null }): boolean {
  if (e.carpool === true || e.carpool === false) return e.carpool;
  if (e.leaders_only || NO_DRIVE.has(e.category)) return false;
  return Boolean(e.location_name?.trim() || e.address?.trim());
}

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

export async function getCarpoolBoard(eventId: string): Promise<CarpoolPost[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("event_carpool_board", { p_event_id: eventId });
  return ((data ?? []) as CarpoolPost[]).map((p) => ({ ...p, seats: Number(p.seats) }));
}

/** A contact someone typed: a tel: or mailto: link when it looks like a phone number or email. */
export function contactHref(contact: string): string | null {
  const c = contact.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return `mailto:${c}`;
  const digits = c.replace(/[^\d+]/g, "");
  if (/^\+?\d{10,15}$/.test(digits) && !/[a-z]/i.test(c)) return `tel:${digits}`;
  return null;
}
