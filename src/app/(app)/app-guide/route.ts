import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/data";

// The app guide (docs/guide/Pack361-App-Guide.pdf), always the copy that shipped with this
// release, so app.pack361.org/app-guide never goes out of date. Members only: Part 2 covers how
// leaders run things. next.config.ts includes the file in this route's server bundle.
const GUIDE = path.join(process.cwd(), "docs", "guide", "Pack361-App-Guide.pdf");

export async function GET(req: NextRequest) {
  const me = await getMe();
  if (!me?.adult || me.held) {
    const to = new URL("/login", req.url);
    return NextResponse.redirect(to);
  }
  const pdf = await readFile(GUIDE);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="Pack361-App-Guide.pdf"',
      // Always ask again, so a new release's guide shows right away (and never sits in a shared cache).
      "Cache-Control": "private, no-cache",
    },
  });
}
