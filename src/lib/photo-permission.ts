// Pack photos: a scout may appear unless their family opts out (the pack decided this on
// 2026-10-12). scouts.photo_permission 'no' = opted out; 'yes' or null (never changed) = OK.
// Pure: safe on the server and in the browser.

export type PhotoPermission = "yes" | "no" | null | undefined;

/** OK to include this scout in pack photos? Only an explicit 'no' says otherwise. */
export const photosOk = (p: PhotoPermission | string) => p !== "no";
