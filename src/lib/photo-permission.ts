// Pack photos: a scout may appear unless their family opts out (the pack decided this on
// 2026-10-12). scouts.photo_permission 'no' = opted out; 'yes' or null (never changed) = OK.
// The pack's public Facebook page is the other way round: a scout's face shows there only if
// their family said yes (scouts.social_ok true). Not answered = no.
// Pure: safe on the server and in the browser.

export type PhotoPermission = "yes" | "no" | null | undefined;

/** OK to include this scout in pack photos? Only an explicit 'no' says otherwise. */
export const photosOk = (p: PhotoPermission | string) => p !== "no";

/** OK to show this scout's face on the pack's public Facebook page? Only a yes (and still in pack photos). */
export const facebookOk = (s: { social_ok?: boolean | null; photo_permission?: PhotoPermission | string }) =>
  s.social_ok === true && photosOk(s.photo_permission);

/** Has the family answered the Facebook question? (Out of pack photos counts as no.) */
export const facebookAnswered = (s: { social_ok?: boolean | null; photo_permission?: PhotoPermission | string }) =>
  s.social_ok != null || !photosOk(s.photo_permission);

/** A photo's Facebook status, from public.photo_social_status. */
export interface PhotoSocialStatus {
  photo_id: string;
  checked: boolean;
  people: number;
  not_ok: number;
  not_ok_names: string | null;
}

export type FacebookState = "ok" | "not-ok" | "unchecked";

export const facebookState = (s: PhotoSocialStatus | undefined): FacebookState =>
  !s || !s.checked ? "unchecked" : s.not_ok > 0 ? "not-ok" : "ok";
