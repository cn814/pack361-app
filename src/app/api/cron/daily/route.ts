import { NextResponse, type NextRequest } from "next/server";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { purgeOldPhotos, reconcilePayments, remindTraining, remindVolunteers } from "@/lib/daily-jobs";
import { paypalConfigured } from "@/lib/paypal";
import { syncTwh, twhConfigured } from "@/lib/twh";

// Daily Vercel Cron (vercel.json, 21:00 UTC = 5 PM EDT / 4 PM EST): volunteer reminders,
// training expiry reminders, deleting photos past the keep-for setting, finishing PayPal
// checkouts a family's browser didn't (when PayPal is set up), then the TroopWebHost
// calendar sync (last, so a slow TroopWebHost can't hold up the reminders). Each step runs even
// if another fails; any failure makes the run return 500 so it shows as failed in Vercel, and
// the result is saved for the Pack admin page.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!adminConfigured()) return NextResponse.json({ error: "SUPABASE_SECRET_KEY not set" }, { status: 503 });
  const db = createAdminClient();
  const out: Record<string, unknown> = {};
  const failed: string[] = [];
  const steps: [string, () => Promise<unknown>][] = [
    ["volunteers", () => remindVolunteers(db)],
    ["training", () => remindTraining(db)],
    ["photos", () => purgeOldPhotos(db)],
  ];
  if (paypalConfigured()) steps.push(["payments", () => reconcilePayments(db)]);
  if (twhConfigured()) steps.push(["troopwebhost", () => syncTwh(db)]);
  for (const [name, job] of steps) {
    try {
      out[name] = await job();
      const errs = (out[name] as { errors?: string[]; skipped?: string } | undefined) ?? {};
      if (errs.errors?.length || errs.skipped) failed.push(name);
    } catch (e) {
      out[name] = { error: e instanceof Error ? e.message : "failed" };
      failed.push(name);
    }
  }
  const at = new Date().toISOString();
  await db
    .from("pack_settings")
    .upsert({ key: "daily_last_run", value: JSON.stringify({ at, ok: !failed.length, failed }), updated_at: at });
  return NextResponse.json({ ok: !failed.length, failed, ...out }, { status: failed.length ? 500 : 200 });
}
