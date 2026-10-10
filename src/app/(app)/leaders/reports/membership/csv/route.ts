import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/data";
import { chargeLabel, getMembershipReport } from "@/lib/reports";
import { seasonOf } from "@/lib/finance";
import { regStatus } from "@/lib/registration";
import { ROLE_LABEL } from "@/lib/roster-data";
import { toCsv } from "@/lib/csv";
import { easternDate } from "@/lib/tz";
import type { AppRole } from "@/lib/types";
import { logDownload } from "@/lib/security-log";

// The membership report as a spreadsheet (no contact details). Only for the people who may open
// it (the database checks).
export async function GET(request: NextRequest) {
  const me = await getMe();
  if (!me?.adult || me.held || me.termsDue) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const today = easternDate(Date.now());
  const asked = request.nextUrl.searchParams.get("season") ?? "";
  const season = /^\d{4}-\d{2}$/.test(asked) ? asked : seasonOf(today);
  const rows = await getMembershipReport(season);
  if (!rows) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const out: (string | null)[][] = [
    ["Scout or adult", "Name", "Den", "Role", "Family", "Registration expires", "Registration", "National fee", "Council fee", `Pack dues ${season}`],
    ...rows.map((r) => [
      r.person,
      r.name,
      r.den,
      r.role ? ROLE_LABEL[r.role as AppRole] : null,
      r.family,
      r.registration_expires_on,
      regStatus(r.registration_expires_on, today).label,
      chargeLabel(r.national_fee),
      chargeLabel(r.council_fee),
      r.person === "Scout" ? chargeLabel(r.pack_dues) || "No dues charge" : "",
    ]),
  ];
  await logDownload("membership");
  return new NextResponse(toCsv(out), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pack361-membership-${season}-${today}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
