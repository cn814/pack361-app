import "server-only";
import { cookies } from "next/headers";
import { LEADER_ROLES, type Adult } from "./types";

// Leaders are parents too: a Family / Leader switch (Home, the computer sidebar) picks which
// version of Home, Scouts and Pack they see. Remembered per device. Parents never see it.
// It changes what pages show, never what someone may do (the database checks their role).

export const MODE_COOKIE = "pack_mode";
export type Mode = "family" | "leader";

/** Can this person switch to Leader mode? */
export function canLead(me: Adult) {
  return LEADER_ROLES.includes(me.role);
}

/** Family or Leader mode. Leaders start in Leader mode. */
export async function getMode(me: Adult): Promise<Mode> {
  if (!canLead(me)) return "family";
  return (await cookies()).get(MODE_COOKIE)?.value === "family" ? "family" : "leader";
}
