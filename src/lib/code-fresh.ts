/**
 * Leaders enter their authenticator code again every 30 days. The same rule is in the database
 * (private.code_entered()): the session must be aal2 and its "totp" sign-in entry (amr) less than
 * 30 days old. A session with no amr list at all is judged on aal2 alone, as the database does.
 */
export const CODE_LASTS_DAYS = 30;

type Claims = { aal?: unknown; amr?: unknown } | null | undefined;

/**
 * When the authenticator code was last entered in this session, in milliseconds; 0 if never,
 * null if the session has no amr list to tell.
 */
export function latestCodeMs(claims: Claims): number | null {
  if (!Array.isArray(claims?.amr)) return null;
  let latest = 0;
  for (const e of claims.amr as unknown[]) {
    if (!e || typeof e !== "object") continue;
    const { method, timestamp } = e as { method?: unknown; timestamp?: unknown };
    if (method === "totp" && typeof timestamp === "number" && timestamp > latest) latest = timestamp;
  }
  return latest * 1000;
}

export function codeIsFresh(claims: Claims, nowMs = Date.now()): boolean {
  if (claims?.aal !== "aal2") return false;
  const at = latestCodeMs(claims);
  if (at === null) return true;
  return at > nowMs - CODE_LASTS_DAYS * 86_400_000;
}
