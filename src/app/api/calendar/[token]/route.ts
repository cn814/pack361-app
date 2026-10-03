import { type NextRequest } from "next/server";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { buildIcs } from "@/lib/ics";
import { denScopeFor, loadCalendar } from "@/lib/calendar";
import type { AppRole } from "@/lib/types";

// Private calendar feed: /api/calendar/<token>.ics
// Calendar apps can't sign in, so the per-adult token is the key. The feed holds pack-wide
// events plus the events and den meetings for that adult's scouts' dens (leaders: every den).
// It stops working if the adult leaves the roster.
export async function GET(request: NextRequest, ctx: RouteContext<"/api/calendar/[token]">) {
  const { token } = await ctx.params;
  const id = token.replace(/\.ics$/i, "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !adminConfigured()) return new Response("Not found", { status: 404 });

  const db = createAdminClient();
  const { data: adult } = await db
    .from("adults")
    .select("id, role, family_id")
    .eq("calendar_token", id)
    .eq("is_active", true)
    .maybeSingle();
  if (!adult) return new Response("Not found", { status: 404 });

  const scope = await denScopeFor(db, adult as { role: AppRole; family_id: string | null });
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const items = await loadCalendar(db, scope, { since, limit: 500 });

  const origin = request.nextUrl.origin;
  const ics = buildIcs(
    "Pack 361",
    items.map((e) => ({
      id: e.kind === "meeting" ? `meeting-${e.id}` : e.id,
      title: e.den_name && e.kind === "meeting" ? `${e.den_name}: ${e.title}` : e.title,
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      location: [e.location_name, e.address].filter(Boolean).join(", ") || null,
      description: [e.details, e.signup_url ? `Sign up: ${e.signup_url}` : null, `${origin}${e.href}`].filter(Boolean).join("\n\n"),
      url: `${origin}${e.href}`,
      allDay: e.all_day,
      leadersOnly: Boolean(e.leaders_only),
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
