import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TERMS_VERSION } from "./policies";

// The sign-in page asks people to tick "I agree to the terms of use and data policy" before it
// emails them a code. Until they're signed in we don't know who they are, so the tick waits in a
// short-lived cookie and is recorded on their adult row as soon as the sign-in succeeds (code or
// email link on the same device). Anyone who signs in some other way agrees on /terms instead.

const COOKIE = "pack_terms";

/** The sign-in form was ticked: remember it for this browser for a day. */
export async function rememberTermsTick() {
  (await cookies()).set(COOKIE, String(TERMS_VERSION), { path: "/", maxAge: 86400, sameSite: "lax", secure: true, httpOnly: true });
}

/** Right after a successful sign-in: record the agreement if this browser ticked the box. */
export async function recordTermsTick(supabase: SupabaseClient) {
  const jar = await cookies();
  if (jar.get(COOKIE)?.value !== String(TERMS_VERSION)) return;
  const { error } = await supabase.rpc("accept_terms", { p_version: TERMS_VERSION });
  // Not on the roster (or a hiccup): they'll be asked again on /terms, so nothing is lost.
  if (!error) jar.delete(COOKIE);
}
