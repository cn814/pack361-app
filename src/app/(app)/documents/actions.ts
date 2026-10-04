"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/ActionForm";
import { isCommittee, isLeader, requireMember } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { DOCS_BUCKET, MAX_DOC_BYTES, checkDocFile, cleanFileName, docTypeFor, extOf } from "@/lib/document-files";

const UUID = /^[0-9a-f-]{36}$/i;
const AUDIENCES = ["everyone", "leaders", "committee"];

/**
 * Leaders: step 1 of adding a file. Checks the name and size, then hands back a one-time
 * signed address the browser sends the file to directly (files never pass through the app's
 * server). The file lands in docs/<your id>/ under a random name.
 */
export async function prepareDocumentUpload(
  fileName: string,
  size: number,
): Promise<{ error: string } | { path: string; url: string; mime: string }> {
  const me = await requireMember();
  if (!isLeader(me)) return { error: "Only leaders can add documents." };
  const problem = checkDocFile(String(fileName), Number(size));
  if (problem) return { error: problem };
  const type = docTypeFor(String(fileName))!;
  const path = `docs/${me.id}/${crypto.randomUUID()}.${type.ext}`;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(DOCS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "Couldn't start the upload. Try again." };
  return { path, url: data.signedUrl, mime: type.mime };
}

/** Remove one of my own uploads that won't be used (best effort). */
async function discardUpload(path: string) {
  const supabase = await createClient();
  await supabase.storage.from(DOCS_BUCKET).remove([path]);
}

/** Leaders: throw away an upload the form ended up not saving. */
export async function cancelDocumentUpload(path: string) {
  const me = await requireMember();
  if (!isLeader(me) || !String(path).startsWith(`docs/${me.id}/`)) return;
  await discardUpload(String(path));
}

/**
 * Remove a file no document uses any more. The person's own key works for their own files
 * and for pack leadership; when a leader replaces a file that someone else uploaded (pack leadership
 * did an earlier replacement), the secret key tidies up instead.
 */
async function removeOldFile(path: string) {
  const supabase = await createClient();
  const { data } = await supabase.storage.from(DOCS_BUCKET).remove([path]);
  if (!data?.length && adminConfigured()) await createAdminClient().storage.from(DOCS_BUCKET).remove([path]);
}

/**
 * Leaders: step 2, save the document's details (and, if a file was just uploaded, the file).
 * Row Level Security has the final say on who can add or change what.
 */
export async function saveDocument(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  const newPath = String(form.get("storage_path") ?? "");
  const fail = async (error: string): Promise<ActionResult> => {
    if (newPath.startsWith(`docs/${me.id}/`)) await discardUpload(newPath);
    return { error };
  };
  if (!isLeader(me)) return fail("Only leaders can add documents.");

  const id = String(form.get("id") ?? "");
  const title = String(form.get("title") ?? "").trim().slice(0, 120);
  const description = String(form.get("description") ?? "").replace(/\r/g, "").trim().slice(0, 500) || null;
  const folder = String(form.get("folder") ?? "").trim().replace(/\s+/g, " ").slice(0, 60) || "General";
  const audience = String(form.get("audience") ?? "everyone");
  const denId = String(form.get("den_id") ?? "");
  const pinned = form.get("pinned") === "on";
  if (id && !UUID.test(id)) return fail("Document not found.");
  if (!title) return fail("Give the document a title.");
  if (!AUDIENCES.includes(audience)) return fail("Choose who can see it.");
  if (audience === "committee" && !isCommittee(me)) return fail("Only pack leadership can add leadership-only documents.");
  if (denId && !UUID.test(denId)) return fail("Choose a den, or the whole pack.");
  if (!id && !newPath) return fail("Choose a file to upload.");

  const supabase = await createClient();
  const row: Record<string, unknown> = { title, description, folder, audience, den_id: denId || null, pinned };

  if (newPath) {
    // The file must be one this person just uploaded, and really be the size and type allowed.
    const ext = extOf(newPath);
    const type = docTypeFor(newPath);
    if (!new RegExp(`^docs/${me.id}/[0-9a-f-]{36}\\.${ext}$`).test(newPath) || !type) return fail("That upload didn't work. Try again.");
    const { data: info } = await supabase.rpc("document_upload_info", { p_path: newPath });
    const file = ((info ?? []) as { size_bytes: number; mime_type: string | null }[])[0];
    if (!file) return fail("The file didn't finish uploading. Try again.");
    if (Number(file.size_bytes) > MAX_DOC_BYTES) return fail("That file is over 10 MB.");
    const stored = (file.mime_type ?? "").split(";")[0].trim().toLowerCase();
    if (stored && stored !== type.mime) return fail("That file's type doesn't match its name. Try saving it again.");
    const fileName = cleanFileName(String(form.get("file_name") ?? ""));
    Object.assign(row, {
      storage_path: newPath,
      file_name: extOf(fileName) === type.ext ? fileName : `${fileName}.${type.ext}`,
      mime_type: type.mime,
      size_bytes: Number(file.size_bytes),
    });
  }

  const denied = "You can add documents for the whole pack or the dens you lead.";
  if (!id) {
    const { data, error } = await supabase
      .from("documents")
      .insert({ ...row, uploaded_by: me.id })
      .select("id")
      .maybeSingle();
    if (error || !data) return fail(error?.code === "42501" ? denied : "Couldn't add that document. Try again.");
  } else {
    const { data: old } = await supabase.from("documents").select("storage_path").eq("id", id).maybeSingle();
    if (!old) return fail("Document not found.");
    const { data, error } = await supabase.from("documents").update(row).eq("id", id).select("id").maybeSingle();
    if (error || !data) return fail(error?.code === "42501" ? denied : "Couldn't save your changes. Try again.");
    if (newPath && old.storage_path !== newPath) await removeOldFile(old.storage_path as string);
  }
  revalidatePath("/documents", "layout");
  redirect(`/documents?done=${id ? "saved" : "added"}`);
}

/** Leaders: archive a document (families stop seeing it) or bring it back. */
export async function setDocumentArchived(form: FormData) {
  const me = await requireMember();
  const id = String(form.get("id") ?? "");
  const archive = form.get("archive") === "1";
  if (!isLeader(me) || !UUID.test(id)) return;
  const supabase = await createClient();
  await supabase
    .from("documents")
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq("id", id);
  revalidatePath("/documents", "layout");
  redirect(archive ? "/documents?view=archived&done=archived" : "/documents?done=restored");
}

/** Pack leadership: delete a document and its file for good. */
export async function deleteDocument(form: FormData) {
  const me = await requireMember();
  const id = String(form.get("id") ?? "");
  if (!isCommittee(me) || !UUID.test(id)) return;
  const supabase = await createClient();
  const { data } = await supabase.from("documents").delete().eq("id", id).select("storage_path");
  const paths = (data ?? []).map((d) => d.storage_path as string);
  if (paths.length) await supabase.storage.from(DOCS_BUCKET).remove(paths);
  revalidatePath("/documents", "layout");
  redirect("/documents?done=deleted");
}
