"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/ActionForm";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, getSignIns, welcomeBudget } from "@/lib/roster-data";
import { APP_URL, emailConfigured, sendEmails, type Email } from "@/lib/email";
import type { SettingKey } from "@/lib/settings";
import { syncSummary, syncTwh, twhConfigured } from "@/lib/twh";
import { RANKS } from "@/lib/advancement";
import { MEMBER_ID } from "@/lib/training";
import type { AppRole, DenRank } from "@/lib/types";

const ROLES: AppRole[] = ["parent", "den_leader", "committee", "cubmaster", "admin"];
const UUID = /^[0-9a-f-]{36}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const str = (form: FormData, k: string, max = 120) => String(form.get(k) ?? "").trim().slice(0, max);
const opt = (form: FormData, k: string, max = 120) => str(form, k, max) || null;
const bool = (form: FormData, k: string) => form.get(k) === "on" || form.get(k) === "true";

function dbError(message: string): string {
  if (/adults_email_key|duplicate key.*email/i.test(message)) return "Someone on the roster already has that email.";
  if (/scouts_bsa_member_id_key/i.test(message)) return "Another scout already has that BSA member ID.";
  if (/dens_rank_number_key/i.test(message)) return "That den already exists.";
  if (/den_leaders_pkey/i.test(message)) return "They already lead that den.";
  return "Couldn't save that. Try again.";
}

function revalidateRoster(familyId?: string | null) {
  revalidatePath("/admin", "layout");
  if (familyId) revalidatePath(`/admin/families/${familyId}`);
  revalidatePath("/leaders");
  revalidatePath("/scouts", "layout");
}

// ---------------------------------------------------------------------------
// Families
// ---------------------------------------------------------------------------
export async function saveFamily(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = str(form, "id");
  const name = str(form, "family_name", 80);
  if (!name) return { error: "Add a family name." };
  const supabase = await createClient();

  if (id) {
    if (!UUID.test(id)) return { error: "Unknown family." };
    const active = bool(form, "is_active");
    const { error } = await supabase.from("families").update({ family_name: name, is_active: active }).eq("id", id);
    if (error) return { error: dbError(error.message) };
    if (!active) {
      // Leaving the pack: turn off the family's scouts and parent logins too.
      await supabase.from("scouts").update({ is_active: false }).eq("family_id", id);
      await supabase.from("adults").update({ is_active: false }).eq("family_id", id).eq("role", "parent");
    }
    revalidateRoster(id);
    return { ok: true, message: active ? "Saved" : "Saved. The family's scouts and parent sign-ins are turned off." };
  }

  // New family, optionally with its first adult and scout
  const { data, error } = await supabase.from("families").insert({ family_name: name }).select("id").single();
  if (error || !data) return { error: dbError(error?.message ?? "") };
  const familyId = data.id as string;

  const adultFirst = str(form, "adult_first_name", 60);
  const adultEmail = str(form, "adult_email", 200).toLowerCase();
  if (adultFirst && adultEmail) {
    if (!EMAIL.test(adultEmail)) return { error: "Family added, but that email doesn't look right. Add the adult below." };
    const { error: e2 } = await supabase.from("adults").insert({
      family_id: familyId,
      first_name: adultFirst,
      last_name: str(form, "adult_last_name", 60) || name,
      email: adultEmail,
    });
    if (e2) {
      revalidateRoster(familyId);
      redirect(`/admin/families/${familyId}?note=adult`);
    }
  }
  const scoutFirst = str(form, "scout_first_name", 60);
  if (scoutFirst) {
    const den = str(form, "scout_den_id");
    await supabase.from("scouts").insert({
      family_id: familyId,
      first_name: scoutFirst,
      last_name: str(form, "scout_last_name", 60) || name,
      den_id: UUID.test(den) ? den : null,
    });
  }
  revalidateRoster(familyId);
  redirect(`/admin/families/${familyId}`);
}

