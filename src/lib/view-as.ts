// "View as": leaders can see the app the way a parent, den leader or pack leadership sees it.
// It only changes what the pages show; the database still checks the person's real permissions.
import type { AppRole } from "./types";

export const VIEW_AS_COOKIE = "pack_view_as";

const RANK: Record<AppRole, number> = { parent: 0, den_leader: 1, committee: 2, cubmaster: 3, admin: 3 };

export const VIEW_AS_LABEL: Partial<Record<AppRole, string>> = {
  parent: "a parent",
  den_leader: "a den leader",
  committee: "pack leadership",
};

/** The roles someone can preview: those below their own. */
export function viewableRoles(real: AppRole): AppRole[] {
  return (["parent", "den_leader", "committee"] as AppRole[]).filter((r) => RANK[r] < RANK[real]);
}

/** The role to show, given the real role and the cookie, or null to show the real view. */
export function viewAsRole(real: AppRole, cookie: string | undefined): AppRole | null {
  if (!cookie) return null;
  return (viewableRoles(real) as string[]).includes(cookie) ? (cookie as AppRole) : null;
}
