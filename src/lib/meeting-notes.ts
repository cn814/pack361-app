import "server-only";
import { createClient } from "./supabase/server";

// Leader notes for a meeting (supabase/migrations/20261017000000_meeting_notes.sql): one shared
// notes box per event, or per den per day for den meetings. Leaders only; families never see them.

export type NotesTarget = { eventId: string } | { denId: string; day: string };

export interface MeetingNotes {
  body: string;
  updated_at: string | null;
  by: string | null;
}

export async function getMeetingNotes(t: NotesTarget): Promise<MeetingNotes> {
  const supabase = await createClient();
  let q = supabase.from("meeting_notes").select("body, updated_at, author:adults(first_name, preferred_name, last_name)");
  q = "eventId" in t ? q.eq("event_id", t.eventId) : q.eq("den_id", t.denId).eq("meets_on", t.day);
  const { data } = await q.maybeSingle();
  const row = data as unknown as {
    body: string;
    updated_at: string;
    author: { first_name: string; preferred_name: string | null; last_name: string } | null;
  } | null;
  if (!row) return { body: "", updated_at: null, by: null };
  const a = row.author;
  return { body: row.body, updated_at: row.updated_at, by: a ? `${a.preferred_name || a.first_name} ${a.last_name.slice(0, 1)}.` : null };
}
