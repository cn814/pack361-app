"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/ActionForm";
import { createClient } from "@/lib/supabase/server";
import { isLeader, requireMember } from "@/lib/data";
import { PHOTO_BUCKET } from "@/lib/photos";
import { after } from "next/server";
import { notifyAdmins } from "@/lib/notify";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f-]{36}$/i;
const HASH = /^[0-9a-f]{64}$/;
const MAX_FULL = 3_500_000;
const MAX_THUMB = 400_000;

async function isJpeg(b: Blob) {
  const head = new Uint8Array(await b.slice(0, 3).arrayBuffer());
  return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Captions use first names only: true when the caption has a scout's full name (first name, or
 * the first letter of it, followed by their last name: "Sam Smith", "S. Smith"), case-insensitive.
 * A last name on its own isn't blocked, because many are everyday words ("a hike up the hill").
 * Call only after the user is known to be a member: it reads the roster with the secret key.
 */
async function captionHasLastName(caption: string): Promise<boolean> {
  const db = adminConfigured() ? createAdminClient() : await createClient();
  const { data } = await db.from("scouts").select("first_name, last_name");
  const clean = (v: string | null) => (v ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
  const text = caption.normalize("NFC").replace(/\s+/g, " ");
  for (const s of (data ?? []) as { first_name: string | null; last_name: string | null }[]) {
    const first = clean(s.first_name);
    const last = clean(s.last_name);
    if (!first || (last.match(/\p{L}/gu) ?? []).length < 2) continue;
    const firstPart = `(?:${escapeRe(first)}|${escapeRe(first[0])}\\.?)`;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${firstPart}\\s+${escapeRe(last)}(?![\\p{L}\\p{N}])`, "iu");
    if (re.test(text)) return true;
  }
  return false;
}

/** Leaders only (RLS): how many scouts' families opted out of photos, active or not. */
async function optOutCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase.from("scouts").select("id", { count: "exact", head: true }).eq("photo_permission", "no");
  // If it can't be checked, assume someone opted out (the photo then goes to review).
  return error ? 1 : (count ?? 0);
}

/**
 * One photo, already resized and re-encoded in the browser (which also strips location
 * and camera data). Leaders' photos go straight to the album when nobody has opted out of
 * photos, or when they tick "None of these scouts are in my photos"; otherwise, and for
 * everyone else, they wait for review. `fatal` errors are the same for every photo in a batch.
 */
export async function uploadPhoto(form: FormData): Promise<{ error?: string; approved?: boolean; fatal?: boolean; duplicate?: boolean }> {
  const me = await requireMember();
  const full = form.get("full");
  const thumb = form.get("thumb");
  const eventId = String(form.get("event_id") ?? "");
  const caption = String(form.get("caption") ?? "").trim().slice(0, 200) || null;
  // Fingerprint of the original file (taken on the phone): the same person can't add it twice.
  const hash = String(form.get("hash") ?? "").toLowerCase();
  const sourceHash = HASH.test(hash) ? hash : null;
  if (!(full instanceof Blob) || !(thumb instanceof Blob)) return { error: "No photo received." };
  if (full.size > MAX_FULL || thumb.size > MAX_THUMB) return { error: "That photo is too large." };
  if (!(await isJpeg(full)) || !(await isJpeg(thumb))) return { error: "Only photos can be uploaded." };
  if (caption && (await captionHasLastName(caption))) return { error: "Use first names only in captions.", fatal: true };

  const supabase = await createClient();
  const name = crypto.randomUUID();
  const path = `${me.id}/${name}.jpg`;
  const thumbPath = `${me.id}/${name}_t.jpg`;
  const up1 = await supabase.storage.from(PHOTO_BUCKET).upload(path, full, { contentType: "image/jpeg", upsert: false });
  if (up1.error) return { error: "Upload failed. Try again." };
  const up2 = await supabase.storage.from(PHOTO_BUCKET).upload(thumbPath, thumb, { contentType: "image/jpeg", upsert: false });
  const leader = isLeader(me) && (form.get("no_opt_outs") === "on" || (await optOutCount()) === 0);
  const { error } = up2.error
    ? { error: up2.error }
    : await supabase.from("photos").insert({
        uploader_id: me.id,
        storage_path: path,
        thumb_path: thumbPath,
        caption,
        event_id: UUID.test(eventId) ? eventId : null,
        status: leader ? "approved" : "pending_review",
        source_hash: sourceHash,
      });
  if (error) {
    // Only leaders may delete photo files, so tidy up this failed upload with the server key.
    if (adminConfigured()) await createAdminClient().storage.from(PHOTO_BUCKET).remove([path, thumbPath]);
    if ("code" in error && error.code === "23505") return { duplicate: true }; // already uploaded this one
    return { error: "Upload failed. Try again." };
  }
  return { approved: leader };
}

/** Before uploading: which of these photo files (by fingerprint) this person already uploaded. */
export async function alreadyUploaded(hashes: string[]): Promise<string[]> {
  const me = await requireMember();
  const list = [...new Set(hashes.map((h) => String(h).toLowerCase()).filter((h) => HASH.test(h)))].slice(0, 50);
  if (!list.length) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("photos").select("source_hash").eq("uploader_id", me.id).in("source_hash", list);
  return ((data ?? []) as { source_hash: string }[]).map((r) => r.source_hash);
}

/** After a batch of uploads: refresh the album once and, if any went to review, alert admins once. */
export async function finishUpload() {
  const me = await requireMember();
  revalidatePath("/photos", "layout");
  // Count what this person actually uploaded in the last few minutes, rather than trusting the
  // number sent from the browser, and only alert when there is something new to review.
  const supabase = await createClient();
  const { count } = await supabase
    .from("photos")
    .select("id", { count: "exact", head: true })
    .eq("uploader_id", me.id)
    .eq("status", "pending_review")
    .gte("created_at", new Date(Date.now() - 10 * 60000).toISOString());
  if (count) {
    after(() =>
      notifyAdmins({
        title: "New pack photos to review",
        body: `${isLeader(me) ? "A leader" : "A family"} uploaded ${count} photo${count === 1 ? "" : "s"} for the album.`,
        url: "/photos/review",
        tag: "photo-review",
      }),
    );
  }
}

/** Leaders only (RLS): delete the rows, then the files of the rows that were really deleted. */
async function removePhotos(ids: string[]) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("photos").delete().in("id", ids).select("storage_path, thumb_path");
  const paths = (data ?? []).flatMap((p) => [p.storage_path as string, p.thumb_path as string | null]).filter(Boolean) as string[];
  if (!error && paths.length) await supabase.storage.from(PHOTO_BUCKET).remove(paths);
  return !error;
}

/** Leaders: approve or turn down photos waiting for review. Turned-down photos are deleted. */
export async function reviewPhotos(form: FormData) {
  const me = await requireMember();
  if (!isLeader(me)) return;
  const ids = form.getAll("id").map(String).filter((s) => UUID.test(s));
  const decision = String(form.get("decision") ?? "");
  if (!ids.length) return;
  const supabase = await createClient();
  if (decision === "approve") {
    await supabase.from("photos").update({ status: "approved" }).in("id", ids);
  } else if (decision === "delete") {
    await removePhotos(ids);
  }
  // Either way, any removal requests on these photos are handled.
  await supabase.from("photo_flags").update({ resolved_at: new Date().toISOString(), resolved_by: me.id }).in("photo_id", ids).is("resolved_at", null);
  revalidatePath("/photos", "layout");
}

/**
 * Anyone can ask for a photo to be removed (nobody but leaders deletes photos). It's hidden
 * right away until a leader looks. Admins are alerted once per new request.
 */
export async function flagPhoto(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireMember();
  const id = String(form.get("id") ?? "");
  const reason = String(form.get("reason") ?? "").trim().slice(0, 500);
  if (!UUID.test(id)) return { error: "Photo not found." };
  const supabase = await createClient();
  const { data: isNew, error } = await supabase.rpc("flag_photo", { p_photo_id: id, p_reason: reason });
  if (error) {
    return {
      error:
        error.code === "54000"
          ? "You've sent a lot of removal requests today. Email info@pack361.org and a leader will help."
          : "Couldn't send that request. Email info@pack361.org and a leader will take care of it.",
    };
  }
  if (isNew) after(() =>
    notifyAdmins(
      { title: "Photo take-down request", body: reason ? reason.slice(0, 160) : "A family asked for a photo to come down.", url: "/photos/review", tag: "photo-flag" },
      {
        subject: "A family asked for a pack photo to be removed",
        paragraphs: [
          "Someone asked for a photo in the pack album to be removed. It's hidden from families until a leader reviews it.",
          reason ? `Their reason: ${reason}` : "They didn't give a reason.",
          `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.pack361.org"}/photos/review`,
        ],
      },
    ),
  );
  revalidatePath("/photos", "layout");
  redirect("/photos?flagged=1");
}

/**
 * Who's in a photo, for the pack's Facebook page: the complete list of scouts whose faces show
 * (or "no scout's face shows"). Leaders and the people a pack admin added (the database checks).
 */
export async function savePhotoPeople(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireMember();
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return { error: "Photo not found." };
  const scouts = [...new Set(form.getAll("scout").map(String).filter((s) => UUID.test(s)))].slice(0, 60);
  const none = form.get("none") === "on";
  if (!scouts.length && !none) return { error: "Tick every scout whose face shows, or “No scout's face shows”." };
  if (scouts.length && none) return { error: "You ticked scouts and “No scout's face shows”. Untick one." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_photo_people", { p_photo_id: id, p_scouts: scouts });
  if (error) return { error: error.code === "42501" ? "Only leaders and the pack's Facebook helpers can do this." : "Couldn't save. Try again." };
  revalidatePath(`/photos/${id}`);
  revalidatePath("/photos/facebook");
  return { ok: true, message: "Saved." };
}
