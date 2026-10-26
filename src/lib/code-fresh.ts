/**
 * Leaders enter their authenticator code again every 30 days. The same rule is in the database
 * (private.code_entered()): the session must be aal2 and its "totp" sign-in entry (amr) less than
 * 30 days old. A session with no amr list at all is judged on aal2 alone, as the database does.
 */
export const CODE_LASTS_DAYS = 30;

type Claims = { aal?: unknown; amr?: unknown } | null | undefined;

export function codeIsFresh(claims: Claims, nowMs = Date.now()): boolean {
  if (claims?.aal !== "aal2") return false;
  if (!Array.isArray(claims.amr)) return true;
  let latest = 0;
  for (const e of claims.amr as unknown[]) {
    if (!e || typeof e !== "object") continue;
    const { method, timestamp } = e as { method?: unknown; timestamp?: unknown };
    if (method === "totp" && typeof timestamp === "number" && timestamp > latest) latest = timestamp;
  }
  return latest * 1000 > nowMs - CODE_LASTS_DAYS * 86_400_000;
}
