import "server-only";
import { createClient } from "./supabase/server";
import type { PackingItem } from "./types";

/** An event that can be copied from: what it has, so the leader knows what they'll get. */
export interface PlanSource {
  id: string;
  title: string;
  category: string;
  starts_at: string;
  schedule: number;
  packing: number;
  sections: number;
  links: number;
}

/** The event's own packing list (no fallback to the pack's standard campout list). */
export async function getOwnPackingList(eventId: string): Promise<PackingItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("packing_items")
    .select("id, category, label, detail, required, sort_order")
    .eq("event_id", eventId)
    .order("sort_order")
    .order("id");
  return (data ?? []) as PackingItem[];
}

/** How many items the pack's standard campout packing list has. */
export async function getStandardPackingCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("packing_items").select("id", { count: "exact", head: true }).is("event_id", null);
  return count ?? 0;
}

/** Other events with a schedule, packing list, sections or links to start from, newest first. */
export async function getPlanSources(exceptId: string, limit = 40): Promise<PlanSource[]> {
  const supabase = await createClient();
  const [{ data: events }, { data: sched }, { data: pack }] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, category, starts_at, sections, links")
      .neq("id", exceptId)
      .order("starts_at", { ascending: false })
      .limit(400),
    supabase.from("itinerary_items").select("event_id"),
    supabase.from("packing_items").select("event_id").not("event_id", "is", null),
  ]);
  const tally = (rows: { event_id: string | null }[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) if (r.event_id) m.set(r.event_id, (m.get(r.event_id) ?? 0) + 1);
    return m;
  };
  const s = tally(sched);
  const p = tally(pack);
  return (events ?? [])
    .map((e) => ({
      id: e.id as string,
      title: e.title as string,
      category: e.category as string,
      starts_at: e.starts_at as string,
      schedule: s.get(e.id) ?? 0,
      packing: p.get(e.id) ?? 0,
      sections: Array.isArray(e.sections) ? e.sections.length : 0,
      links: Array.isArray(e.links) ? e.links.length : 0,
    }))
    .filter((e) => e.schedule + e.packing + e.sections + e.links > 0)
    .slice(0, limit);
}

/**
 * Event fields the shared event read doesn't include yet: the series and the RSVP limit
 * (that column comes with the RSVP waitlist update; null until then). Also how many other
 * upcoming events are in the same series.
 */
export async function getEventExtras(
  id: string,
): Promise<{ series_id: string | null; rsvp_limit: number | null; series_upcoming: number }> {
  const supabase = await createClient();
  const { data } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
  const row = (data ?? {}) as { series_id?: string | null; rsvp_limit?: number | null };
  const seriesId = row.series_id ?? null;
  let upcoming = 0;
  if (seriesId) {
    const { count } = await supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("series_id", seriesId)
      .neq("id", id)
      .is("archived_at", null)
      .gt("starts_at", new Date().toISOString());
    upcoming = count ?? 0;
  }
  return { series_id: seriesId, rsvp_limit: typeof row.rsvp_limit === "number" ? row.rsvp_limit : null, series_upcoming: upcoming };
}
