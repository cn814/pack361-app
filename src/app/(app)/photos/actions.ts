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
const MAX_FULL = 3_500_000;
const MAX_THUMB = 400_000;

async function isJpeg(b: Blob) {
  const head = new Uint8Array(await b.slice(0, 3).arrayBuffer());
  return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
}

/**
 * One photo, already resized and re-encoded in the browser (which also strips location
 * and camera data). Leaders' photos go straight to the album; others wait for review.
 */
export async function uploadPhoto(form: FormData): Promise<{ error?: string; approved?: boolean }> {
  const me = await requireMember();
  const full = form.get("full");
  const thumb = form.get("thumb");
  const eventId = String(form.get("event_id") ?? "");
  const caption = String(form.get("caption") ?? "").trim().slice(0, 200) || null;
  if (!(full instanceof Blob) || !(thumb instanceof Blob)) return { error: "No photo received." };
  if (full.size > MAX_FULL || thumb.size > MAX_THUMB) return { error: "That photo is too large." };
  if (!(await isJpeg(full)) || !(await isJpeg(thumb))) return { error: "Only photos can be uploaded." };

  const supabase = await createClient();
  const name = crypto.randomUUID();
  const path = `${me.id}/${name}.jpg`;
  const thumbPath = `${me.id}/${name}_t.jpg`;
  const up1 = await supabase.storage.from(PHOTO_BUCKET).upload(path, full, { contentType: "image/jpeg", upsert: false });
  if (up1.error) return { error: "Upload failed. Try again." };
  const up2 = await supabase.storage.from(PHOTO_BUCKET).upload(thumbPath, thumb, { contentType: "image/jpeg", upsert: false });
  const leader = isLeader(me);
  const { error } = up2.error
    ? { error: up2.error }
    : await supabase.from("photos").insert({
        uploader_id: me.id,
        storage_path: path,
        thumb_path: thumbPath,
        caption,
        event_id: UUID.test(eventId) ? eventId : null,
        status: leader ? "approved" : "pending_review",
      });
  if (error) {
    // Only leaders may delete photo files, so tidy up this failed upload with the server key.
    if (adminConfigured()) await createAdminClient().storage.from(PHOTO_BUCKET).remove([path, thumbPath]);
    return { error: "Upload failed. Try again." };
  }
  return { approved: leader };
}

/** After a batch of uploads: refresh the album once and, for family uploads, alert admins once. */
export async function finishUpload() {
  const me = await requireMember();
  revalidatePath("/photos", "layout");
  if (isLeader(me)) return;
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
        body: `A family uploaded ${count} photo${count === 1 ? "" : "s"} for the album.`,
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
