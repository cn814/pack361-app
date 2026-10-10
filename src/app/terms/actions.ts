"use server";

import { redirect } from "next/navigation";
import { getMe } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { TERMS_VERSION } from "@/lib/policies";

/** "I agree": records the current terms version and the time on the signed-in adult's own row. */
export async function agreeToTerms(form: FormData): Promise<void> {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!me.adult) redirect("/not-on-roster");
  if (me.held) redirect("/not-yet");
  if (form.get("agree") !== "on") redirect("/terms?tick=1");
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_terms", { p_version: TERMS_VERSION });
  if (error) redirect("/terms?failed=1");
  redirect("/");
}
