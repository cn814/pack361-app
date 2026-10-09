// Pilot only (Pack admin → Pilot only): until the pack committee adopts the app, only leaders
// and the people an admin picks can use it. These are the rules; pilot.ts reads the settings.

import { LEADER_ROLES, type AppRole } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Pilot {
  on: boolean;
  /** Adults picked in Pack admin, besides leaders. */
  people: Set<string>;
}

export function parsePilot(onValue: string | null | undefined, peopleValue: string | null | undefined): Pilot {
  const people = String(peopleValue ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => UUID.test(s));
  return { on: String(onValue ?? "").trim() === "on", people: new Set(people) };
}

/** Can this adult use the app? `role` is their roster role, not a "View as" role. */
export function pilotAllows(pilot: Pilot, adult: { id: string; role: AppRole | null | undefined }): boolean {
  if (!pilot.on) return true;
  if (adult.role && LEADER_ROLES.includes(adult.role)) return true;
  return pilot.people.has(adult.id.toLowerCase());
}

/**
 * Who an email may go to while the pilot runs: anyone except roster adults the pilot keeps out
 * (a family asking to join isn't on the roster yet, so a reply to them still goes).
 */
export function pilotEmailAllowed(
  pilot: Pilot,
  email: string,
  roster: Map<string, { id: string; role: AppRole }>,
): boolean {
  if (!pilot.on) return true;
  const adult = roster.get(email.trim().toLowerCase());
  return !adult || pilotAllows(pilot, adult);
}
