import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/data";
import { parseTaxonPhoto, taxonUrl } from "@/lib/nature";
import { NWS_USER_AGENT } from "@/lib/weather-nws";

// A photo for a bird the sound ID heard, from iNaturalist (free, no key). Each species is looked
// up at most once a month for the whole pack (Next's fetch cache), and phones keep the answer a day.

const SCIENTIFIC = /^[A-Z][a-z]+ [a-z-]+$/;

export async function GET(req: NextRequest) {
  const me = await getMe();
  if (!me?.adult || me.held || me.termsDue) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const name = (req.nextUrl.searchParams.get("name") ?? "").trim().slice(0, 80);
  if (!SCIENTIFIC.test(name)) return NextResponse.json({ error: "Bad name" }, { status: 400 });
  try {
    const res = await fetch(taxonUrl(name), {
      headers: { "User-Agent": NWS_USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 30 * 86400 },
    });
    const photo = res.ok ? parseTaxonPhoto(await res.json(), name) : { photo: null, credit: null, url: null };
    return NextResponse.json(photo, { headers: { "Cache-Control": "private, max-age=86400" } });
  } catch {
    return NextResponse.json({ photo: null, credit: null, url: null }, { headers: { "Cache-Control": "no-store" } });
  }
}
