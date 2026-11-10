/**
 * Away from the app:
 *  - A leader's account (a session with the authenticator code entered) LOCKS after 15 minutes
 *    without use. Only the authenticator code opens it again (no email wait), so someone who
 *    walks up to a leader's open laptop or unlocked phone can't see or change pack records.
 *  - Everyone is SIGNED OUT after 30 days without opening the app.
 *
 * "Use" is kept in a small cookie the server signs (HMAC, tied to the sign-in session), so it
 * can't be edited or copied to another session. src/proxy.ts checks it on every request, blocks
 * a locked session from everything but the code page, and freshens it (at most once a minute)
 * while the person is using the app. The browser side (src/components/IdleWatch.tsx) shows a
 * warning a minute before and covers the screen when it locks.
 */
export const LOCK_MINUTES = 15;
export const LOCK_MS = LOCK_MINUTES * 60_000;
export const SIGN_OUT_DAYS = 30;
export const SIGN_OUT_MS = SIGN_OUT_DAYS * 86_400_000;
/** The cookie is written again only when it's this old, so most requests don't set a cookie. */
export const REFRESH_MS = 60_000;

export const ACTIVE_COOKIE = "pack-active";
export const ACTIVE_COOKIE_OPTIONS = {
  path: "/",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: (SIGN_OUT_DAYS + 1) * 86_400,
};
/** GET: how long until the lock (doesn't count as use). POST: "still here" (counts as use). */
export const SESSION_PATH = "/api/session";
/** Request headers the proxy sets for the pages (and overwrites if a browser sends them). */
export const LOCKED_HEADER = "x-pack-locked";
export const LEFT_HEADER = "x-pack-lock-left";

const enc = new TextEncoder();
let keyPromise: Promise<CryptoKey> | null = null;

function signingKey(): Promise<CryptoKey> {
  // Derived from the server's Supabase secret key, which never reaches a browser. Without it
  // (local development only) a key made at start-up: cookies then last until a restart.
  keyPromise ??= (async () => {
    const secret = process.env.SUPABASE_SECRET_KEY;
    const raw = secret
      ? await crypto.subtle.digest("SHA-256", enc.encode(`pack361 active cookie|${secret}`))
      : crypto.getRandomValues(new Uint8Array(32));
    return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  })();
  return keyPromise;
}

function toB64url(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** The cookie's value: when, and a signature over the session and when. */
export async function stampActive(sessionId: string, atMs: number): Promise<string> {
  const at = String(Math.floor(atMs));
  const sig = await crypto.subtle.sign("HMAC", await signingKey(), enc.encode(`${sessionId}.${at}`));
  return `${at}.${toB64url(sig)}`;
}

/** When the cookie says the person last used the app; null if missing, edited or another session's. */
export async function readActive(value: string | undefined, sessionId: string): Promise<number | null> {
  const m = /^(\d{10,15})\.([A-Za-z0-9_-]{20,100})$/.exec(value ?? "");
  if (!m) return null;
  const sig = fromB64url(m[2]);
  if (!sig) return null;
  const ok = await crypto.subtle.verify("HMAC", await signingKey(), sig, enc.encode(`${sessionId}.${m[1]}`));
  return ok ? Number(m[1]) : null;
}

/**
 * When the person last used the app: the signed cookie, or for a leader the moment they entered
 * the code, whichever is later. With neither: a parent's first visit after this came in counts as
 * now; a leader's session with nothing to go by is treated as locked (the code opens it).
 */
export function lastActive({ stamped, codeAt, aal2, now }: { stamped: number | null; codeAt: number | null; aal2: boolean; now: number }): number {
  const seen = [stamped, aal2 ? codeAt : null].filter((v): v is number => typeof v === "number" && v > 0);
  if (!seen.length) return aal2 ? now - LOCK_MS - 1 : now;
  // A time in the future (a clock that jumped) counts as now.
  return Math.min(now, Math.max(...seen));
}

export type IdleState = "ok" | "locked" | "signed-out";

export function idleState({ last, aal2, now }: { last: number; aal2: boolean; now: number }): IdleState {
  if (now - last > SIGN_OUT_MS) return "signed-out";
  if (aal2 && now - last > LOCK_MS) return "locked";
  return "ok";
}

/**
 * What counts as use: opening a page (a full page load), and anything sent (a form, a save, the
 * "still here" ping). Not the requests a page makes on its own: Next.js link prefetches and
 * in-app page changes (their own markers are removed before the proxy sees them, so they're told
 * apart by the browser's Sec-Fetch-Mode), and the lock check. Taps and typing on a page count
 * through src/components/IdleWatch.tsx. A browser too old to send Sec-Fetch-Mode counts every
 * request.
 */
export function countsAsUse(method: string, path: string, headers: Headers): boolean {
  if (method !== "GET" && method !== "HEAD") return true;
  if (path === SESSION_PATH) return false;
  const purpose = `${headers.get("purpose") ?? ""} ${headers.get("sec-purpose") ?? ""}`.toLowerCase();
  if (purpose.includes("prefetch")) return false;
  const mode = headers.get("sec-fetch-mode");
  return mode === null || mode === "navigate";
}

/** While locked, only the code page, signing out, the lock check and the public pages open. */
export function openWhileLocked(path: string): boolean {
  return /^\/(?:two-step|auth)(?:\/|$)/.test(path) || path === SESSION_PATH;
}

/** Where to go back to after the code: a path on this site only. */
export function safeNext(v: unknown): string {
  const s = typeof v === "string" ? v : "";
  if (!s.startsWith("/") || s.startsWith("//") || s.startsWith("/\\") || /[\r\n]/.test(s)) return "/";
  if (/^\/(?:two-step|auth|login)(?:[/?#]|$)/.test(s)) return "/";
  return s.slice(0, 500);
}
