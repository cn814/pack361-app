import "server-only";
import { adminConfigured, createAdminClient } from "./supabase/admin";
import { sendPushTo, type PushPayload } from "./push";
import { emailConfigured, sendEmails, type Email } from "./email";

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
