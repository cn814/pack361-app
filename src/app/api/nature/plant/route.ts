import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { ORGANS, identifyUrl, parsePlantResults, type Organ } from "@/lib/plant-id";

// Plant ID: a member's photo goes to Pl@ntNet with the pack's key (kept here on the server), and
// the top matches come back. The photo is shrunk in the browser first (which also drops its
// location data) and is never stored here; Pl@ntNet says it doesn't keep submitted photos either.

const MAX_BYTES = 2_000_000;

async function isJpeg(b: Blob) {
  const head = new Uint8Array(await b.slice(0, 3).arrayBuffer());
  return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
}

const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  // Only from the app's own pages.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.nextUrl.host) return fail("Not allowed.", 403);
  const me = await getMe();
  if (!me?.adult || me.held || me.termsDue) return fail("Sign in to identify plants.", 401);
  const key = process.env.PLANTNET_API_KEY;
  if (!key) return fail("Plant ID isn't set up yet. Ask a pack admin.", 503);

  const form = await req.formData().catch(() => null);
  const image = form?.get("image");
  const organRaw = String(form?.get("organ") ?? "auto");
  const organ: Organ = (ORGANS as readonly string[]).includes(organRaw) ? (organRaw as Organ) : "auto";
  if (!(image instanceof Blob) || image.size === 0) return fail("No photo received.", 400);
  if (image.size > MAX_BYTES) return fail("That photo is too large.", 413);
  if (!(await isJpeg(image))) return fail("Only photos can be identified.", 415);

  const supabase = await createClient();
  const { error: limit } = await supabase.rpc("claim_plant_id");
  if (limit) {
    return fail(
      limit.code === "54000" ? `${limit.message}. Try again tomorrow, or use the Seek app.` : "Couldn't check today's plant IDs. Try again.",
      limit.code === "54000" ? 429 : 500,
    );
  }

  const body = new FormData();
  body.append("organs", organ);
  body.append("images", image, "plant.jpg");
  try {
    const res = await fetch(identifyUrl(key), { method: "POST", body, signal: AbortSignal.timeout(20000), cache: "no-store" });
    if (res.status === 404) return NextResponse.json({ matches: [] }, { headers: { "Cache-Control": "no-store" } });
    if (res.status === 429) return fail("Pl@ntNet is busy right now. Try again in a minute.", 429);
    if (!res.ok) return fail("Couldn't identify that one. Try again with a closer photo of a leaf or flower.", 502);
    return NextResponse.json({ matches: parsePlantResults(await res.json()) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("No answer from Pl@ntNet. Check your signal and try again.", 504);
  }
}
