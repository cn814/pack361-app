import { NextResponse } from "next/server";
import { getMe, isLeader } from "@/lib/data";
import { getTrainingReport } from "@/lib/reports";
import { COURSE_BY_KEY } from "@/lib/training";
import { toCsv } from "@/lib/csv";
import { easternDate } from "@/lib/tz";
import { logDownload } from "@/lib/security-log";

// Leaders: the training report as a spreadsheet: each leader's positions, what they still need,
// and each course's completed and expiry dates.
export async function GET() {
  const me = await getMe();
  if (!me?.adult || !isLeader(me.adult)) return NextResponse.json({ error: "Leaders only" }, { status: 403 });
  const { rows, columns } = await getTrainingReport();
  const out: (string | null)[][] = [
    ["Name", "Member ID", "Positions", "Dens", "Still needs", "Suggested", ...columns.flatMap((c) => [`${COURSE_BY_KEY[c].short} taken`, `${COURSE_BY_KEY[c].short} expires`])],
    ...rows.map((r) => [
      r.name,
      r.memberId,
      r.positions,
      r.dens,
      r.missing.join(", "),
      r.suggested.join(", "),
      ...columns.flatMap((c) => [r.courses[c]?.completed_on ?? null, r.courses[c]?.expires_on ?? null]),
    ]),
  ];
  await logDownload("training");
  return new NextResponse(toCsv(out), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pack361-training-${easternDate(Date.now())}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
