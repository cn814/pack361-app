import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Info } from "lucide-react";
import BackLink from "@/components/BackLink";
import { isLeader, requireMember } from "@/lib/data";
import { buildAttendanceReport, getAttendanceSeasons } from "@/lib/attendance-data";
import { seasonOf } from "@/lib/finance";
import { todayEastern } from "@/lib/meetings";

export const metadata: Metadata = { title: "Attendance" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function AttendanceReportPage({ searchParams }: PageProps<"/leaders/attendance">) {
  const me = await requireMember();
  if (!isLeader(me)) redirect("/leaders");
  const sp = await searchParams;
  const current = seasonOf(todayEastern());
  const seasons = await getAttendanceSeasons(current);
  const asked = one(sp.season);
  const season = seasons.includes(asked) || /^\d{4}-\d{2}$/.test(asked) ? asked : current;
  const r = (await buildAttendanceReport(me, season)) ?? (await buildAttendanceReport(me, current))!;
  const total = r.dens.reduce((n, d) => n + d.rows.length, 0);

  return (
    <>
      <BackLink href="/lead" label="Leaders" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Attendance</h1>
      <p className="-mt-1 text-sm text-muted">
        {r.season} season (July to June) · {total} scout{total === 1 ? "" : "s"}
      </p>

      <Form action="/leaders/attendance" className="card flex flex-wrap items-end gap-2">
        <label className="block min-w-40 flex-1 space-y-1">
          <span className="text-xs font-bold text-navy">Season</span>
          <select className="input py-2" name="season" defaultValue={r.season}>
            {(seasons.includes(r.season) ? seasons : [r.season, ...seasons]).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-ghost py-2">Show</button>
        <a href={`/leaders/attendance/csv?season=${r.season}`} className="btn-ghost py-2">
          <Download className="h-4 w-4" aria-hidden /> Download CSV
        </a>
      </Form>

      <p className="flex items-start gap-2 text-xs text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Den meetings count the meetings recorded for the scout&apos;s den. Pack events count every event and campout where a leader took
          attendance. Camping nights add up the campouts each scout came to.
          {r.limitedDens && " Den meeting numbers show only for the dens you lead."}
        </span>
      </p>

      {r.dens.length === 0 && <p className="card text-sm text-muted">No scouts on the roster yet.</p>}
      {r.dens.map((d) => (
        <section key={d.key} className="card space-y-2 overflow-x-auto">
          <h2 className="section-title">{d.name}</h2>
          <table className="w-full min-w-[22rem] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="py-1 pr-2 font-bold">Scout</th>
                <th className="py-1 pl-2 text-right font-bold">Den meetings</th>
                <th className="py-1 pl-3 text-right font-bold">Events</th>
                <th className="py-1 pl-3 text-right font-bold">Nights</th>
                <th className="py-1 pl-3 text-right font-bold">Nights ever</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.rows.map((s) => (
                <tr key={s.id}>
                  <td className="py-1.5">
                    <Link href={`/scouts/${s.id}`} className="font-semibold text-ink underline-offset-2 hover:underline">
                      {s.name}
                    </Link>
                    {!s.active && <span className="ml-1 text-[11px] text-muted">(left)</span>}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pl-2 text-right">
                    {s.denMeetings === null ? (
                      <span className="text-muted">n/a</span>
                    ) : (
                      <>
                        {s.denMeetings}
                        <span className="text-muted"> of {s.denMeetingsHeld}</span>
                      </>
                    )}
                  </td>
                  <td className="py-1.5 pl-3 text-right">{s.events}</td>
                  <td className="py-1.5 pl-3 text-right font-semibold">{s.nights}</td>
                  <td className="py-1.5 pl-3 text-right text-muted">{s.nightsAll}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  );
}
