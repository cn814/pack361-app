import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Target of the sign-in email link. The Supabase email template must point here:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
// Verifying by token hash (instead of a PKCE code) works even when the link is opened
// in a different browser or app than the one that requested it.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "email") as EmailOtpType;
  const code = searchParams.get("code");
  const supabase = await createClient();

  let ok = false;
  if (token_hash) {
    ok = !(await supabase.auth.verifyOtp({ token_hash, type })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error; // default template fallback
  }
  return NextResponse.redirect(new URL(ok ? "/" : "/login?error=link", origin));
}
