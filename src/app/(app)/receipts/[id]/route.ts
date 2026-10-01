import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { RECEIPTS_BUCKET } from "@/lib/finance";

const UUID = /^[0-9a-f-]{36}$/i;
const noStore = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

/**
 * Open an expense's receipt (/receipts/<expense id>). Row Level Security decides who can see
 * the expense (leadership, or the person who asked to be paid back), and the storage policy
 * only signs receipts they can see. The signed address lasts a minute.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/receipts/[id]">) {
  const { id } = await ctx.params;
  if (request.headers.get("rsc") || request.headers.get("next-router-prefetch")) {
    return new NextResponse(null, { status: 204, headers: noStore });
  }
  const me = await getMe();
  if (!me) return NextResponse.redirect(new URL("/login", request.url), { status: 303, headers: noStore });
  if (!me.adult) return NextResponse.redirect(new URL("/not-on-roster", request.url), { status: 303, headers: noStore });
  const missing = () => new NextResponse("That receipt isn't available.", { status: 404, headers: noStore });
  if (!UUID.test(id)) return missing();
  const supabase = await createClient();
  const { data: e } = await supabase.from("expenses").select("receipt_path, receipt_name").eq("id", id).maybeSingle();
  if (!e?.receipt_path) return missing();
  const download = request.nextUrl.searchParams.has("download");
  const { data, error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(e.receipt_path as string, 60, download ? { download: (e.receipt_name as string) || "receipt" } : undefined);
  if (error || !data?.signedUrl) return missing();
  return NextResponse.redirect(data.signedUrl, { status: 303, headers: noStore });
}
