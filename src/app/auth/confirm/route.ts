import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { SPLASH_COOKIE, SPLASH_COOKIE_OPTIONS } from "@/lib/splash";
import { needsTwoStepAfterEmail } from "@/lib/two-step";

// Target of the sign-in email link. The Supabase email template must point here:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
// Verifying by token hash (instead of a PKCE code) works even when the link is opened
// in a different browser or app than the one that requested it.
//
// Every link first opens a page that asks before signing in (/auth/open), and only its button
// (a POST) uses up the one-time code:
//  * On phones, a link in an email always opens the phone's browser, never the home-screen app,
//    and signing in there would use up the code the person may still want to type into the app.
//  * Email link scanners (Outlook Safe Links and the like) open every link in an email before the
//    person does. They only GET, so they no longer burn the code on any device.

async function verify(request: NextRequest, token_hash: string | null, type: EmailOtpType, code: string | null) {
  const supabase = await createClient();
  let ok = false;
  let userId: string | undefined;
  if (token_hash) {
    const r = await supabase.auth.verifyOtp({ token_hash, type });
    ok = !r.error;
    userId = r.data.user?.id;
  } else if (code) {
    const r = await supabase.auth.exchangeCodeForSession(code); // default template fallback
    ok = !r.error;
    userId = r.data.user?.id;
  }
  // Leaders go on to their authenticator code; the welcome animation plays once they've entered it.
  const twoStep = ok && (await needsTwoStepAfterEmail(supabase, userId));
  const res = NextResponse.redirect(new URL(!ok ? "/login?error=link" : twoStep ? "/two-step" : "/", request.nextUrl.origin), 303);
  if (ok && !twoStep) res.cookies.set(SPLASH_COOKIE, "1", SPLASH_COOKIE_OPTIONS); // the welcome animation
  return res;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "email") as EmailOtpType;
  if (token_hash) {
    const to = new URL("/auth/open", request.nextUrl.origin);
    to.searchParams.set("token_hash", token_hash);
    to.searchParams.set("type", type);
    return NextResponse.redirect(to);
  }
  // The default template's PKCE code: only the browser that asked for the link holds its
  // verifier, so a scanner opening it can't use it up.
  return verify(request, null, type, searchParams.get("code"));
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
