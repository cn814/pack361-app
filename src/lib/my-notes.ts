import "server-only";
import { createClient } from "./supabase/server";

// Each account's private notes (supabase/migrations/20261025000000_my_notes.sql): a general
// notepad and a page per meeting. The database only ever returns the signed-in adult's own.

export interface MyNote {
  body: string;
  updated_at: string | null;
}

export interface MyMeetingNote {
  event_id: string;
  title: string;
  starts_at: string;
  category: string;
  body: string;
  updated_at: string;
}

/** The general notepad (eventId omitted) or one meeting's notes. */
export async function getMyNote(eventId?: string): Promise<MyNote> {
  const supabase = await createClient();
  let q = supabase.from("my_notes").select("body, updated_at");
  q = eventId ? q.eq("event_id", eventId) : q.is("event_id", null);
  const { data } = await q.maybeSingle();
  return data ? { body: data.body as string, updated_at: data.updated_at as string } : { body: "", updated_at: null };
}

/** Every meeting I've kept notes for, newest meeting first. */
export async function getMyMeetingNotes(): Promise<MyMeetingNote[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("my_notes")
    .select("event_id, body, updated_at, event:events(title, starts_at, category)")
    .not("event_id", "is", null)
    .neq("body", "");
  const rows = (data ?? []) as unknown as {
    event_id: string;
    body: string;
    updated_at: string;
    event: { title: string; starts_at: string; category: string } | null;
  }[];
  return rows
    .filter((r) => r.event)
    .map((r) => ({ event_id: r.event_id, body: r.body, updated_at: r.updated_at, title: r.event!.title, starts_at: r.event!.starts_at, category: r.event!.category }))
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
}
