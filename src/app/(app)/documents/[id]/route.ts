import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { DOCS_BUCKET } from "@/lib/document-files";

const UUID = /^[0-9a-f-]{36}$/i;
// Long enough to start the download on a slow phone; links are made fresh on every tap.
const SIGNED_SECONDS = 60;

const noStore = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

/**
 * A stable address for a document (/documents/<id>), safe to put in the Pack guide or an
 * email. Checks the person can see it, then sends them to a short-lived signed address for
 * the file. Add ?download=1 to save it instead of opening it.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/documents/[id]">) {
  const { id } = await ctx.params;
  const back = (q: string) => NextResponse.redirect(new URL(`/documents?${q}`, request.url), { status: 303, headers: noStore });

  // In-app links (the guide uses Next's Link) ask for page data and prefetch in the background.
  // Answer those with nothing, so the browser loads this address for real on tap instead of
  // downloading the file ahead of time.
  if (request.headers.get("rsc") || request.headers.get("next-router-prefetch")) {
    return new NextResponse(null, { status: 204, headers: noStore });
  }

  const me = await getMe();
  if (!me) return NextResponse.redirect(new URL("/login", request.url), { status: 303, headers: noStore });
  if (!me.adult) return NextResponse.redirect(new URL("/not-on-roster", request.url), { status: 303, headers: noStore });
  if (me.held) return NextResponse.redirect(new URL("/not-yet", request.url), { status: 303, headers: noStore });
  if (me.termsDue) return NextResponse.redirect(new URL("/terms", request.url), { status: 303, headers: noStore });
  if (!UUID.test(id)) return back("missing=1");

  // Row Level Security decides whether this person can see the document, and the storage
  // policy only signs files whose document they can see.
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("storage_path, file_name").eq("id", id).maybeSingle();
  if (!doc) return back("missing=1");
  const download = request.nextUrl.searchParams.has("download");
  const { data, error } = await supabase.storage
    .from(DOCS_BUCKET)
    .createSignedUrl(doc.storage_path as string, SIGNED_SECONDS, download ? { download: doc.file_name as string } : undefined);
  if (error || !data?.signedUrl) return back("missing=1");
  return NextResponse.redirect(data.signedUrl, { status: 303, headers: noStore });
}
