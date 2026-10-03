import "server-only";
import { after } from "next/server";
import { adminConfigured, createAdminClient } from "./supabase/admin";
import { sendPushTo } from "./push";
import { eventHref } from "./volunteer";

// RSVP waitlist: the database moves waitlisted families in when spots open (set_rsvp, a leader
// removing an answer, or raising the limit) and stamps promoted_at. This sends their
// "You're in!" alert, once per move-in (promoted_notified_at).

/**
 * Send "You're in!" to every family moved off this event's waitlist that hasn't been told yet.
 * Uses the secret key: the family that opened the spot can't see who was waiting.
 */
export async function notifyWaitlistPromotions(eventId: string): Promise<number> {
  if (!adminConfigured() || !/^[0-9a-f-]{36}$/i.test(eventId)) return 0;
  const db = createAdminClient();
  // Claim them first, so two answers at once can't alert a family twice.
  const { data: rows } = await db
    .from("event_rsvps")
    .update({ promoted_notified_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .not("promoted_at", "is", null)
    .is("promoted_notified_at", null)
    .eq("waitlisted", false)
    .eq("status", "yes")
    .select("family_id, adult_id");
  const moved = (rows ?? []) as { family_id: string | null; adult_id: string | null }[];
  if (!moved.length) return 0;
  const { data: ev } = await db.from("events").select("id, title, category").eq("id", eventId).maybeSingle();
  if (!ev) return 0;
  const families = moved.map((r) => r.family_id).filter((x): x is string => Boolean(x));
  const solo = moved.filter((r) => !r.family_id).map((r) => r.adult_id).filter((x): x is string => Boolean(x));
  const none = Promise.resolve({ data: [] as { id: string }[] });
  const [{ data: parents }, { data: adults }] = await Promise.all([
    families.length ? db.from("adults").select("id").in("family_id", families).eq("is_active", true) : none,
    solo.length ? db.from("adults").select("id").in("id", solo).eq("is_active", true) : none,
  ]);
  const ids = [...new Set([...(parents ?? []), ...(adults ?? [])].map((a) => a.id as string))];
  const title = String(ev.title).slice(0, 60);
  await sendPushTo(ids, {
    title: `You're in! ${title}`,
    body: `A spot opened up, so you're off the waitlist and on the list for ${title}. Check the event for what to bring and anything to pay.`,
    url: `${eventHref({ id: ev.id as string, category: ev.category as string })}#rsvp`,
    tag: `waitlist-${eventId}`,
  });
  return moved.length;
}

/**
 * After an RSVP change (or a leader changing the limit or removing an answer): alert any
 * families who just moved in, once the response has gone out. Call from a server action.
 */
export function afterRsvpChange(eventId: string): void {
  after(() => notifyWaitlistPromotions(eventId).then(() => undefined));
}

/** A friendly message for set_rsvp's "no room to grow" error, or null for any other error. */
export function rsvpFullMessage(error: { message?: string; hint?: string | null } | null): string | null {
  if (!error || error.hint !== "rsvp_full") return null;
  const n = Number(/(\d+)/.exec(error.message ?? "")?.[1] ?? 0);
  return n > 0
    ? `The event is almost full: you can bring up to ${n} ${n === 1 ? "person" : "people"} in all. Ask a leader if you need more.`
    : "The event is full, so you can't add more people. Ask a leader if you need more.";
}
