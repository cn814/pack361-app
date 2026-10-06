import type { ReactNode } from "react";
import Link from "next/link";

/** A report on screen: a wide table that scrolls sideways on a phone, header row kept in view. */
export default function ReportTable({ head, rows, empty = "Nobody to show." }: { head: string[]; rows: ReactNode[][]; empty?: string }) {
  if (!rows.length) return <p className="card text-sm text-muted">{empty}</p>;
  return (
    <div className="page-wide -mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <table className="w-full min-w-max border-separate border-spacing-0 overflow-hidden rounded-2xl border border-line bg-card text-left text-[13px]">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="sticky top-0 border-b border-line bg-surface-low px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider text-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="align-top odd:bg-card even:bg-surface-low/50">
              {r.map((c, j) => (
                <td key={j} className={`border-b border-line px-3 py-2 ${j === 0 ? "font-semibold text-ink" : "text-ink"}`}>
                  {c ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Where the spreadsheet download and the filters go above a report. */
export function ReportBar({ csv, children }: { csv: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
      <a href={csv} className="btn-ghost ml-auto py-2" download>
        Download spreadsheet (CSV)
      </a>
    </div>
  );
}

/** Filter chips (links) above a report. */
export function ReportChips({ items }: { items: { href: string; label: string; on: boolean }[] }) {
  return (
    <nav className="flex flex-wrap gap-1.5 text-xs font-bold" aria-label="Show">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.on ? "page" : undefined}
          className={`rounded-full border px-3 py-1.5 ${i.on ? "border-pine bg-pine text-white" : "border-line bg-card text-pine"}`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
