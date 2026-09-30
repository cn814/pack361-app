import { type NextRequest } from "next/server";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { buildIcs } from "@/lib/ics";

// Private calendar feed: /api/calendar/<token>.ics
// Calendar apps can't sign in, so the per-adult token is the key. The feed holds only pack
// events (the same for every member) and stops working if the adult leaves the roster.
export async function GET(request: NextRequest, ctx: RouteContext<"/api/calendar/[token]">) {
  const { token } = await ctx.params;
  const id = token.replace(/\.ics$/i, "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !adminConfigured()) return new Response("Not found", { status: 404 });

  const db = createAdminClient();
  const { data: adult } = await db
    .from("adults")
    .select("id")
    .eq("calendar_token", id)
    .eq("is_active", true)
    .maybeSingle();
  if (!adult) return new Response("Not found", { status: 404 });

  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const { data: events } = await db
    .from("events")
    .select("id, title, category, starts_at, ends_at, location_name, address, details, signup_url")
    .gte("starts_at", since)
    .order("starts_at")
    .limit(500);

  const origin = request.nextUrl.origin;
  const ics = buildIcs(
    "Pack 361",
    (events ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      location: [e.location_name, e.address].filter(Boolean).join(", ") || null,
      description: [e.details, e.signup_url ? `Sign up: ${e.signup_url}` : null, `${origin}/${e.category === "Campout" ? `campouts/${e.id}` : "events"}`]
        .filter(Boolean)
        .join("\n\n"),
      url: `${origin}/${e.category === "Campout" ? `campouts/${e.id}` : "events"}`,
    })),
  );
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="pack361.ics"',
      "Cache-Control": "private, max-age=900",
    },
  });
}
