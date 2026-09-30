"use server";

import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/data";

interface SubJson {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

export async function savePushSubscription(sub: SubJson, userAgent: string): Promise<{ error?: string }> {
  const me = await requireMember();
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) return { error: "Invalid subscription." };
  const supabase = await createClient();
  // Same device re-subscribing: replace the old row
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  const { error } = await supabase.from("push_subscriptions").insert({
    adult_id: me.id,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    user_agent: userAgent.slice(0, 300),
  });
  return error ? { error: "Couldn't save. Try again." } : {};
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  await requireMember();
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}
