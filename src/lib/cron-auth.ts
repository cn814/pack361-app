import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * Is this request from Vercel Cron ("Authorization: Bearer <CRON_SECRET>")? Compared in constant
 * time, so response timing can't be used to guess the secret.
 */
export function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`));
}