// ---------------------------------------------------------------------------
// Adults
// ---------------------------------------------------------------------------
export async function saveAdult(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const id = str(form, "id");
  const familyId = str(form, "family_id");
  const email = str(form, "email", 200).toLowerCase();
  const role = str(form, "role") as AppRole;
  const row = {
    first_name: str(form, "first_name", 60),
    last_name: str(form, "last_name", 60),
    preferred_name: opt(form, "preferred_name", 40),
    email,
    phone: opt(form, "phone", 40),
    relationship: opt(form, "relationship", 40),
    role: ROLES.includes(role) ? role : "parent",
    position_title: opt(form, "position_title", 120),
    bsa_member_id: opt(form, "bsa_member_id", 20),
  };
  if (!row.first_name || !row.last_name) return { error: "Add a first and last name." };
  if (!EMAIL.test(email)) return { error: "That email doesn't look right." };
  if (row.bsa_member_id && !MEMBER_ID.test(row.bsa_member_id)) return { error: "A BSA member ID is digits only, up to 12." };

  const supabase = await createClient();
  if (row.bsa_member_id) {
    // Training imports match adults by member ID, so keep it to one person.
    let dup = supabase.from("adults").select("id", { count: "exact", head: true }).eq("bsa_member_id", row.bsa_member_id);
    if (id) dup = dup.neq("id", id);
    const { count } = await dup;
    if (count) return { error: "Another adult already has that BSA member ID." };
  }
  if (id) {
    if (!UUID.test(id)) return { error: "Unknown person." };
    const active = bool(form, "is_active");
    if (id === me.id && (row.role !== me.role || !active)) {
      return { error: "You can't change your own role or turn off your own access. Ask another admin." };
    }
    const { error } = await supabase
      .from("adults")
      .update({ ...row, is_active: active })
      .eq("id", id);
    if (error) return { error: dbError(error.message) };
    revalidateRoster(familyId || null);
    return { ok: true };
  }

  const { error } = await supabase
    .from("adults")
    .insert({ ...row, family_id: UUID.test(familyId) ? familyId : null });
  if (error) return { error: dbError(error.message) };
  revalidateRoster(familyId || null);
  return { ok: true, message: `${row.first_name} added. They can sign in with ${email}.` };
}

// ---------------------------------------------------------------------------
// Scouts
// ---------------------------------------------------------------------------
export async function saveScout(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = str(form, "id");
  const familyId = str(form, "family_id");
  const den = str(form, "den_id");
  const photo = str(form, "photo_permission");
  const row = {
    first_name: str(form, "first_name", 60),
    last_name: str(form, "last_name", 60),
    den_id: UUID.test(den) ? den : null,
    bsa_member_id: opt(form, "bsa_member_id", 20),
    photo_permission: photo === "yes" || photo === "no" ? photo : null,
  };
  if (!row.first_name || !row.last_name) return { error: "Add a first and last name." };
  if (row.bsa_member_id && !/^\d{5,12}$/.test(row.bsa_member_id)) return { error: "BSA member IDs are numbers only." };
  const supabase = await createClient();
  if (id) {
    if (!UUID.test(id)) return { error: "Unknown scout." };
    const { error } = await supabase
      .from("scouts")
      .update({ ...row, is_active: bool(form, "is_active") })
      .eq("id", id);
    if (error) return { error: dbError(error.message) };
  } else {
    if (!UUID.test(familyId)) return { error: "Unknown family." };
    const { error } = await supabase.from("scouts").insert({ ...row, family_id: familyId });
    if (error) return { error: dbError(error.message) };
  }
  revalidateRoster(familyId || null);
  return { ok: true, message: id ? "Saved" : `${row.first_name} added.` };
}

// ---------------------------------------------------------------------------
// Dens and den leaders
// ---------------------------------------------------------------------------
export async function saveDen(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = str(form, "id");
  const rank = str(form, "rank") as DenRank;
  const number = Number(str(form, "number"));
  if (!RANKS.includes(rank)) return { error: "Pick a rank." };
  if (!Number.isInteger(number) || number < 1 || number > 99) return { error: "Den number should be 1 to 99." };
  const row = { rank, number, meeting_info: opt(form, "meeting_info", 120) };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("dens").update({ ...row, is_active: bool(form, "is_active") }).eq("id", id)
    : await supabase.from("dens").insert(row);
  if (error) return { error: dbError(error.message) };
  revalidateRoster();
  return { ok: true };
}

export async function addDenLeader(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const denId = str(form, "den_id");
  const adultId = str(form, "adult_id");
  const title = str(form, "title", 60) || "Den Leader";
  if (!UUID.test(denId) || !UUID.test(adultId)) return { error: "Pick a person." };
  const supabase = await createClient();
  const { error } = await supabase.from("den_leaders").insert({ den_id: denId, adult_id: adultId, title });
  if (error) return { error: dbError(error.message) };
  // Den leaders need at least den-leader access in the app.
  await supabase.from("adults").update({ role: "den_leader" }).eq("id", adultId).eq("role", "parent");
  revalidateRoster();
  return { ok: true, message: "Added" };
}

export async function removeDenLeader(form: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("den_leaders").delete().eq("den_id", str(form, "den_id")).eq("adult_id", str(form, "adult_id"));
  revalidateRoster();
}

