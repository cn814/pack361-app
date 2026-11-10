/**
 * The strict script policy: the browser runs only scripts the app itself sent with this request
 * (they carry the per-request nonce), so a script slipped into a page some other way doesn't run.
 * It ran report-only from 3.26 (Oct 9, 2026) and is enforced from 3.33. Browsers still report
 * anything it blocks to /api/csp-report (shown in Vercel's logs).
 *
 * Off switch: if it ever blocks something it shouldn't, set CSP_REPORT_ONLY=1 in Vercel
 * (Settings -> Environment Variables) and redeploy; the policy goes back to report-only.
 *
 * Next.js adds the nonce to its own scripts and the layout adds it to the head scripts;
 * 'strict-dynamic' lets those load what they need, such as PayPal's checkout script. Pages saved
 * for offline use (public/sw.js) are saved with their own policy header, whose nonce matches the
 * saved page. The service worker's loading screen is built on the phone and has no policy.
 */
export const CSP_REPORT_PATH = "/api/csp-report";

export function scriptPolicy(nonce: string, dev = process.env.NODE_ENV === "development"): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.paypal.com https://*.paypalobjects.com",
    "frame-src https://*.paypal.com",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "form-action 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    `report-uri ${CSP_REPORT_PATH}`,
  ].join("; ");
}

export function cspHeaderName(): "Content-Security-Policy" | "Content-Security-Policy-Report-Only" {
  return process.env.CSP_REPORT_ONLY === "1" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
}

export function newNonce(): string {
  return btoa(crypto.randomUUID());
}
