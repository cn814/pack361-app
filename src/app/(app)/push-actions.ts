"use server";

import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/data";
import { isPushEndpoint, sendPushTo } from "@/lib/push";

interface SubJson {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

export async function savePushSubscription(sub: SubJson, userAgent: string): Promise<{ error?: string }> {
  await requireMember();
  if (!sub?.endpoint || !isPushEndpoint(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return { error: "Invalid subscription." };
  const supabase = await createClient();
  // One row per device: re-subscribing (even after signing in as someone else on a shared
  // device) updates the row and moves it to the signed-in adult.
  const { error } = await supabase.rpc("register_push_subscription", {
    p_endpoint: sub.endpoint,
    p_p256dh: sub.keys.p256dh,
    p_auth: sub.keys.auth,
    p_user_agent: String(userAgent ?? "").slice(0, 300),
  });
  return error ? { error: "Couldn't save. Try again." } : {};
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  await requireMember();
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

/** Send a test alert to the signed-in adult's own phones and browsers. */
export async function sendTestPush(): Promise<{ message: string; ok: boolean }> {
  const me = await requireMember();
  const r = await sendPushTo([me.id], {
    title: "Pack 361 test alert",
    body: "Alerts are working on this device.",
    url: "/family",
    tag: "test",
  });
  if (r.sent) return { ok: true, message: `Sent to ${r.sent} device${r.sent === 1 ? "" : "s"}. It should appear in a few seconds.` };
  if (r.errors.length) return { ok: false, message: `Couldn't send: ${r.errors[0]}` };
  return { ok: false, message: "No devices with alerts turned on for your account." };
}
