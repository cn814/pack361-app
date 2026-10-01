// Links into TroopWebHost. Pure: used by server pages and components alike.

/**
 * The event's own TroopWebHost page, built from its calendar UID
 * ("2446.516@OurGroupOnline.org" = unit 2446, event 516). This is the same link TroopWebHost
 * shows as "URL For This Event"; people who aren't signed in get its sign-in page first.
 */
export function twhEventUrl(uid: string | null | undefined): string | null {
  const m = uid?.match(/^(\d+)\.(\d+)@ourgrouponline\.org/i);
  if (!m) return null;
  return `https://www.troopwebhostcs.org/FormDetail.aspx?Menu_Item_ID=318&Form_ID=2486&Stack=0&Application_ID=${m[1]}&ID=${m[2]}`;
}
