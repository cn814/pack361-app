"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/ActionForm";
import { displayName, requireMember } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { RECEIPTS_BUCKET, checkReceipt, receiptTypeFor } from "@/lib/finance";
import { checkUploadedReceipt, isOwnReceiptPath, removeReceipts } from "@/lib/finance-receipts";
import { notifyNewRequest } from "@/lib/finance-notify";
import { readRequestFields } from "@/lib/finance-form";

const UUID = /^[0-9a-f-]{36}$/i;
const PAY_ME_BY = ["check", "cash", "paypal", "zelle", "venmo", "other"];

/**
 * Step 1 of adding a receipt: a one-time signed address the browser sends the file to
 * directly. Anyone on the roster can upload, into r/<their id>/ only.
 */
export async function prepareReceiptUpload(
  fileName: string,
  size: number,
): Promise<{ error: string } | { path: string; url: string; mime: string }> {
  const me = await requireMember();
  const problem = checkReceipt(String(fileName), Number(size));
  if (problem) return { error: problem };
  const type = receiptTypeFor(String(fileName))!;
  const path = `r/${me.id}/${crypto.randomUUID()}.${type.ext}`;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(RECEIPTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "Couldn't start the upload. Try again." };
  return { path, url: data.signedUrl, mime: type.mime };
}

/** Throw away a receipt upload the form ended up not saving. */
export async function cancelReceiptUpload(path: string) {
  const me = await requireMember();
  if (!isOwnReceiptPath(String(path), me.id)) return;
  await removeReceipts([String(path)]);
}

/** Anyone on the roster: ask to be paid back, or fix a request leadership hasn't acted on yet. */
export async function saveMyRequest(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  const newPath = String(form.get("receipt_path") ?? "");
  const fail = async (error: string): Promise<ActionResult> => {
    if (newPath && isOwnReceiptPath(newPath, me.id)) await removeReceipts([newPath]);
    return { error };
  };
  const id = String(form.get("id") ?? "");
  if (id && !UUID.test(id)) return fail("Request not found.");
  const fields = readRequestFields(form);
  if ("error" in fields) return fail(fields.error);
  const payMeBy = String(form.get("pay_me_by") ?? "");
  if (!PAY_ME_BY.includes(payMeBy)) return fail("Choose how you'd like to be paid back.");
  const note = String(form.get("note") ?? "").replace(/\r/g, "").trim().slice(0, 500) || null;
  const row: Record<string, unknown> = { ...fields.row, pay_me_by: payMeBy, note };

  const supabase = await createClient();
  if (newPath) {
    const r = await checkUploadedReceipt(supabase, newPath, me.id, String(form.get("receipt_name") ?? ""));
    if ("error" in r) return fail(r.error);
    Object.assign(row, r);
  } else if (!id) {
    return fail("Add a photo or PDF of the receipt.");
  }

  if (!id) {
    const { error } = await supabase
      .from("expenses")
      .insert({ ...row, paid_by: "member", adult_id: me.id, status: "submitted" });
    if (error) return fail(error.code === "22023" ? error.message : "Couldn't send your request. Try again.");
    await notifyNewRequest({
      who: `${displayName(me)} ${me.last_name}`,
      amountCents: row.amount_cents as number,
      description: row.description as string,
      requesterId: me.id,
    });
  } else {
    const { data: old } = await supabase.from("expenses").select("receipt_path, status").eq("id", id).maybeSingle();
    if (!old) return fail("Request not found.");
    if (old.status !== "submitted") return fail("Leadership is already handling this request, so it can't be changed. Talk to the treasurer.");
    const { data, error } = await supabase.from("expenses").update(row).eq("id", id).select("id").maybeSingle();
    if (error || !data) return fail("Couldn't save your changes. Try again.");
    if (newPath && old.receipt_path && old.receipt_path !== newPath) await removeReceipts([old.receipt_path as string]);
  }
  revalidatePath("/reimburse");
  revalidatePath("/leaders/money/expenses");
  redirect(`/reimburse?done=${id ? "saved" : "sent"}`);
}

/** Withdraw a request leadership hasn't acted on yet (and delete its receipt). */
export async function withdrawMyRequest(form: FormData) {
  const me = await requireMember();
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) redirect("/reimburse");
  const supabase = await createClient();
  const { data } = await supabase
    .from("expenses")
    .delete()
    .eq("id", id)
    .eq("adult_id", me.id)
    .eq("status", "submitted")
    .select("receipt_path");
  if (data?.length) await removeReceipts(data.map((d) => d.receipt_path as string | null));
  revalidatePath("/reimburse");
  revalidatePath("/leaders/money/expenses");
  redirect(data?.length ? "/reimburse?done=withdrawn" : "/reimburse");
}
