/**
 * The strict script policy, in report-only mode: browsers report what it would block (to
 * /api/csp-report, shown in Vercel's logs) without blocking anything. Once a few weeks pass with
 * no reports from the app's own pages and PayPal checkout, it can be switched to enforce by
 * renaming the header in src/proxy.ts to Content-Security-Policy. Before enforcing, make sure pages
 * saved for offline use (public/sw.js) are fetched fresh, since a saved page carries an old nonce.
 *
 * Scripts must carry the per-request nonce (Next.js adds it to its own scripts; the layout adds it
 * to the head scripts), and 'strict-dynamic' lets those load what they need, such as PayPal's
 * checkout script.
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

export function newNonce(): string {
  return btoa(crypto.randomUUID());
}
