import { NextResponse, type NextRequest } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { givebutterConfigured, syncGivebutter } from "@/lib/givebutter";
import { runWeeklyNewsletter } from "@/lib/newsletter";

// The morning Vercel Cron (vercel.json, 10:00 UTC = 6 AM EDT / 5 AM EST). Vercel sends
// "Authorization: Bearer <CRON_SECRET>". Every day: the Givebutter sync. Sundays: the weekly
// family newsletter (after the sync, so dues paid overnight don't show as owed).
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!adminConfigured()) return NextResponse.json({ error: "SUPABASE_SECRET_KEY not set" }, { status: 503 });
  const db = createAdminClient();
  const out: Record<string, unknown> = {};
  let failed = false;

  // Not connected yet (waiting on the Givebutter key): nothing to do, and not a failure.
  if (!givebutterConfigured()) out.givebutter = { skipped: "GIVEBUTTER_API_KEY not set" };
  else {
    try {
      out.givebutter = await syncGivebutter(db);
    } catch (e) {
      failed = true;
      out.givebutter = { error: e instanceof Error ? e.message : "sync failed" };
    }
  }

  try {
    const news = await runWeeklyNewsletter(db);
    out.newsletter = news;
    // Some emails failed (or weren't recorded): report the run as failed so it shows up in
    // Vercel's cron log. Tomorrow's run picks up whoever is still waiting this week.
    if ("errors" in news && news.errors?.length) failed = true;
  } catch (e) {
    failed = true;
    out.newsletter = { error: e instanceof Error ? e.message : "newsletter failed" };
  }

  return NextResponse.json({ ok: !failed, ...out }, { status: failed ? 500 : 200 });
}
