import "server-only";
import { createClient } from "./supabase/server";
import { isCommittee, isLeader } from "./data";
import type { DocAudience } from "./document-files";
import type { Adult } from "./types";

export interface PackDocument {
  id: string;
  title: string;
  description: string | null;
  folder: string;
  audience: DocAudience;
  den_id: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  pinned: boolean;
  archived_at: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  den: { name: string } | null;
}

const COLS =
  "id, title, description, folder, audience, den_id, storage_path, file_name, mime_type, size_bytes, pinned, archived_at, uploaded_by, created_at, updated_at, den:dens(name)";

/** Documents the signed-in person can see (RLS decides), current or archived. */
export async function getDocuments(archived = false): Promise<PackDocument[]> {
  const supabase = await createClient();
  let q = supabase.from("documents").select(COLS);
  q = archived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
  const { data } = await q.order("created_at", { ascending: false });
  return (data ?? []) as unknown as PackDocument[];
}

export async function getDocument(id: string): Promise<PackDocument | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("documents").select(COLS).eq("id", id).maybeSingle();
  return (data as unknown as PackDocument | null) ?? null;
}

export async function countArchivedDocuments(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("documents").select("id", { count: "exact", head: true }).not("archived_at", "is", null);
  return count ?? 0;
}

/** Folder names already in use, for the folder suggestions. */
export async function getDocumentFolders(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("documents").select("folder");
  return [...new Set((data ?? []).map((d) => d.folder as string))].sort((a, b) => a.localeCompare(b));
}

/**
 * Names of the leaders who added documents. Families can't read other adults' rows, so this
 * uses the leader directory every member can see; anyone no longer listed shows as "a leader".
 */
export async function getUploaderNames(): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("leader_directory");
  return new Map(((data ?? []) as { adult_id: string; name: string }[]).map((l) => [l.adult_id, l.name]));
}

/** Committee edits anything; other leaders edit what they added. */
export function canEditDocument(me: Adult, doc: Pick<PackDocument, "uploaded_by">): boolean {
  return isLeader(me) && (isCommittee(me) || doc.uploaded_by === me.id);
}
