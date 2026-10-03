"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { GETTING_STARTED_KEY } from "@/lib/onboarding";

/** "Hide" (or "Close" once it's all done) on the Getting started card: gone for good, for this person. */
export async function hideGettingStarted() {
  await requireMember();
  const supabase = await createClient();
  await supabase
    .from("todo_dismissals")
    .upsert({ key: GETTING_STARTED_KEY, hidden_until: null }, { onConflict: "adult_id,key" });
  revalidatePath("/", "layout");
}
