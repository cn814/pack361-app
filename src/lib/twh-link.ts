// Links into TroopWebHost. Pure: used by server pages and components alike.

export const TWH_HOME = process.env.NEXT_PUBLIC_TWH_URL ?? "https://www.troopwebhostcs.org/Pack361EllicottCity/";

/**
 * The event's own TroopWebHost page (where families RSVP), built from its calendar UID
 * ("2446.516@OurGroupOnline.org" = unit 2446, event 516). This is the same link TroopWebHost
 * shows as "URL For This Event"; people who aren't signed in get its sign-in page first.
 */
export function twhEventUrl(uid: string | null | undefined): string | null {
  const m = uid?.match(/^(\d+)\.(\d+)@ourgrouponline\.org/i);
  if (!m) return null;
  return `https://www.troopwebhostcs.org/FormDetail.aspx?Menu_Item_ID=318&Form_ID=2486&Stack=0&Application_ID=${m[1]}&ID=${m[2]}`;
}

/** Where the RSVP button goes: the event's page, or the pack's TroopWebHost home. */
export function rsvpHref(e: { twh_uid?: string | null; twh_url?: string | null }): string {
  return e.twh_url || twhEventUrl(e.twh_uid) || TWH_HOME;
}
