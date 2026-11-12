"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import type { ActionResult } from "@/components/ActionForm";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, getSignIns, welcomeBudget } from "@/lib/roster-data";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { resetTwoStepFor } from "@/lib/two-step";
import { notifyFacebookOff, notifyPhotoOptOut } from "@/lib/notify";
import { sendPreview } from "@/lib/newsletter";
import { APP_URL, emailConfigured, sendEmails, type Email } from "@/lib/email";
import type { SettingKey } from "@/lib/settings";
import { syncSummary, syncTwh, twhConfigured } from "@/lib/twh";
import { RANKS } from "@/lib/advancement";
import { MEMBER_ID } from "@/lib/training";
import type { AppRole, DenRank } from "@/lib/types";
import { getPilot } from "@/lib/pilot";
import { pilotAllows } from "@/lib/pilot-rules";

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
      const [{ error: e1 }, { error: e2 }] = await Promise.all([
        supabase.from("scouts").update({ is_active: false }).eq("family_id", id),
        supabase.from("adults").update({ is_active: false }).eq("family_id", id).eq("role", "parent"),
      ]);
      if (e1 || e2) {
        revalidateRoster(id);
        return { error: "The family is marked inactive, but its scouts and parent sign-ins couldn't all be turned off. Save again to retry." };
      }
      // Leaders in the family keep their access (they may stay on as leaders); say so, so an
      // admin turns them off too if they're leaving.
      const { data: still } = await supabase
        .from("adults")
        .select("first_name, last_name")
        .eq("family_id", id)
        .eq("is_active", true)
        .neq("role", "parent");
      if (still?.length) {
        revalidateRoster(id);
        return {
          ok: true,
          message: `Saved. Scouts and parent sign-ins are off. Still on as leaders: ${still.map((a) => `${a.first_name} ${a.last_name}`).join(", ")}. Turn them off on their own page if they're leaving too.`,
        };
      }
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
    const { error: e3 } = await supabase.from("scouts").insert({
      family_id: familyId,
      first_name: scoutFirst,
      last_name: str(form, "scout_last_name", 60) || name,
      den_id: UUID.test(den) ? den : null,
    });
    if (e3) {
      // The family (and parent) exist now, so don't invite a second save that would add the
      // family twice: say where to add the scout instead.
      revalidateRoster(familyId);
      return {
        error: `The ${name} family was added, but the scout wasn't (${dbError(e3.message)}). Don't save this form again: open the family from Families and add the scout there.`,
      };
    }
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
  // Photos are OK unless the family opts out: save 'no' for an opt-out, 'yes' when turning it back
  // on, and otherwise leave the saved answer alone (null means OK too).
  const photo = str(form, "photo_permission");
  const photoChange = photo === "no" ? "no" : str(form, "photo_permission_was") === "no" ? "yes" : null;
  // The pack's Facebook page: yes, no, or not answered (= no). Saved only when it changes, so
  // the time the family answered is kept.
  const fb = str(form, "social_ok");
  const fbWas = str(form, "social_ok_was");
  const fbChange = fb !== fbWas && ["yes", "no", ""].includes(fb) ? { social_ok: fb === "" ? null : fb === "yes" } : {};
  const row = {
    first_name: str(form, "first_name", 60),
    last_name: str(form, "last_name", 60),
    den_id: UUID.test(den) ? den : null,
    bsa_member_id: opt(form, "bsa_member_id", 20),
    ...(photoChange ? { photo_permission: photoChange } : {}),
    ...fbChange,
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
  // A new opt-out: photo reviewers check what's already in the album.
  if (photoChange === "no" && str(form, "photo_permission_was") !== "no") {
    const name = row.first_name;
    after(() => notifyPhotoOptOut(name));
  }
  if (fbWas === "yes" && (fb !== "yes" || photoChange === "no")) {
    const name = row.first_name;
    after(() => notifyFacebookOff(name));
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
  const adultId = str(form, "adult_id");
  const supabase = await createClient();
  await supabase.from("den_leaders").delete().eq("den_id", str(form, "den_id")).eq("adult_id", adultId);
  // No longer leading any den: back to parent access (a den-leader role would still let them see
  // every family and edit events). Leadership, Cubmaster and admin roles are left alone.
  if (UUID.test(adultId)) {
    const { count } = await supabase.from("den_leaders").select("den_id", { count: "exact", head: true }).eq("adult_id", adultId);
    if (!count) await supabase.from("adults").update({ role: "parent" }).eq("id", adultId).eq("role", "den_leader");
  }
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
  // Each Pack admin section saves only the settings on its own page.
  if (form.has("photo_keep_months")) {
    const months = Number(str(form, "photo_keep_months"));
    if (!Number.isInteger(months) || months < 1 || months > 120) return { error: "Keep photos for 1 to 120 months." };
    rows.push({ key: "photo_keep_months", value: String(months) });
  }
  if (form.has("left_family_months")) {
    const leftMonths = Number(str(form, "left_family_months"));
    if (!Number.isInteger(leftMonths) || leftMonths < 6 || leftMonths > 120) {
      return { error: "Keep contact details of families who left for 6 to 120 months." };
    }
    rows.push({ key: "left_family_months", value: String(leftMonths) });
  }
  if (form.has("email_daily_limit")) {
    const limit = Number(str(form, "email_daily_limit"));
    if (!Number.isInteger(limit) || limit < 0 || limit > 1000) return { error: "Daily email limit should be 0 to 1000." };
    rows.push({ key: "email_daily_limit", value: String(limit) });
  }
  const site = str(form, "public_site_url", 200);
  if (site) {
    if (!/^https:\/\/[^\s/]+\.[^\s]+$/i.test(site)) return { error: "The public page link should start with https://" };
    rows.push({ key: "public_site_url", value: site });
  }

  if (!rows.length) return { ok: true };
  const supabase = await createClient();
  const { error } = await supabase.from("pack_settings").upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })));
  if (error) return { error: "Couldn't save settings." };
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Weekly newsletter
// ---------------------------------------------------------------------------
export async function saveNewsletterMode(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const mode = str(form, "newsletter_mode");
  if (!["off", "test", "everyone"].includes(mode)) return { error: "Choose who gets the newsletter." };
  const testers = form.getAll("tester").map(String).filter((x) => UUID.test(x)).slice(0, 20);
  if (mode === "test" && !testers.length) return { error: "Tick at least one person to get the test copy." };
  const now = new Date().toISOString();
  const supabase = await createClient();
  const { error } = await supabase.from("pack_settings").upsert([
    { key: "newsletter_mode", value: mode, updated_at: now },
    { key: "newsletter_test_adults", value: testers.join(","), updated_at: now },
  ]);
  if (error) return { error: "Couldn't save that." };
  revalidatePath("/admin", "layout");
  return {
    ok: true,
    message: mode === "everyone" ? "Every family gets it from next Sunday" : mode === "test" ? `${testers.length} ${testers.length === 1 ? "person gets" : "people get"} the test copy` : "Turned off",
  };
}

