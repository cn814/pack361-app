import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PackEvent } from "./types";
import { LEADER_ROLES, type AppRole, type DenRank } from "./types";

// One calendar for everyone: pack-wide events, plus events and den meetings for the dens a
// family belongs to. Leaders see every den. Used by the app pages (signed-in client, RLS
// applies) and by the private calendar feed (secret-key client, filtered here).

export interface CalItem extends PackEvent {
  kind: "event" | "meeting";
  href: string;
  den_name: string | null;
}

/** "all" for leaders; otherwise the dens (and their ranks) of the family's active scouts. */
export type DenScope = "all" | { dens: string[]; ranks: DenRank[] };

export async function denScopeFor(
  db: SupabaseClient,
  adult: { role: AppRole; family_id: string | null },
): Promise<DenScope> {
  if (LEADER_ROLES.includes(adult.role)) return "all";
  if (!adult.family_id) return { dens: [], ranks: [] };
  const { data } = await db
    .from("scouts")
    .select("den:dens(id, rank)")
    .eq("family_id", adult.family_id)
    .eq("is_active", true);
  const dens = ((data ?? []) as unknown as { den: { id: string; rank: DenRank } | null }[]).map((s) => s.den).filter(Boolean) as {
    id: string;
    rank: DenRank;
  }[];
  return { dens: [...new Set(dens.map((d) => d.id))], ranks: [...new Set(dens.map((d) => d.rank))] };
}

/** YYYY-MM-DD in Eastern time. */
export function easternDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
}

/** A wall-clock date and time in Eastern time, as an ISO timestamp. */
export function easternToIso(date: string, time: string): string {
  const [h, m] = time.split(":").map(Number);
  // Find the Eastern offset on that date (EDT -4 / EST -5).
  const probe = new Date(`${date}T12:00:00Z`);
  const off = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")!
    .value.replace("GMT", "");
  const hours = Number(off || 0);
  const utc = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h - hours, m);
  return new Date(utc).toISOString();
}

const EVENT_COLS =
  "id, title, category, starts_at, ends_at, location_name, address, details, signup_url, den_id, ranks, all_day, leaders_only, den:dens(name)";

const RANK_NAME: Record<DenRank, string> = { lion: "Lions", tiger: "Tigers", wolf: "Wolves", bear: "Bears", webelos: "Webelos", aol: "AOL" };
export function ranksLabel(ranks: DenRank[] | null | undefined): string | null {
  return ranks?.length ? ranks.map((r) => RANK_NAME[r]).join(" & ") : null;
}
const MEETING_COLS =
  "id, den_id, meets_on, title, adventure, location, address, family_note, start_time, end_time, den:dens(name, meeting_info)";

export async function loadCalendar(
  db: SupabaseClient,
  scope: DenScope,
  opts: { since: string; limit?: number },
): Promise<CalItem[]> {
  const limit = opts.limit ?? 100;
  let evq = db.from("events").select(EVENT_COLS).gte("starts_at", opts.since).order("starts_at").limit(limit);
  if (scope !== "all") {
    const parts = ["and(den_id.is.null,ranks.is.null)"];
    if (scope.dens.length) parts.push(`den_id.in.(${scope.dens.join(",")})`);
    if (scope.ranks.length) parts.push(`ranks.ov.{${scope.ranks.join(",")}}`);
    evq = evq.or(parts.join(",")).eq("leaders_only", false);
  }
  const sinceDate = easternDate(opts.since);
  let mq = db.from("den_meetings").select(MEETING_COLS).gte("meets_on", sinceDate).order("meets_on").limit(limit);
  if (scope !== "all") mq = mq.in("den_id", scope.dens.length ? scope.dens : ["00000000-0000-0000-0000-000000000000"]);
  const [{ data: events }, { data: meetings }] = await Promise.all([evq, mq]);

  const items: CalItem[] = [
    ...((events ?? []) as unknown as (PackEvent & { den: { name: string } | null })[]).map((e) => ({
      ...e,
      kind: "event" as const,
      href: e.category === "Campout" ? `/campouts/${e.id}` : `/events/${e.id}`,
      den_name: e.den?.name ?? ranksLabel(e.ranks),
    })),
    ...((meetings ?? []) as unknown as {
      id: string;
      den_id: string;
      meets_on: string;
      title: string;
      adventure: string | null;
      location: string | null;
      address: string | null;
      family_note: string | null;
      start_time: string | null;
      end_time: string | null;
      den: { name: string; meeting_info: string | null } | null;
    }[]).map((m) => ({
      id: m.id,
      kind: "meeting" as const,
      href: `/meetings/${m.id}`,
      title: m.title,
      category: "Den Meeting",
      starts_at: easternToIso(m.meets_on, m.start_time ?? "18:30"),
      ends_at: m.end_time ? easternToIso(m.meets_on, m.end_time) : null,
      location_name: m.location,
      address: m.address,
      details: [m.adventure ? `Adventure: ${m.adventure}` : null, m.family_note].filter(Boolean).join("\n") || null,
      signup_url: null,
      all_day: false,
      den_id: m.den_id,
      den_name: m.den?.name ?? null,
    })),
  ];
  // A family whose dens all meet somewhere else that night doesn't need the pack-wide
  // "Den Meetings" night on its calendar.
  const visible =
    scope === "all"
      ? items
      : items.filter((i) => {
          if (i.kind !== "event" || i.category !== "Den Meeting" || i.den_id || i.ranks?.length) return true;
          const day = easternDate(i.starts_at);
          const elsewhere = new Set(items.filter((m) => m.kind === "meeting" && easternDate(m.starts_at) === day).map((m) => m.den_id));
          return !(scope.dens.length && scope.dens.every((d) => elsewhere.has(d)));
        });
  return visible
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, limit);
}
