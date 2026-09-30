"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/ActionForm";
import { createClient } from "@/lib/supabase/server";
import { isLeader, requireMember } from "@/lib/data";
import { PHOTO_BUCKET } from "@/lib/photos";
import { after } from "next/server";
import { notifyAdmins } from "@/lib/notify";

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
    await supabase.storage.from(PHOTO_BUCKET).remove([path, thumbPath]);
    return { error: "Upload failed. Try again." };
  }
  revalidatePath("/photos", "layout");
  if (!leader) {
    after(() =>
      notifyAdmins({ title: "New pack photos to review", body: "A family uploaded photos for the album.", url: "/photos/review", tag: "photo-review" }),
    );
  }
  return { approved: leader };
}

async function removePhotos(ids: string[]) {
  const supabase = await createClient();
  const { data } = await supabase.from("photos").select("id, storage_path, thumb_path").in("id", ids);
  const paths = (data ?? []).flatMap((p) => [p.storage_path as string, p.thumb_path as string | null]).filter(Boolean) as string[];
  const { error } = await supabase.from("photos").delete().in("id", ids);
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

/** The uploader (while pending) or a leader deletes a photo. */
export async function deletePhoto(form: FormData) {
  await requireMember();
  const id = String(form.get("id") ?? "");
  const back = String(form.get("back") ?? "/photos");
  if (UUID.test(id)) await removePhotos([id]);
  revalidatePath("/photos", "layout");
  redirect(back.startsWith("/photos") ? back : "/photos");
}

/** Anyone can ask for a photo to come down; it's hidden right away until a leader looks. */
export async function flagPhoto(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireMember();
  const id = String(form.get("id") ?? "");
  const reason = String(form.get("reason") ?? "").trim().slice(0, 500);
  if (!UUID.test(id)) return { error: "Photo not found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("flag_photo", { p_photo_id: id, p_reason: reason });
  if (error) return { error: "Couldn't send that request." };
  after(() =>
    notifyAdmins(
      { title: "Photo take-down request", body: reason ? reason.slice(0, 160) : "A family asked for a photo to come down.", url: "/photos/review", tag: "photo-flag" },
      {
        subject: "A family asked for a pack photo to be taken down",
        paragraphs: [
          "Someone asked for a photo in the pack album to be taken down. It's hidden from families until a leader reviews it.",
          reason ? `Their reason: ${reason}` : "They didn't give a reason.",
          `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.pack361.org"}/photos/review`,
        ],
      },
    ),
  );
  revalidatePath("/photos", "layout");
  redirect("/photos?flagged=1");
}
