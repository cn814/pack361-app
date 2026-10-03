import { NextResponse, type NextRequest } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { weeklyScoutbook } from "@/lib/scoutbook-weekly";

// The weekly Scoutbook job (vercel.json: Sundays 07:00 UTC = 3 AM EDT / 2 AM EST, before the
// Sunday newsletter goes out at 6 AM). Does nothing until Pack admin turns it on
// (Scouts → Import from Scoutbook). See src/lib/scoutbook-weekly.ts.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!adminConfigured()) return NextResponse.json({ error: "SUPABASE_SECRET_KEY not set" }, { status: 503 });
  try {
    const out = await weeklyScoutbook(createAdminClient());
    const failed = "advancement" in out && Boolean(out.advancement.error || out.training.error);
    return NextResponse.json(out, { status: failed ? 500 : 200 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