/** Email this week's newsletter to the admin who asked (it isn't counted as their Sunday copy). */
export async function emailNewsletterPreview(): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!adminConfigured()) return { error: "The server's secret key isn't set." };
  const error = await sendPreview(createAdminClient(), me.id);
  return error ? { error } : { ok: true, message: `Sent to ${me.email}` };
}

// ---------------------------------------------------------------------------
// Beta site testers
// ---------------------------------------------------------------------------
/** Pilot only: on/off, and the people let in besides leaders (Pack admin → Pilot only). */
export async function savePilot(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const on = bool(form, "pilot_only");
  const people = [...new Set(form.getAll("pilot_person").map(String).filter((x) => UUID.test(x)))].slice(0, 60);
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("pack_settings").upsert([
    { key: "pilot_only", value: on ? "on" : "", updated_at: now },
    { key: "pilot_people", value: people.join(","), updated_at: now },
  ]);
  if (error) return { error: "Couldn't save that." };
  revalidatePath("/admin", "layout");
  return {
    ok: true,
    message: on
      ? `Pilot only: leaders${people.length ? ` and ${people.length} other${people.length === 1 ? "" : "s"}` : ""} can use the app.`
      : "The app is open to every family on the roster.",
  };
}

/** Two-step sign-in: a leader lost their phone. They set it up again at their next sign-in. */
export async function resetTwoStep(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const id = String(form.get("adult_id") ?? "");
  if (!UUID.test(id)) return { error: "Pick someone." };
  if (!adminConfigured()) return { error: "The server key isn't set up." };
  const problem = await resetTwoStepFor(id);
  if (problem) return { error: problem };
  revalidatePath("/admin", "layout");
  return {
    ok: true,
    message:
      id === me.id
        ? "Reset. You'll be signed out: sign in again and set up your app."
        : "Reset. They're signed out everywhere, and will set up their app again when they next sign in.",
  };
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
      `Open this link on your phone: it shows how to add the app to your home screen (one tap on Android). Then open Pack 361 from the new icon and sign in with this email address (${a.email}). We'll email you a one-time code, so there's no password to remember.`,
      `${APP_URL}/get`,
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

  if (oneId && !UUID.test(oneId)) return { error: "Unknown person." };

  let q = supabase.from("adults").select("id, first_name, preferred_name, email, family_id, role, welcomed_at").eq("is_active", true);
  if (oneId) q = q.eq("id", oneId);
  else q = q.is("welcomed_at", null);
  const { data } = await q.order("last_name");
  const signIns = await getSignIns();
  const waiting = (data ?? []).filter((a) => oneId || !signIns.get(a.id as string));
  // While the pilot runs, only the people it lets in are welcomed; the rest wait for the vote.
  const pilot = await getPilot();
  const targets = waiting.filter((a) => pilotAllows(pilot, { id: a.id as string, role: a.role as AppRole }));
  const held = waiting.length - targets.length;
  if (oneId && held) return { error: "The app is pilot only, so they can't use it yet. Pack admin → Pilot only." };
  if (!targets.length) {
    return { ok: true, message: held ? `Everyone in the pilot has been welcomed. ${held} more wait until the app is open to everyone.` : "Everyone has been welcomed already." };
  }
  if (left <= 0) return { error: "Today's email limit is used up. Send the rest tomorrow." };

  // Claim the batch before sending, so a double tap (or two admins at once) can't email the
  // same people twice: only rows this request marked get an email. Resending to one person
  // is deliberate, so that one is claimed even if they were welcomed before.
  const picked = targets.slice(0, Math.min(left, 100));
  const pickedIds = picked.map((a) => a.id as string);
  let claim = supabase.from("adults").update({ welcomed_at: new Date().toISOString() }).in("id", pickedIds);
  if (!oneId) claim = claim.is("welcomed_at", null);
  const { data: claimed, error: claimError } = await claim.select("id");
  if (claimError) return { error: "Couldn't start sending. Try again." };
  const claimedIds = new Set((claimed ?? []).map((r) => r.id as string));
  const batch = picked.filter((a) => claimedIds.has(a.id as string));
  if (!batch.length) return { ok: true, message: "Those welcome emails are already being sent." };

  const err = await sendEmails(batch.map((a) => welcomeEmail(a as { first_name: string; preferred_name: string | null; email: string })));
  if (err) {
    // A timeout or dropped connection may still have delivered them: leave them marked
    // rather than risk a second copy. Any other error means nothing went out, so un-claim.
    const unsure = err === "Couldn't reach the email service.";
    if (!unsure) {
      if (oneId) {
        await supabase.from("adults").update({ welcomed_at: (batch[0].welcomed_at as string | null) ?? null }).eq("id", oneId);
      } else {
        await supabase.from("adults").update({ welcomed_at: null }).in("id", batch.map((a) => a.id as string));
      }
    }
    revalidatePath("/admin/welcome");
    return {
      error: unsure
        ? "The email service didn't answer, so these may or may not have gone out. They're marked as sent so no one gets two; resend to anyone who says they didn't get it."
        : `Emails not sent: ${err}`,
    };
  }
  revalidatePath("/admin/welcome");
  const rest = targets.length - picked.length;
  return {
    ok: true,
    message: `Sent ${batch.length} welcome email${batch.length === 1 ? "" : "s"}.${rest > 0 ? ` ${rest} more to send tomorrow.` : ""}${held ? ` ${held} wait until the app is open to everyone.` : ""}`,
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

// ---------------------------------------------------------------------------
// Ask to join
// ---------------------------------------------------------------------------
async function joinRequest(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("join_requests").select("id, email, first_name, status").eq("id", id).maybeSingle();
  return data as { id: string; email: string; first_name: string; status: string } | null;
}

export async function approveJoin(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = str(form, "id");
  if (!UUID.test(id)) return { error: "Unknown request." };
  const req = await joinRequest(id);
  if (!req || req.status !== "pending") return { error: "That request was already handled." };
  const family = str(form, "family_id");
  const scouts: { first_name: string; last_name: string; den_id: string | null }[] = [];
  for (const i of form.getAll("scout").map(String)) {
    if (!/^\d$/.test(i) || !bool(form, `keep_${i}`)) continue;
    const first = str(form, `first_${i}`, 60);
    const last = str(form, `last_${i}`, 60);
    if (!first || !last) return { error: "Each scout you add needs a first and last name." };
    const den = str(form, `den_${i}`);
    scouts.push({ first_name: first, last_name: last, den_id: UUID.test(den) ? den : null });
  }
  const supabase = await createClient();
  const { data: familyId, error } = await supabase.rpc("approve_join_request", {
    p_request: id,
    p_family: UUID.test(family) ? family : null,
    p_family_name: str(form, "family_name", 80) || null,
    p_scouts: scouts,
  });
  if (error) {
    if (/already has that email/i.test(error.message)) return { error: "Someone on the roster already has that email. Turn them back on in Families and scouts instead." };
    if (/already handled/i.test(error.message)) return { error: "That request was already handled." };
    return { error: dbError(error.message) };
  }

  let sent = "";
  const pilotOn = (await getPilot()).on;
  if (pilotOn && bool(form, "email")) sent = " No email sent: the app is pilot only, so they'd just see the coming-soon page. Let them know when it opens.";
  else if (bool(form, "email") && emailConfigured()) {
    const err = await sendEmails([
      {
        to: req.email,
        subject: "You're on the Pack 361 app",
        paragraphs: [
          `Hi ${req.first_name},`,
          "A pack admin added you to the Pack 361 roster, so the app is open to you now: the pack calendar, campout details, your scout's advancement, announcements, volunteer sign-ups and photos.",
          `Sign in with this email address (${req.email}). We'll email you a one-time code, so there's no password to remember.`,
          `${APP_URL}/login`,
          "Tip: on your phone, add it to your home screen so it opens like an app.",
          "Welcome to the pack!\nPack 361",
        ],
      },
    ]);
    sent = err ? ` The email didn't go out (${err}).` : " They've been emailed.";
  }
  revalidateRoster(familyId as string);
  revalidatePath("/admin/join");
  return { ok: true, message: `${req.first_name} is on the roster.${sent}` };
}

export async function declineJoin(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = str(form, "id");
  if (!UUID.test(id)) return { error: "Unknown request." };
  const req = await joinRequest(id);
  if (!req || req.status !== "pending") return { error: "That request was already handled." };
  const reason = str(form, "reason", 500);
  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_join_request", { p_request: id, p_reason: reason || null });
  if (error) return { error: /already handled/i.test(error.message) ? "That request was already handled." : "Couldn't save that. Try again." };
  if (bool(form, "email") && emailConfigured()) {
    await sendEmails([
      {
        to: req.email,
        subject: "About your Pack 361 app request",
        paragraphs: [
          `Hi ${req.first_name},`,
          `Thanks for asking to join the Pack 361 app. A pack admin wasn't able to add you yet.${reason ? ` Their note: “${reason}”` : ""}`,
          "If you think this is a mistake, reply to this email and we'll sort it out.",
          "Pack 361",
        ],
      },
    ]);
  }
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Declined." };
}

// ---------------------------------------------------------------------------
// Roster check (Scoutbook roster export compared in the browser; only the picked changes come here)
// ---------------------------------------------------------------------------
function pairs(form: FormData, a: string, b: string): [string, string][] {
  const xs = form.getAll(a).map(String);
  const ys = form.getAll(b).map(String);
  return xs.slice(0, 200).map((x, i) => [x, ys[i] ?? ""]);
}

/** Move scouts to the den Scoutbook has them in. */
export async function rosterMoveScouts(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const moves = pairs(form, "scout_id", "den_id").filter(([s, d]) => UUID.test(s) && UUID.test(d));
  if (!moves.length) return { error: "Nothing to move." };
  const supabase = await createClient();
  for (const [scout, den] of moves) {
    const { error } = await supabase.from("scouts").update({ den_id: den }).eq("id", scout);
    if (error) return { error: dbError(error.message) };
  }
  revalidateRoster();
  return { ok: true, message: moves.length === 1 ? "Moved." : `Moved ${moves.length} scouts.` };
}

/** Save BSA member IDs from Scoutbook on scouts matched by name. */
export async function rosterSaveMemberIds(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const list = pairs(form, "scout_id", "member_id").filter(([s, m]) => UUID.test(s) && /^\d{5,12}$/.test(m));
  if (!list.length) return { error: "Nothing to save." };
  const supabase = await createClient();
  let saved = 0;
  for (const [scout, id] of list) {
    const { error } = await supabase.from("scouts").update({ bsa_member_id: id }).eq("id", scout).is("bsa_member_id", null);
    if (error) return { error: `${saved ? `Saved ${saved}, then: ` : ""}${dbError(error.message)}` };
    saved++;
  }
  revalidateRoster();
  return { ok: true, message: saved === 1 ? "Saved." : `Saved ${saved} member IDs.` };
}

/** Turn scouts on or off (registered again, or no longer in Scoutbook). */
export async function rosterSetActive(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const ids = form.getAll("scout_id").map(String).filter((s) => UUID.test(s)).slice(0, 200);
  if (!ids.length) return { error: "Nothing to change." };
  const active = str(form, "active") === "true";
  const supabase = await createClient();
  const { error } = await supabase.from("scouts").update({ is_active: active }).in("id", ids);
  if (error) return { error: dbError(error.message) };
  revalidateRoster();
  const n = ids.length === 1 ? "" : ` ${ids.length} scouts`;
  return { ok: true, message: active ? `Turned back on${n}.` : `Turned off${n}.` };
}

/** Add a scout who's registered in Scoutbook: into a family, or a new family with a parent. */
export async function rosterAddScout(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const first = str(form, "first_name", 60);
  const last = str(form, "last_name", 60);
  const memberId = opt(form, "bsa_member_id", 20);
  const den = str(form, "den_id");
  let family = str(form, "family_id");
  if (!first || !last) return { error: "Add a first and last name." };
  if (memberId && !/^\d{5,12}$/.test(memberId)) return { error: "BSA member IDs are numbers only." };
  const parent = {
    first_name: str(form, "parent_first", 60),
    last_name: str(form, "parent_last", 60) || last,
    email: str(form, "parent_email", 200).toLowerCase(),
  };
  const supabase = await createClient();

  if (!UUID.test(family)) {
    if (parent.email && !EMAIL.test(parent.email)) return { error: "The parent's email doesn't look right." };
    if (parent.email && !parent.first_name) return { error: "Add the parent's first name, or leave their email blank." };
    if (parent.email) {
      const { count } = await supabase.from("adults").select("id", { count: "exact", head: true }).eq("email", parent.email);
      if (count) return { error: "Someone on the roster already has that parent email. Pick their family instead." };
    }
    const { data, error } = await supabase
      .from("families")
      .insert({ family_name: str(form, "family_name", 80) || last })
      .select("id")
      .single();
    if (error || !data) return { error: dbError(error?.message ?? "") };
    family = data.id as string;
    if (parent.email) {
      const { error: aErr } = await supabase.from("adults").insert({ ...parent, family_id: family, role: "parent" });
      if (aErr) {
        await supabase.from("families").delete().eq("id", family);
        return { error: dbError(aErr.message) };
      }
    }
  }
  const { error } = await supabase
    .from("scouts")
    .insert({ family_id: family, first_name: first, last_name: last, bsa_member_id: memberId, den_id: UUID.test(den) ? den : null });
  if (error) return { error: dbError(error.message) };
  revalidateRoster(family);
  return { ok: true, message: `${first} added.${parent.email ? ` ${parent.first_name} can sign in with ${parent.email}.` : ""}` };
}
