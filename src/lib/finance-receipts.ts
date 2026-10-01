import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { MAX_RECEIPT_BYTES, RECEIPTS_BUCKET, receiptExt, receiptTypeFor } from "./finance";

const UUID_FILE = "[0-9a-f-]{36}";

/** Is this a receipt path the signed-in adult just uploaded (r/<their id>/<random>.<ext>)? */
export function isOwnReceiptPath(path: string, adultId: string): boolean {
  return new RegExp(`^r/${adultId}/${UUID_FILE}\\.(pdf|jpg|png|webp)$`).test(path);
}

/**
 * Check a fresh upload really is the size and type its name says. Returns the columns to save
 * on the expense, or an error in plain words.
 */
export async function checkUploadedReceipt(
  supabase: SupabaseClient,
  path: string,
  adultId: string,
  fileName: string,
): Promise<{ error: string } | { receipt_path: string; receipt_name: string; receipt_mime: string; receipt_bytes: number }> {
  const type = receiptTypeFor(path);
  if (!isOwnReceiptPath(path, adultId) || !type) return { error: "That upload didn't work. Try again." };
  const { data } = await supabase.rpc("receipt_upload_info", { p_path: path });
  const file = ((data ?? []) as { size_bytes: number; mime_type: string | null }[])[0];
  if (!file) return { error: "The receipt didn't finish uploading. Try again." };
  if (Number(file.size_bytes) > MAX_RECEIPT_BYTES) return { error: "That receipt is over 10 MB." };
  const stored = (file.mime_type ?? "").split(";")[0].trim().toLowerCase();
  if (stored && stored !== type.mime) return { error: "That file's type doesn't match its name. Try again." };
  const clean = fileName.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150) || "receipt";
  const name = receiptExt(clean) && receiptTypeFor(clean)?.mime === type.mime ? clean : `${clean.replace(/\.[^.]*$/, "")}.${type.ext}`;
  return { receipt_path: path, receipt_name: name.slice(0, 200), receipt_mime: type.mime, receipt_bytes: Number(file.size_bytes) };
}

/**
 * Remove receipt files (best effort), with the person's own key: the storage rules let
 * leadership remove any receipt and members only their own that no approved request uses.
 */
export async function removeReceipts(paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => Boolean(p));
  if (!list.length) return;
  const supabase = await createClient();
  await supabase.storage.from(RECEIPTS_BUCKET).remove(list);
}
