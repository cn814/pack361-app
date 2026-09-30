import "server-only";
import webpush from "web-push";
import { adminConfigured, createAdminClient } from "./supabase/admin";

export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && adminConfigured());
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** Send a notification to every subscribed phone/browser. Dead subscriptions are removed. */
export async function sendPushToAll(payload: PushPayload, exceptAdultId?: string): Promise<{ sent: number; removed: number }> {
  return sendPush(payload, { exceptAdultId });
}

/** Send a notification to specific adults' phones/browsers. */
export async function sendPushTo(adultIds: string[], payload: PushPayload): Promise<{ sent: number; removed: number }> {
  if (!adultIds.length) return { sent: 0, removed: 0 };
  return sendPush(payload, { onlyAdultIds: adultIds });
}

async function sendPush(
  payload: PushPayload,
  opts: { exceptAdultId?: string; onlyAdultIds?: string[] },
): Promise<{ sent: number; removed: number }> {
  const { exceptAdultId, onlyAdultIds } = opts;
  if (!pushConfigured()) return { sent: 0, removed: 0 };
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:cnealen@gmail.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  const db = createAdminClient();
  let q = db
    .from("push_subscriptions")
    .select("id, adult_id, endpoint, p256dh, auth, adult:adults!inner(is_active)")
    .eq("adult.is_active", true);
  if (onlyAdultIds) q = q.in("adult_id", onlyAdultIds);
  const { data: subs } = await q;
  const body = JSON.stringify(payload);
  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    (subs ?? [])
      .filter((s) => s.adult_id !== exceptAdultId)
      .map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
            TTL: 60 * 60 * 24,
          });
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) dead.push(s.id as string);
        }
      }),
  );
  if (dead.length) await db.from("push_subscriptions").delete().in("id", dead);
  return { sent, removed: dead.length };
}
