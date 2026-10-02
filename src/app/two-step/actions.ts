"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMe, needsTwoStep } from "@/lib/data";
import type { ActionResult } from "@/components/ActionForm";

const HELP = "info@pack361.org";

function cleanCode(v: FormDataEntryValue | null) {
  return String(v ?? "").replace(/\D/g, "");
}

function tooMany(message: string) {
  return /rate|too many|seconds/i.test(message);
}

/** Who may add an authenticator app: pack leadership, the Cubmaster and admins. */
async function eligible() {
  const me = await getMe();
  if (!me?.adult || !needsTwoStep(me.role)) return null;
  return me;
}

export type SetupStart = { factorId: string; qr: string; secret: string; uri: string } | { error: string };

/** Step 1 of adding an authenticator app: a new key, shown as a QR code and as text. */
export async function startTwoStepSetup(): Promise<SetupStart> {
  const me = await eligible();
  if (!me) return { error: "Two-step sign-in is for pack leadership and admins." };
  const supabase = await createClient();
  // Clear any half-finished setup first (scanned but never confirmed).
  const { data: list } = await supabase.auth.mfa.listFactors();
  for (const f of list?.all ?? []) {
    if (f.factor_type === "totp" && f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const added = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: "Pack 361",
    friendlyName: `Added ${added}`,
  });
  if (error || !data) {
    return {
      error: tooMany(error?.message ?? "")
        ? "Too many tries. Wait a few minutes and try again."
        : `Couldn't start the setup. Try again, or email ${HELP}.`,
    };
  }
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri };
}

/** Step 2: the first code from the app proves it's set up; the session is then fully signed in. */
export async function finishTwoStepSetup(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await eligible();
  if (!me) return { error: "Two-step sign-in is for pack leadership and admins." };
  const factorId = String(form.get("factorId") ?? "");
  const code = cleanCode(form.get("code"));
  if (code.length !== 6) return { error: "Enter the 6-digit code your authenticator app shows for Pack 361." };
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    return {
      error: tooMany(error.message)
        ? "Too many tries. Wait a few minutes and try again."
        : "That code didn't work. Codes change every 30 seconds: enter the one showing now. If it still fails, check the phone's clock is set automatically.",
    };
  }
  revalidatePath("/", "layout");
  if (form.get("next") === "home") redirect("/");
  return { ok: true, message: "Added. Either app's code now works." };
}

/** At sign-in: the code from any of the person's authenticator apps. */
export async function verifyTwoStep(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await getMe();
  if (!me?.adult) redirect("/login");
  const code = cleanCode(form.get("code"));
  if (code.length !== 6) return { error: "Enter the 6-digit code your authenticator app shows for Pack 361." };
  const supabase = await createClient();
  const { data: list } = await supabase.auth.mfa.listFactors();
  let lastError = "";
  for (const f of list?.totp ?? []) {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: f.id, code });
    if (!error) {
      revalidatePath("/", "layout");
      redirect("/");
    }
    lastError = error.message;
  }
  return {
    error: tooMany(lastError)
      ? `Too many tries. Wait a few minutes and try again, or email ${HELP}.`
      : "That code didn't work. Enter the code showing now in your authenticator app (it changes every 30 seconds).",
  };
}

/** My family: take off one of several authenticator apps (the last one can't be removed). */
export async function removeTwoStepDevice(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await eligible();
  if (!me || me.twoStep !== "ok") return { error: "Sign in with your code first." };
  const factorId = String(form.get("factorId") ?? "");
  const supabase = await createClient();
  const { data: list } = await supabase.auth.mfa.listFactors();
  const verified = list?.totp ?? [];
  if (!verified.some((f) => f.id === factorId)) return { error: "That app isn't on your account." };
  if (verified.length < 2) return { error: "Add another app before removing this one: you always need at least one." };
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return { error: `Couldn't remove it. Try again, or email ${HELP}.` };
  revalidatePath("/family");
  return { ok: true, message: "Removed." };
}
