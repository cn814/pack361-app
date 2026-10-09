import { NextResponse, type NextRequest } from "next/server";
import { getMe, isLeader } from "@/lib/data";
import { buildAttendanceReport } from "@/lib/attendance-data";
import { seasonOf } from "@/lib/finance";
import { toCsv } from "@/lib/csv";
import { easternDate } from "@/lib/tz";
import { logDownload } from "@/lib/security-log";

// Leaders: the attendance report for a season (July to June) as a spreadsheet, one row per scout.
export async function GET(request: NextRequest) {
  const me = await getMe();
  if (!me?.adult || !isLeader(me.adult)) return NextResponse.json({ error: "Leaders only" }, { status: 403 });
  const today = easternDate(Date.now());
  const r =
    (await buildAttendanceReport(me.adult, request.nextUrl.searchParams.get("season") ?? "")) ??
    (await buildAttendanceReport(me.adult, seasonOf(today)))!;

  const rows: (string | number | null)[][] = [
    ["Den", "Scout", "Still in the pack", "Den meetings attended", "Den meetings recorded", "Pack events attended", "Camping nights this season", "Camping nights all time"],
  ];
  for (const d of r.dens) {
    for (const s of d.rows) {
      rows.push([d.name, s.name, s.active ? "Yes" : "No", s.denMeetings, s.denMeetingsHeld, s.events, s.nights, s.nightsAll]);
    }
  }

  const name = `pack361-attendance-${r.season}-${today}.csv`;
  await logDownload("attendance");
  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
