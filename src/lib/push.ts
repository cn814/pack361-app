import "server-only";
import webpush from "web-push";
import { adminConfigured, createAdminClient } from "./supabase/admin";
import { allowedAdults } from "./pilot";

const vapidPublic = () => (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
const vapidPrivate = () => (process.env.VAPID_PRIVATE_KEY ?? "").trim();

export function pushConfigured(): boolean {
  return Boolean(vapidPublic() && vapidPrivate() && adminConfigured());
}

export interface PushResult {
  sent: number;
  removed: number;
  errors: string[];
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** Send a notification to every subscribed phone/browser. Dead subscriptions are removed. */
export async function sendPushToAll(payload: PushPayload, exceptAdultId?: string): Promise<PushResult> {
  return sendPush(payload, { exceptAdultId });
}

/** Send a notification to specific adults' phones/browsers. */
export async function sendPushTo(adultIds: string[], payload: PushPayload): Promise<PushResult> {
  if (!adultIds.length) return { sent: 0, removed: 0, errors: [] };
  return sendPush(payload, { onlyAdultIds: adultIds });
}

async function sendPush(
  payload: PushPayload,
  opts: { exceptAdultId?: string; onlyAdultIds?: string[] },
): Promise<PushResult> {
  const { exceptAdultId } = opts;
  // The beta site only alerts its testers, and the pilot only the people it lets in.
  const onlyAdultIds = (await allowedAdults(opts.onlyAdultIds ?? null)) ?? undefined;
  if (onlyAdultIds && !onlyAdultIds.length) return { sent: 0, removed: 0, errors: [] };
  if (!pushConfigured()) return { sent: 0, removed: 0, errors: ["Push keys are not set on the server."] };
  try {
    webpush.setVapidDetails((process.env.VAPID_SUBJECT ?? "mailto:app@pack361.org").trim(), vapidPublic(), vapidPrivate());
  } catch (e) {
    const msg = `Push keys are not valid: ${e instanceof Error ? e.message : e}`;
    console.error("[push]", msg);
    return { sent: 0, removed: 0, errors: [msg] };
  }
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
  const errors: string[] = [];
  await Promise.all(
    (subs ?? [])
      .filter((s) => s.adult_id !== exceptAdultId)
      .map(async (s) => {
        try {
          if (!isPushEndpoint(s.endpoint)) throw Object.assign(new Error("not a push service"), { statusCode: 410 });
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
            TTL: 60 * 60 * 24,
            timeout: 10000,
          });
          sent++;
        } catch (e) {
          const err = e as { statusCode?: number; body?: string; message?: string };
          if (err.statusCode === 404 || err.statusCode === 410) dead.push(s.id as string);
          else {
            const msg = `${err.statusCode ?? "error"}: ${(err.body || err.message || "").slice(0, 200)}`;
            errors.push(msg);
            console.error("[push]", msg);
          }
        }
      }),
  );
  if (dead.length) await db.from("push_subscriptions").delete().in("id", dead);
  return { sent, removed: dead.length, errors };
}

/** Browsers' push services. The server only ever sends to these (never to an arbitrary URL). */
export function isPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return (
      u.protocol === "https:" &&
      /(^|\.)(fcm\.googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com|android\.googleapis\.com)$/.test(u.hostname)
    );
  } catch {
    return false;
  }
}
