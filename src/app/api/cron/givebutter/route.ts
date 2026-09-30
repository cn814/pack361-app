import { NextResponse, type NextRequest } from "next/server";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { givebutterConfigured, syncGivebutter } from "@/lib/givebutter";

// Daily Vercel Cron (vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!adminConfigured() || !givebutterConfigured()) {
    return NextResponse.json({ error: "SUPABASE_SECRET_KEY or GIVEBUTTER_API_KEY not set" }, { status: 503 });
  }
  try {
    const result = await syncGivebutter(createAdminClient());
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "sync failed" }, { status: 500 });
  }
}
