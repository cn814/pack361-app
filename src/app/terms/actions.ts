"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TERMS_VERSION } from "@/lib/policies";

/**
 * "I agree": records the current terms version and the time on the signed-in adult's own row.
 *
 * Doesn't call getMe(): a Server Action renders the page it redirects to in the same request, and
 * getMe() is cached per request, so a copy read before agreeing would still say the terms are due
 * and send the person straight back here. accept_terms() itself refuses anyone not on the roster.
 */
export async function agreeToTerms(form: FormData): Promise<void> {
  if (form.get("agree") !== "on") redirect("/terms?tick=1");
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_terms", { p_version: TERMS_VERSION });
  if (error) redirect(error.code === "42501" ? "/not-on-roster" : "/terms?failed=1");
  redirect("/");
}
