import { NextResponse } from "next/server";
import { getMe } from "@/lib/data";
import { getRosterReport } from "@/lib/reports";
import { ROLE_LABEL } from "@/lib/roster-data";
import { toCsv } from "@/lib/csv";
import { easternDate } from "@/lib/tz";
import type { AppRole } from "@/lib/types";

// The roster report as a spreadsheet: everyone registered, and everyone who left in the last two
// years. Only for the people who may open the roster report (the database checks).
export async function GET() {
  const me = await getMe();
  if (!me?.adult) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const rows = await getRosterReport();
  if (!rows) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const out: (string | null)[][] = [
    ["Status", "Left on", "Scout or adult", "First name", "Last name", "Goes by", "Family", "Den", "App role", "Positions", "Relationship", "Email", "Phone", "Member ID", "Registration expires", "Photo permission", "Added to the app"],
    ...rows.map((r) => [
      r.active ? "Registered" : "Left",
      r.left_on,
      r.person,
      r.first_name,
      r.last_name,
      r.goes_by,
      r.family,
      r.den,
      r.role ? ROLE_LABEL[r.role as AppRole] : null,
      r.positions,
      r.relationship,
      r.email,
      r.phone,
      r.member_id,
      r.registration_expires_on,
      r.photo_permission === "yes" ? "Yes" : r.photo_permission === "no" ? "No" : null,
      r.added_on,
    ]),
  ];
  return new NextResponse(toCsv(out), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pack361-roster-${easternDate(Date.now())}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
