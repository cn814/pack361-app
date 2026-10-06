import { NextResponse } from "next/server";
import { getMe, isLeader } from "@/lib/data";
import { FORM_REPORT_LABEL, getFormsReport } from "@/lib/reports";
import { toCsv } from "@/lib/csv";
import { easternDate } from "@/lib/tz";

// Leaders: everyone's medical form (Parts A and B) as a spreadsheet: state, form date, good-through
// date, and who last checked it. No medical details: the app never has them.
export async function GET() {
  const me = await getMe();
  if (!me?.adult || !isLeader(me.adult)) return NextResponse.json({ error: "Leaders only" }, { status: 403 });
  const rows = await getFormsReport();
  const out: (string | null)[][] = [
    ["Scout or adult", "Name", "Den or family", "Form", "Form date", "Good through", "Last changed", "Changed by"],
    ...rows.map((r) => [r.person, r.name, r.group, FORM_REPORT_LABEL[r.state], r.form_date, r.expires_on, r.updated_at ? easternDate(r.updated_at) : null, r.updated_by]),
  ];
  return new NextResponse(toCsv(out), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pack361-medical-forms-${easternDate(Date.now())}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
