import { NextResponse, type NextRequest } from "next/server";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { givebutterConfigured, syncGivebutter } from "@/lib/givebutter";

// Daily Vercel Cron (vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!adminConfigured()) return NextResponse.json({ error: "SUPABASE_SECRET_KEY not set" }, { status: 503 });
  // Not connected yet (waiting on the Givebutter key): nothing to do, and not a failure.
  if (!givebutterConfigured()) return NextResponse.json({ ok: true, skipped: "GIVEBUTTER_API_KEY not set" });
  try {
    const result = await syncGivebutter(createAdminClient());
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "sync failed" }, { status: 500 });
  }
}