// ---------------------------------------------------------------------------
// Pack settings
// ---------------------------------------------------------------------------
export async function saveSettings(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const rows: { key: SettingKey; value: string }[] = [];
  const awards = str(form, "awards_tracked_from");
  if (awards) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(awards)) return { error: "Pick a date for the awards cutoff." };
    rows.push({ key: "awards_tracked_from", value: awards });
  }
  const months = Number(str(form, "photo_keep_months"));
  if (!Number.isInteger(months) || months < 1 || months > 120) return { error: "Keep photos for 1 to 120 months." };
  rows.push({ key: "photo_keep_months", value: String(months) });
  const limit = Number(str(form, "email_daily_limit"));
  if (!Number.isInteger(limit) || limit < 0 || limit > 1000) return { error: "Daily email limit should be 0 to 1000." };
  rows.push({ key: "email_daily_limit", value: String(limit) });
  const season = str(form, "dues_season");
  if (season && !/^\d{4}-\d{2}$/.test(season)) return { error: "Write the dues season like 2026-27." };
  if (season) rows.push({ key: "dues_season", value: season });
  rows.push({ key: "dues_amount", value: str(form, "dues_amount", 200) });
  rows.push({ key: "dues_how", value: str(form, "dues_how", 600) });

  const supabase = await createClient();
  const { error } = await supabase.from("pack_settings").upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })));
  if (error) return { error: "Couldn't save settings." };
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Welcome emails
// ---------------------------------------------------------------------------
function welcomeEmail(a: { first_name: string; preferred_name: string | null; email: string }): Email {
  return {
    to: a.email,
    subject: "Your Pack 361 app is ready",
    paragraphs: [
      `Hi ${a.preferred_name || a.first_name},`,
      "Pack 361 has a private app for families: the pack calendar, campout details and packing lists, your scout's advancement, announcements, volunteer sign-ups and pack photos, all in one place.",
      `To sign in, open the app and enter this email address (${a.email}). We'll email you a one-time code, so there's no password to remember.`,
      `${APP_URL}/login`,
      "Tip: on your phone, add it to your home screen so it opens like an app. On iPhone (Safari or Chrome), tap the Share button (the square with an arrow: at the bottom in Safari, at the right end of the address bar in Chrome), then Add to Home Screen. On Android, tap the menu, then Add to Home screen.",
      `Only families and leaders on the Pack 361 roster can sign in. You can read how we protect your family's information at ${APP_URL}/safety.`,
      "See you at the next pack meeting!\nPack 361",
    ],
  };
}

export async function sendWelcomeEmails(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  if (!emailConfigured()) return { error: "Email isn't set up yet. Add RESEND_API_KEY in Vercel first." };
  const supabase = await createClient();
  const { left } = await welcomeBudget();
  const oneId = str(form, "adult_id");

  let q = supabase.from("adults").select("id, first_name, preferred_name, email, family_id").eq("is_active", true);
  if (oneId) q = q.eq("id", oneId);
  else q = q.is("welcomed_at", null);
  const { data } = await q.order("last_name");
  const signIns = await getSignIns();
  const targets = (data ?? []).filter((a) => oneId || !signIns.get(a.id as string));
  if (!targets.length) return { ok: true, message: "Everyone has been welcomed already." };
  if (left <= 0) return { error: "Today's email limit is used up. Send the rest tomorrow." };

  const batch = targets.slice(0, Math.min(left, 100));
  const err = await sendEmails(batch.map((a) => welcomeEmail(a as { first_name: string; preferred_name: string | null; email: string })));
  if (err) return { error: `Emails not sent: ${err}` };
  await supabase
    .from("adults")
    .update({ welcomed_at: new Date().toISOString() })
    .in("id", batch.map((a) => a.id as string));
  revalidatePath("/admin/welcome");
  const rest = targets.length - batch.length;
  return {
    ok: true,
    message: `Sent ${batch.length} welcome email${batch.length === 1 ? "" : "s"}.${rest > 0 ? ` ${rest} more to send tomorrow.` : ""}`,
  };
}

// ---------------------------------------------------------------------------
// Messages from families
// ---------------------------------------------------------------------------
export async function resolveFeedback(form: FormData) {
  const me = await requireAdmin();
  const id = str(form, "id");
  if (!UUID.test(id)) return;
  const reopen = str(form, "reopen") === "1";
  const supabase = await createClient();
  await supabase
    .from("feedback")
    .update(reopen ? { resolved_at: null, resolved_by: null } : { resolved_at: new Date().toISOString(), resolved_by: me.id })
    .eq("id", id);
  revalidatePath("/admin", "layout");
}

// ---------------------------------------------------------------------------
// TroopWebHost calendar
// ---------------------------------------------------------------------------
export async function syncTroopWebHost(): Promise<ActionResult> {
  await requireAdmin();
  if (!twhConfigured()) return { error: "Add TWH_CALENDAR_URL in Vercel first (TroopWebHost → My Stuff → Subscribe to Calendar)." };
  try {
    // RLS lets admins write events, so the sync runs as the signed-in admin.
    const r = await syncTwh(await createClient());
    revalidatePath("/", "layout");
    return r.errors.length || r.skipped ? { error: syncSummary(r) } : { ok: true, message: syncSummary(r) };
  } catch (e) {
    return { error: `Sync failed: ${e instanceof Error ? e.message : "unknown error"}` };
  }
}
