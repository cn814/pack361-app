import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { SPLASH_COOKIE, SPLASH_COOKIE_OPTIONS } from "@/lib/splash";
import { MODE_COOKIE } from "@/lib/mode";

// Target of the sign-in email link. The Supabase email template must point here:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
// Verifying by token hash (instead of a PKCE code) works even when the link is opened
// in a different browser or app than the one that requested it.
//
// On phones, the link first opens a page that asks before signing in (/auth/open). A link in
// an email always opens the phone's browser, never the home-screen app, and signing in there
// would use up the one-time code the person may still want to type into the app.

const PHONE = /iPhone|iPad|iPod|Android/i;

async function verify(request: NextRequest, token_hash: string | null, type: EmailOtpType, code: string | null) {
  const supabase = await createClient();
  let ok = false;
  if (token_hash) ok = !(await supabase.auth.verifyOtp({ token_hash, type })).error;
  else if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error; // default template fallback
  const res = NextResponse.redirect(new URL(ok ? "/" : "/login?error=link", request.nextUrl.origin), 303);
  if (ok) res.cookies.set(SPLASH_COOKIE, "1", SPLASH_COOKIE_OPTIONS); // the welcome animation
  if (ok) res.cookies.delete(MODE_COOKIE); // leaders start in Leader mode
  return res;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "email") as EmailOtpType;
  if (token_hash && PHONE.test(request.headers.get("user-agent") ?? "")) {
    const to = new URL("/auth/open", request.nextUrl.origin);
    to.searchParams.set("token_hash", token_hash);
    to.searchParams.set("type", type);
    return NextResponse.redirect(to);
  }
  return verify(request, token_hash, type, searchParams.get("code"));
}

/** "Sign in here" from /auth/open. */
export async function POST(request: NextRequest) {
  // Only from our own /auth/open page: another site can't post a link token here to sign a
  // visitor into someone else's account.
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.redirect(new URL("/login?error=link", request.nextUrl.origin), 303);
  const form = await request.formData();
  const token_hash = String(form.get("token_hash") ?? "") || null;
  const type = (String(form.get("type") ?? "email") || "email") as EmailOtpType;
  return verify(request, token_hash, type, null);
}
