"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

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
    const wait = /rate|seconds/i.test(error.message);
    return {
      step: "email",
      email,
      error: wait ? "Too many tries. Wait a minute and try again." : "Couldn't send the email. Try again in a minute.",
    };
  }
  // Same message whether or not the address is on the roster (doesn't reveal who's in the pack).
  return {
    step: "code",
    email,
    message: `We sent a sign-in email to ${email}. Tap the link in it, or type the code below.`,
  };
}

export async function verifyLoginCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = cleanEmail(form.get("email"));
  const token = String(form.get("code") ?? "").replace(/\D/g, "");
  if (token.length < 6) return { step: "code", email, error: "Enter the code from the email." };
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { step: "code", email, error: "That code didn't work or has expired. Request a new one." };
  redirect("/");
}
