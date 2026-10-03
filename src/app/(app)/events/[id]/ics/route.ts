import { type NextRequest } from "next/server";
import { getEvent, requireMember } from "@/lib/data";
import { buildIcs } from "@/lib/ics";
import { eventPath } from "@/lib/featured";

// "Add to my calendar": one event as an .ics file (/events/<id>/ics, campouts too). Signed-in
// members only, and only events they can see (the database decides, as on the event page).
// Phones open it in the calendar app with an "Add" button; computers download it.
export async function GET(request: NextRequest, ctx: RouteContext<"/events/[id]/ics">) {
  await requireMember(); // sends visitors to sign in
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const e = await getEvent(id);
  if (!e) return new Response("Not found", { status: 404 });

  const url = `${request.nextUrl.origin}${eventPath(e)}`;
  const ics = buildIcs("Pack 361", [
    {
      id: e.id,
      title: e.title,
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      location: [e.location_name, e.address].filter(Boolean).join(", ") || null,
      description: [e.details, e.signup_url ? `Sign up: ${e.signup_url}` : null, url].filter(Boolean).join("\n\n"),
      url,
      allDay: e.all_day,
    },
  ])
    // A single event to add, not a calendar to subscribe to: drop the feed's name and refresh lines,
    // so calendar apps add it to the person's own calendar instead of making a new one.
    .split("\r\n")
    .filter((line) => !/^(X-WR-CALNAME|X-WR-TIMEZONE|REFRESH-INTERVAL|X-PUBLISHED-TTL)[:;]/.test(line))
    .join("\r\n");

  const file = e.title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "pack361-event";
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${file}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
