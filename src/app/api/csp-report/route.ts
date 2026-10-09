import { NextResponse } from "next/server";

// Browsers post here what the report-only script policy would have blocked (src/lib/csp.ts).
// Each report is written to the server log, trimmed; nothing is stored.
export async function POST(request: Request) {
  const body = (await request.text()).slice(0, 4000);
  try {
    const parsed = JSON.parse(body) as { "csp-report"?: Record<string, unknown> };
    const r = parsed["csp-report"] ?? {};
    console.warn("csp-report", JSON.stringify({
      page: String(r["document-uri"] ?? "").replace(/\?.*$/, "").slice(0, 200),
      blocked: String(r["blocked-uri"] ?? "").slice(0, 200),
      directive: String(r["violated-directive"] ?? r["effective-directive"] ?? "").slice(0, 100),
    }));
  } catch {
    console.warn("csp-report (unreadable)");
  }
  return new NextResponse(null, { status: 204 });
}
