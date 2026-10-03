import "server-only";
import { adminConfigured, createAdminClient } from "./supabase/admin";
import { sendPushTo, type PushPayload } from "./push";
import { emailConfigured, sendEmails, type Email } from "./email";
import { LEADER_ROLES } from "./types";

/** Pack admins (admin + Cubmaster) who are active. Uses the secret key: parents can't list adults. */
async function admins(): Promise<{ id: string; email: string; first_name: string }[]> {
  if (!adminConfigured()) return [];
  const { data } = await createAdminClient()
    .from("adults")
    .select("id, email, first_name")
    .in("role", ["admin", "cubmaster"])
    .eq("is_active", true);
  return (data ?? []) as { id: string; email: string; first_name: string }[];
}

/** Tell the pack admins something: a phone alert, plus an email when `email` is given. */
export async function notifyAdmins(push: PushPayload, email?: { subject: string; paragraphs: string[] }) {
  const list = await admins();
  if (!list.length) return;
  await sendPushTo(
    list.map((a) => a.id),
    push,
  );
  if (email && emailConfigured()) {
    await sendEmails(list.map((a): Email => ({ to: a.email, subject: email.subject, paragraphs: email.paragraphs })));
  }
}

/**
 * A family opted a scout out of photos: tell the people who review photos (every active leader)
 * so they can check what's already in the album. First name only on the lock screen.
 */
export async function notifyPhotoOptOut(scoutFirstName: string) {
  if (!adminConfigured()) return;
  const { data } = await createAdminClient().from("adults").select("id").in("role", LEADER_ROLES).eq("is_active", true);
  const ids = ((data ?? []) as { id: string }[]).map((a) => a.id);
  if (!ids.length) return;
  const name = scoutFirstName.trim().slice(0, 40) || "A scout";
  await sendPushTo(ids, {
    title: "Photo opt-out",
    body: `${name}'s family opted out of photos. Check approved photos from events they attended.`,
    url: "/photos/review",
    tag: "photo-opt-out",
  });
}
