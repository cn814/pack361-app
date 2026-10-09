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

/**
 * A family changed a scout's Facebook answer from yes to no: tell the people a pack admin added
 * for Facebook photos (the social media coordinator) and the pack admins, so anything already
 * posted comes down. First name only.
 */
export async function notifyFacebookOff(scoutFirstName: string) {
  if (!adminConfigured()) return;
  const db = createAdminClient();
  const { data: grants } = await db.from("report_access").select("adult_id").eq("report", "social");
  const grantIds = ((grants ?? []) as { adult_id: string }[]).map((g) => g.adult_id);
  const { data: social } = grantIds.length
    ? await db.from("adults").select("id, email, first_name").in("id", grantIds).eq("is_active", true)
    : { data: [] };
  const people = new Map([...(await admins()), ...((social ?? []) as { id: string; email: string; first_name: string }[])].map((a) => [a.id, a]));
  if (!people.size) return;
  const name = scoutFirstName.trim().slice(0, 40) || "A scout";
  await sendPushTo([...people.keys()], {
    title: "Facebook photos: a family said no",
    body: `${name}'s face shouldn't be on the pack's Facebook page any more. Check what's posted.`,
    url: "/photos/facebook",
    tag: "facebook-off",
  });
  if (emailConfigured()) {
    await sendEmails(
      [...people.values()]
        .filter((a) => a.email)
        .map(
          (a): Email => ({
            to: a.email,
            subject: `Facebook photos: ${name}'s family said no`,
            paragraphs: [
              `${name}'s family changed their answer in the pack app: ${name}'s face shouldn't show on the pack's public Facebook page.`,
              `If a photo already posted shows ${name}'s face, please take it down or cover their face. Photos in the app's private album aren't affected.`,
              `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.pack361.org"}/photos/facebook`,
            ],
          }),
        ),
    );
  }
}

/**
 * Leaders who keep track of medical forms (pack position "Medical forms" or "Health and safety").
 * Empty when nobody has that job, and then every leader shares it as before.
 */
export async function formsKeeperIds(): Promise<string[]> {
  if (!adminConfigured()) return [];
  const { data } = await createAdminClient()
    .from("adults")
    .select("id")
    .in("role", LEADER_ROLES)
    .eq("is_active", true)
    .or("position_title.ilike.%medical%,position_title.ilike.%health%");
  return ((data ?? []) as { id: string }[]).map((a) => a.id);
}

/** A family says they turned in a medical form: a phone alert for whoever keeps the forms. */
export async function notifyFormTurnedIn(familyName: string | null, reporterId: string) {
  try {
    const ids = (await formsKeeperIds()).filter((id) => id !== reporterId);
    if (!ids.length) return;
    await sendPushTo(ids, {
      title: "Medical form turned in",
      body: `${familyName ? `The ${familyName} family` : "A family"} says they turned in a medical form. Confirm it when you have the paper copy.`,
      url: "/leaders/paperwork?show=waiting",
      tag: "form-turned-in",
    });
  } catch {
    // Best effort.
  }
}
