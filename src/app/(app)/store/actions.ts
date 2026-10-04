"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isCommittee, requireMember } from "@/lib/data";
import { isAdmin } from "@/lib/advancement-data";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { givebutterConfigured, syncGivebutter } from "@/lib/givebutter";

export type ActionState = { ok?: boolean; error?: string; message?: string };

export async function syncGivebutterNow(): Promise<ActionState> {
  const me = await requireMember();
  // Admins (Store page) and pack leadership (Money page, for dues).
  if (!isAdmin(me) && !isCommittee(me)) return { error: "Only pack admins and pack leadership can sync." };
  if (!adminConfigured() || !givebutterConfigured()) {
    return { error: "Add GIVEBUTTER_API_KEY and SUPABASE_SECRET_KEY in Vercel first." };
  }
  try {
    const r = await syncGivebutter(createAdminClient());
    revalidatePath("/", "layout");
    const dues = r.duesMatched || r.duesNeedReview ? ` Dues: ${r.duesMatched} matched, ${r.duesNeedReview} to review.` : "";
    const skipped = r.skipped ? ` ${r.skipped} transactions had no id and were left out (fields: ${r.skippedFields.join(", ")}).` : "";
    return { ok: true, message: `Synced ${r.campaigns} campaigns and ${r.orders} orders (${r.matchedFamilies} pack families matched).${dues}${skipped}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sync failed." };
  }
}

export async function setFundraiserFlag(form: FormData) {
  const me = await requireMember();
  if (!isAdmin(me)) return;
  const supabase = await createClient();
  await supabase
    .from("givebutter_campaigns")
    .update({ show_as_fundraiser: form.get("show") === "true" })
    .eq("id", Number(form.get("id")));
  revalidatePath("/store");
}
