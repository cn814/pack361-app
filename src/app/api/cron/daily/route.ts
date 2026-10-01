import { NextResponse, type NextRequest } from "next/server";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { emailBudget, purgeOldPhotos, reconcilePayments, remindRegistration, remindTraining, remindVolunteers } from "@/lib/daily-jobs";
import { paypalConfigured } from "@/lib/paypal";
import { syncTwh, twhConfigured } from "@/lib/twh";
import { syncCouncil } from "@/lib/council";

// Daily Vercel Cron (vercel.json, 21:00 UTC = 5 PM EDT / 4 PM EST). Steps, in order:
//   1. volunteer reminders   2. training expiry reminders   3. Scouting America registration reminders
//      (all three share one reminder email budget, so sign-in codes keep room in the daily email quota)
//   4. deleting photos past the keep-for setting
//   5. finishing PayPal checkouts a family's browser didn't (only when PayPal is set up)
//   6. the TroopWebHost calendar sync (only when its link is set)
//   7. the council calendar sync (does nothing until a link is saved)
// The slow outside calendars run last so they can't hold up the reminders. Each step runs even if
// another fails; any failure makes the run return 500 so it shows as failed in Vercel. The result
// is saved for the Pack admin page after every step, so a run cut off by the time limit still
// shows which step it stopped in.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!adminConfigured()) return NextResponse.json({ error: "SUPABASE_SECRET_KEY not set" }, { status: 503 });
  const db = createAdminClient();
  const out: Record<string, unknown> = {};
  const failed: string[] = [];
  const budget = emailBudget();
  const steps: [string, () => Promise<unknown>][] = [
    ["volunteers", () => remindVolunteers(db, budget)],
    ["training", () => remindTraining(db, budget)],
    ["registration", () => remindRegistration(db, budget)],
    ["photos", () => purgeOldPhotos(db)],
  ];
  if (paypalConfigured()) steps.push(["payments", () => reconcilePayments(db)]);
  if (twhConfigured()) steps.push(["troopwebhost", () => syncTwh(db)]);
  steps.push(["council", () => syncCouncil(db)]);

  const at = new Date().toISOString();
  // `running` names the step under way; it's cleared when the run finishes.
  const save = async (running: string | null) => {
    await db.from("pack_settings").upsert({
      key: "daily_last_run",
      value: JSON.stringify({ at, ok: !failed.length && !running, failed, running }),
      updated_at: new Date().toISOString(),
    });
  };

  for (const [name, job] of steps) {
    await save(name);
    try {
      out[name] = await job();
      const errs = (out[name] as { errors?: string[]; skipped?: string } | undefined) ?? {};
      if (errs.errors?.length || errs.skipped) failed.push(name);
    } catch (e) {
      out[name] = { error: e instanceof Error ? e.message : "failed" };
      failed.push(name);
    }
  }
  await save(null);
  return NextResponse.json({ ok: !failed.length, failed, ...out }, { status: failed.length ? 500 : 200 });
}
