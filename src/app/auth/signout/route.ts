import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_COOKIE } from "@/lib/idle";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const res = NextResponse.redirect(new URL("/login", request.nextUrl.origin), { status: 303 });
  res.cookies.delete(ACTIVE_COOKIE);
  return res;
}
