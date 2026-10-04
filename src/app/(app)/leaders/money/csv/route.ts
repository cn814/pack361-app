import { NextResponse, type NextRequest } from "next/server";
import { getMe, isCommittee } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { getAllCharges, inSeason } from "@/lib/money-data";
import { CHARGE_KINDS, CHARGE_STATUSES, chargeFor, KIND_LABEL, ownerName, type ChargeKind, type ChargeStatus } from "@/lib/money";
import { easternDate } from "@/lib/tz";

// Pack leadership: the charges list as a spreadsheet for the treasurer's records (same filters as the page).

/** Quote a cell; a leading = + - @ is neutralised so a spreadsheet won't run it as a formula. */
function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const dollars = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2));

export async function GET(request: NextRequest) {
  const me = await getMe();
  if (!me?.adult || !isCommittee(me.adult)) return NextResponse.json({ error: "Pack leadership only" }, { status: 403 });
  const p = request.nextUrl.searchParams;
  const kind = p.get("kind") as ChargeKind | null;
  const status = p.get("status") as ChargeStatus | null;
  const all = p.get("scope") === "all";
  const q = (p.get("q") ?? "").trim().toLowerCase().slice(0, 60);
  const [settings, charges] = await Promise.all([getSettings(), getAllCharges()]);
  const rows = charges.filter(
    (c) =>
      (all || inSeason(c, settings)) &&
      (!kind || !CHARGE_KINDS.includes(kind) || c.kind === kind) &&
      (status && CHARGE_STATUSES.includes(status) ? c.status === status : c.status !== "canceled") &&
      (!q || `${ownerName(c)} ${chargeFor(c) ?? ""} ${c.title}`.toLowerCase().includes(q)),
  );
  rows.sort((a, b) => ownerName(a).localeCompare(ownerName(b)) || a.title.localeCompare(b.title));

  const header = [
    "Owner",
    "For",
    "Kind",
    "Title",
    "Season",
    "Amount",
    "Status",
    "Paid amount",
    "Paid by",
    "Paid on",
    "Due",
    "Sent to council",
    "PayPal transaction",
    "Family note",
    "Leader note",
    "Added",
    "Charge id",
  ];
  const lines = [header.join(",")];
  for (const c of rows) {
    lines.push(
      [
        ownerName(c),
        chargeFor(c),
        KIND_LABEL[c.kind],
        c.title,
        c.season,
        dollars(c.amount_cents),
        c.status,
        dollars(c.paid_amount_cents),
        c.paid_via,
        c.paid_at ? easternDate(c.paid_at) : null,
        c.due_on,
        c.remitted_on,
        c.paypal_capture_id,
        c.report_note,
        c.note,
        easternDate(c.created_at),
        c.id,
      ]
        .map(cell)
        .join(","),
    );
  }
  const name = `pack361-charges-${all ? "all" : settings.dues_season}-${easternDate(Date.now())}.csv`;
  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
