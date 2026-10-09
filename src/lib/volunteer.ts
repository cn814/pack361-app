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

export interface MyJob {
  slot_id: string;
  role_title: string;
  shift_label: string | null;
  when: string;
  /** First name of the family member signed up, when it isn't you. */
  who: string | null;
  event: { id: string; title: string; category: string; starts_at: string };
}

/** Upcoming volunteer jobs you or your family signed up for in the app (for the home page). */
export async function getMyJobs(me: { id: string; family_id: string | null }): Promise<MyJob[]> {
  const supabase = await createClient();
  const today = new Date(Date.now() - 86400000).toISOString();
  let q = supabase
    .from("volunteer_signups")
    .select(
      "adult_id, adult:adults!inner(first_name, preferred_name, family_id), slot:volunteer_slots!inner(id, role_title, shift_label, starts_at, event:events!inner(id, title, category, starts_at, ends_at, archived_at))",
    );
  q = me.family_id ? q.eq("adult.family_id", me.family_id) : q.eq("adult_id", me.id);
  const { data } = await q;
  const rows = (data ?? []) as unknown as {
    adult_id: string;
    adult: { first_name: string; preferred_name: string | null };
    slot: {
      id: string;
      role_title: string;
      shift_label: string | null;
      starts_at: string | null;
      event: { id: string; title: string; category: string; starts_at: string; ends_at: string | null; archived_at: string | null };
    };
  }[];
  return rows
    .filter((r) => !r.slot.event.archived_at)
    .map((r) => ({
      slot_id: r.slot.id,
      role_title: r.slot.role_title,
      shift_label: r.slot.shift_label,
      when: r.slot.starts_at ?? r.slot.event.starts_at,
      ends: r.slot.event.ends_at ?? r.slot.event.starts_at,
      who: r.adult_id === me.id ? null : r.adult.preferred_name || r.adult.first_name,
      event: { id: r.slot.event.id, title: r.slot.event.title, category: r.slot.event.category, starts_at: r.slot.event.starts_at },
    }))
    .filter((j) => j.ends >= today)
    .sort((a, b) => a.when.localeCompare(b.when) || a.role_title.localeCompare(b.role_title))
    .map((j) => ({ slot_id: j.slot_id, role_title: j.role_title, shift_label: j.shift_label, when: j.when, who: j.who, event: j.event }));
}

export function eventHref(e: { id: string; category: string }) {
  return e.category === "Campout" ? `/campouts/${e.id}` : `/events/${e.id}`;
}

/** When a volunteer job hidden with "Not now" shows again: two days before the event ("" if that's already passed). */
export function jobComesBack(startsAt: string): string {
  const t = Date.parse(startsAt) - 2 * 86400000;
  return t > Date.now() ? new Date(t).toISOString() : "";
}
