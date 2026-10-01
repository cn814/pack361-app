import "server-only";
import { createClient } from "./supabase/server";

export interface VolunteerSlot {
  id: string;
  event_id: string;
  role_title: string;
  shift_label: string | null;
  starts_at: string | null;
  capacity: number;
  is_urgent: boolean;
  notes: string | null;
  people: { adult_id: string; name: string }[];
}

export async function getSlots(eventId: string): Promise<VolunteerSlot[]> {
  const supabase = await createClient();
  const [{ data: slots }, { data: roster }] = await Promise.all([
    supabase
      .from("volunteer_slots")
      .select("id, event_id, role_title, shift_label, starts_at, capacity, is_urgent, notes")
      .eq("event_id", eventId)
      .order("starts_at", { nullsFirst: true })
      .order("created_at"),
    supabase.rpc("volunteer_roster", { p_event_id: eventId }),
  ]);
  const people = (roster ?? []) as { slot_id: string; adult_id: string; name: string }[];
  return ((slots ?? []) as Omit<VolunteerSlot, "people">[]).map((s) => ({
    ...s,
    people: people.filter((p) => p.slot_id === s.id).map(({ adult_id, name }) => ({ adult_id, name })),
  }));
}

export interface OpenJob {
  slot_id: string;
  role_title: string;
  is_urgent: boolean;
  open: number;
  event: { id: string; title: string; category: string; starts_at: string };
}

/** Jobs with open spots at events in the next few weeks (for the home page). */
export async function getOpenJobs(days = 45, limit = 4): Promise<OpenJob[]> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const until = new Date(Date.now() + days * 86400000).toISOString();
  const { data } = await supabase
    .from("volunteer_slots")
    .select("id, role_title, capacity, is_urgent, event:events!inner(id, title, category, starts_at), signups:volunteer_signups(adult_id)")
    .gte("event.starts_at", now)
    .lte("event.starts_at", until)
    .is("event.archived_at", null);
  const rows = (data ?? []) as unknown as {
    id: string;
    role_title: string;
    capacity: number;
    is_urgent: boolean;
    event: OpenJob["event"];
    signups: { adult_id: string }[];
  }[];
  return rows
    .map((r) => ({ slot_id: r.id, role_title: r.role_title, is_urgent: r.is_urgent, open: r.capacity - r.signups.length, event: r.event }))
    .filter((r) => r.open > 0)
    .sort((a, b) => Number(b.is_urgent) - Number(a.is_urgent) || a.event.starts_at.localeCompare(b.event.starts_at))
    .slice(0, limit);
}

export function eventHref(e: { id: string; category: string }) {
  return e.category === "Campout" ? `/campouts/${e.id}` : `/events/${e.id}`;
}

/** When a volunteer job hidden with "Not now" shows again: two days before the event ("" if that's already passed). */
export function jobComesBack(startsAt: string): string {
  const t = Date.parse(startsAt) - 2 * 86400000;
  return t > Date.now() ? new Date(t).toISOString() : "";
}
