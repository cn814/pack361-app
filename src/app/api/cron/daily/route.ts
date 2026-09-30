import { NextResponse, type NextRequest } from "next/server";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { purgeOldPhotos, remindTraining, remindVolunteers } from "@/lib/daily-jobs";
import { syncTwh, twhConfigured } from "@/lib/twh";

// Daily Vercel Cron (vercel.json), late afternoon Eastern: TroopWebHost calendar sync, volunteer reminders for
// tomorrow, training expiry reminders, and deleting photos past the keep-for setting.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!adminConfigured()) return NextResponse.json({ error: "SUPABASE_SECRET_KEY not set" }, { status: 503 });
  const db = createAdminClient();
  const out: Record<string, unknown> = {};
  if (twhConfigured()) {
    try {
      out.troopwebhost = await syncTwh(db);
    } catch (e) {
      out.troopwebhost = { error: e instanceof Error ? e.message : "failed" };
    }
  }
  for (const [name, job] of [
    ["volunteers", remindVolunteers],
    ["training", remindTraining],
    ["photos", purgeOldPhotos],
  ] as const) {
    try {
      out[name] = await job(db);
    } catch (e) {
      out[name] = { error: e instanceof Error ? e.message : "failed" };
    }
  }
  return NextResponse.json({ ok: true, ...out });
}
