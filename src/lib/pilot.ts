import "server-only";
import { cache } from "react";
import { adminConfigured, createAdminClient } from "./supabase/admin";
import { getTesters } from "./beta";
import { isBeta } from "./version";
import { parsePilot, pilotAllows, pilotEmailAllowed, type Pilot } from "./pilot-rules";
import { LEADER_ROLES, type AppRole } from "./types";

// Pilot only (Pack admin → Pilot only): until the pack committee adopts the app, only leaders and
// the people an admin picks can use it. Everyone else who signs in sees /not-yet, and the app's
// emails and phone alerts skip them. Rules in pilot-rules.ts.

/** The pilot settings, read once per request. */
export const getPilot = cache(async (): Promise<Pilot> => {
  if (!adminConfigured()) return parsePilot("", "");
  const { data } = await createAdminClient().from("pack_settings").select("key, value").in("key", ["pilot_only", "pilot_people"]);
  const value = (k: string) => (data ?? []).find((r) => r.key === k)?.value as string | undefined;
  return parsePilot(value("pilot_only"), value("pilot_people"));
});

/** Can this adult use the app now? Pass their roster role, not a "View as" one. */
export async function pilotLetsIn(adult: { id: string; role: AppRole | null | undefined }): Promise<boolean> {
  return pilotAllows(await getPilot(), adult);
}

/** Active roster adults by email, to tell which addresses the pilot holds back. */
const getRosterByEmail = cache(async (): Promise<Map<string, { id: string; role: AppRole }>> => {
  const out = new Map<string, { id: string; role: AppRole }>();
  if (!adminConfigured()) return out;
  const { data } = await createAdminClient().from("adults").select("id, email, role").eq("is_active", true);
  for (const a of (data ?? []) as { id: string; email: string | null; role: AppRole }[]) {
    if (a.email) out.set(a.email.trim().toLowerCase(), { id: a.id, role: a.role });
  }
  return out;
});

/**
 * Who the app's emails may reach: on the beta site, its testers; while the pilot runs, everyone
 * but the roster adults it keeps out.
 */
export async function allowedEmails<T>(list: T[], email: (x: T) => string): Promise<T[]> {
  if (isBeta()) {
    const t = await getTesters();
    return list.filter((x) => t.emails.has(email(x).toLowerCase()));
  }
  const pilot = await getPilot();
  if (!pilot.on) return list;
  const roster = await getRosterByEmail();
  return list.filter((x) => pilotEmailAllowed(pilot, email(x), roster));
}

/** The same for phone alerts: adult ids (null = "everyone") narrowed to who may get them. */
export async function allowedAdults(ids: string[] | null): Promise<string[] | null> {
  if (isBeta()) {
    const t = await getTesters();
    return ids ? ids.filter((id) => t.ids.has(id)) : [...t.ids];
  }
  const pilot = await getPilot();
  if (!pilot.on) return ids;
  if (ids) {
    if (!adminConfigured()) return ids;
    const { data } = await createAdminClient().from("adults").select("id, role").in("id", ids);
    return ((data ?? []) as { id: string; role: AppRole }[]).filter((a) => pilotAllows(pilot, a)).map((a) => a.id);
  }
  if (!adminConfigured()) return null;
  const { data } = await createAdminClient()
    .from("adults")
    .select("id, role")
    .eq("is_active", true)
    .or(`role.in.(${LEADER_ROLES.join(",")})${pilot.people.size ? `,id.in.(${[...pilot.people].join(",")})` : ""}`);
  return ((data ?? []) as { id: string }[]).map((a) => a.id);
}
