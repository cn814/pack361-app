import "server-only";
import QRCode from "qrcode";
import { fmtRange } from "./format";

// Recruiting: events picked for families thinking about joining, and the link members share.

export interface JoinEvent {
  title: string;
  category: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location_name: string | null;
  public_blurb: string | null;
}

/** Upcoming events leaders put on the public join page (works signed out). */
export async function getJoinEvents(): Promise<JoinEvent[]> {
  const { createClient: plain } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  const db = plain(url, key, { auth: { persistSession: false } });
  const { data } = await db.rpc("join_page_events");
  return (data ?? []) as JoinEvent[];
}

export const joinEventWhen = (e: JoinEvent) => fmtRange(e.starts_at, e.ends_at, e.all_day);

/** A QR code for a link, as an SVG string (dark green on white). */
export async function qrSvg(link: string): Promise<string> {
  return QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#012d1d", light: "#ffffff" } });
}

/** The message members start from when they invite someone. */
export function inviteMessage(link: string, next: JoinEvent | undefined): string {
  return [
    "Hi! Our family is in Cub Scout Pack 361 in Ellicott City (kindergarten through 5th grade, boys and girls).",
    next ? `You'd be welcome to come see what it's like: ${next.title}, ${joinEventWhen(next)}.` : "We'd love to have you come check it out.",
    `Here's more about the pack and how to join: ${link}`,
  ].join(" ");
}
