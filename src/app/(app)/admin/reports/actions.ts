"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/ActionForm";
import { requireAdmin } from "@/lib/roster-data";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;
const REPORTS = new Set(["roster", "membership"]);

/** Pack admin: let a leader open the roster or membership report too (the database checks admins). */
export async function addReportAccess(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const report = String(form.get("report") ?? "");
  const adultId = String(form.get("adult_id") ?? "");
  if (!REPORTS.has(report) || !UUID.test(adultId)) return { error: "Pick a person." };
  const supabase = await createClient();
  const { error } = await supabase.from("report_access").insert({ report, adult_id: adultId, added_by: me.id });
  if (error && !/duplicate|pkey/i.test(error.message)) return { error: "Couldn't add them. Try again." };
  revalidatePath("/admin/reports");
  return { ok: true, message: "Added." };
}

export async function removeReportAccess(form: FormData) {
  await requireAdmin();
  const report = String(form.get("report") ?? "");
  const adultId = String(form.get("adult_id") ?? "");
  if (!REPORTS.has(report) || !UUID.test(adultId)) return;
  const supabase = await createClient();
  await supabase.from("report_access").delete().eq("report", report).eq("adult_id", adultId);
  revalidatePath("/admin/reports");
}
