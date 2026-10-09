"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { SPLASH_COOKIE, SPLASH_COOKIE_OPTIONS } from "@/lib/splash";
import { createClient } from "@/lib/supabase/server";
import { needsTwoStepAfterEmail } from "@/lib/two-step";

const HELP = "app@pack361.org";

export type LoginState = { step: "email" | "code"; email: string; message?: string; error?: string };

function cleanEmail(v: FormDataEntryValue | null) {
  return String(v ?? "").trim().toLowerCase();
}

export async function sendLoginEmail(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = cleanEmail(form.get("email"));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { step: "email", email, error: "Enter the email address you gave the pack." };
  }
  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) {
    // Sign-in emails are rate limited (per address, and for the whole pack per hour) to protect
    // the pack's email quota. Either way, a person can always reach us.
    const wait = /rate|seconds|too many/i.test(error.message);
    return {
      step: "email",
      email,
      error: wait
        ? `Too many sign-in emails were sent just now. Wait a few minutes and try again. Still stuck? Email ${HELP} and we'll get you in.`
        : `Couldn't send the email. Try again in a minute, or email ${HELP} and we'll get you in.`,
    };
  }
  // Same message whether or not the address is on the roster (doesn't reveal who's in the pack).
  return { step: "code", email };
}

export async function verifyLoginCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = cleanEmail(form.get("email"));
  const token = String(form.get("code") ?? "").replace(/\D/g, "");
  if (token.length < 6) return { step: "code", email, error: "Enter the code from the email." };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) {
    const wait = /rate|seconds|too many/i.test(error.message);
    return {
      step: "code",
      email,
      error: wait
        ? `Too many tries. Wait a few minutes, or email ${HELP} for help.`
        : "That code didn't work or has expired. Request a new one below.",
    };
  }
  // Leaders go on to their authenticator code; the welcome animation plays once they've entered it.
  if (await needsTwoStepAfterEmail(supabase, data.user?.id)) redirect("/two-step");
  (await cookies()).set(SPLASH_COOKIE, "1", SPLASH_COOKIE_OPTIONS); // the welcome animation
  redirect("/");
}
