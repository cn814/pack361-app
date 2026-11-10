import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { LEFT_HEADER, LOCKED_HEADER } from "@/lib/idle";

// The leader lock (src/lib/idle.ts). The proxy does the work: it reads the signed "last used"
// cookie and passes the answer on in request headers it sets itself.
//   GET  -> { locked, leftMs }: how long until a leader's account locks (not counted as use), so
//           a tab that sat still can check whether another tab kept the account in use.
//   POST -> "still here": the person is typing or tapping on a page without loading a new one;
//           the proxy counts the request as use and freshens the cookie.
export const dynamic = "force-dynamic";

export async function GET() {
  const h = await headers();
  const locked = h.get(LOCKED_HEADER) === "1";
  const left = h.get(LEFT_HEADER);
  return NextResponse.json(
    { locked, leftMs: locked ? 0 : left ? Number(left) : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST() {
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
