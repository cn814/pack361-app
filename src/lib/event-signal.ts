import "server-only";
import { createClient } from "./supabase/server";

/** A Signal group invite link, as Signal shares it ("https://signal.group/#Cj…"). */
export const SIGNAL_LINK = /(?:https:\/\/)?signal\.group\/#([A-Za-z0-9_=-]{8,})/;

/** Pull the invite link out of whatever was pasted (Signal sometimes adds words around it). */
export function signalLinkFrom(text: string): string | null {
  const m = text.trim().match(SIGNAL_LINK);
  const url = m ? `https://signal.group/#${m[1]}` : null;
  return url && url.length <= 500 ? url : null;
}

/**
 * The event's Signal group: the link (only for leaders and families going) and whether the event
 * has one at all (so others can be told to RSVP yes to get it).
 */
export async function getEventSignal(eventId: string): Promise<{ url: string | null; exists: boolean }> {
  const supabase = await createClient();
  const [{ data: row }, { data: exists }] = await Promise.all([
    supabase.from("event_signal").select("url").eq("event_id", eventId).maybeSingle(),
    supabase.rpc("event_has_signal", { p_event_id: eventId }),
  ]);
  const url = (row?.url as string | undefined) ?? null;
  return { url, exists: Boolean(url) || exists === true };
}
