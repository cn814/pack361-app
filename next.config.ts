import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Every page: can't be framed by another site, no content-type guessing, and links to
        // other sites don't carry the page address (event and photo ids stay private).
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // payment: PayPal's checkout (its buttons run in www.paypal.com frames on /pay).
          { key: "Permissions-Policy", value: 'camera=(self), microphone=(), geolocation=(), payment=(self "https://www.paypal.com" "https://www.sandbox.paypal.com")' },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  // The app guide PDF (served at /app-guide from docs/guide).
  outputFileTracingIncludes: {
    "/app-guide": ["./docs/guide/Pack361-App-Guide.pdf"],
  },
  experimental: {
    // Going back to a page you opened in the last 30 seconds shows it right away instead of
    // asking the server again. Saving anything (server actions revalidate) clears this.
    staleTimes: {
      dynamic: 30,
    },
    serverActions: {
      // Scoutbook advancement export upload (about 1 MB per 5,000 rows)
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
