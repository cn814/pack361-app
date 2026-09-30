import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarPlus, ChevronLeft, House } from "lucide-react";
import { isLeader, requireMember } from "@/lib/data";
import { getCatalog, getMyDenIds, getRecords, reviewsWholePack } from "@/lib/advancement-data";
import { ELECTIVES_NEEDED, RANK_LABEL, rankProgress } from "@/lib/advancement";
import { createClient } from "@/lib/supabase/server";
import type { Scout } from "@/lib/types";

export const metadata: Metadata = { title: "Den progress" };

/** Short column headings for the grid. */
const short = (name: string) => (name.length > 14 ? name.split(/[ ,]/)[0] : name);

export default async function DenGridPage({ params }: PageProps<"/scouts/den/[denId]">) {
  const me = await requireMember();
  if (!isLeader(me)) redirect("/scouts");
  const { denId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(denId)) notFound();
  if (!reviewsWholePack(me) && !(await getMyDenIds()).includes(denId)) redirect("/scouts");

  const supabase = await createClient();
  const [{ data: den }, { data: scoutRows }, catalog] = await Promise.all([
    supabase.from("dens").select("id, rank, number, name").eq("id", denId).maybeSingle(),
    supabase
      .from("scouts")
      .select("id, first_name, last_name, family_id, den:dens(id, rank, number, name)")
      .eq("den_id", denId)
      .eq("is_active", true)
      .order("first_name"),
    getCatalog(),
  ]);
  if (!den) notFound();
  const scouts = (scoutRows ?? []) as unknown as Scout[];
  const records = await getRecords(scouts.map((s) => s.id));
  const rows = scouts.map((s) => ({
    scout: s,
    p: rankProgress(den.rank, records.filter((r) => r.scout_id === s.id), catalog),
  }));
  const required = catalog.filter((a) => a.rank === den.rank && a.required).sort((a, b) => a.sort_order - b.sort_order);

  // What the den should cover next: required adventures most scouts still need
  const need = required
    .map((a) => ({
      a,
      missing: rows.filter((r) => !r.p.required.find((x) => x.name === a.name)?.done).length,
    }))
    .filter((x) => x.missing > 0)
    .sort((x, y) => y.missing - x.missing);

  // Electives the den has already started
  const electiveCounts = new Map<string, number>();
  for (const r of rows) for (const e of r.p.electives) if (e.done) electiveCounts.set(e.name, (electiveCounts.get(e.name) ?? 0) + 1);

  return (
    <>
      <Link href="/scouts" className="inline-flex items-center gap-1 text-sm font-semibold text-pine">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Scouts
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">{den.name}</h1>
        <p className="text-sm text-muted">
          {RANK_LABEL[den.rank as keyof typeof RANK_LABEL]} rank · {scouts.length} scouts
        </p>
      </div>
      <Link href={`/scouts/den/${denId}/meetings`} className="btn-primary w-full">
        <CalendarPlus className="h-4 w-4" aria-hidden /> Den meetings and attendance
      </Link>

      {need.length > 0 && (
        <section className="card space-y-2">
          <h2 className="section-title">Plan next</h2>
          <ul className="space-y-1.5 text-sm">
            {need.slice(0, 4).map(({ a, missing }) => (
              <li key={a.name} className="flex items-start justify-between gap-2">
                <span>
                  <b className="text-ink">{a.name}</b>
                  {a.home === "home" && (
                    <span className="ml-1 inline-flex items-center gap-0.5 text-[11px] text-sage">
                      <House className="h-3 w-3" aria-hidden /> doable at home
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {missing} of {rows.length} need it
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-line bg-surface-low text-left">
                <th className="sticky left-0 z-10 bg-surface-low px-3 py-2 font-bold text-navy">Scout</th>
                {required.map((a) => (
                  <th key={a.name} className="px-1.5 py-2 text-center font-semibold text-navy" title={a.name}>
                    <span className="block w-14 leading-tight">{short(a.name)}</span>
                  </th>
                ))}
                <th className="px-1.5 py-2 text-center font-semibold text-navy">Elect.</th>
                <th className="px-2 py-2 text-right font-semibold text-navy">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(({ scout, p }) => (
                <tr key={scout.id}>
                  <td className="sticky left-0 z-10 bg-white px-3 py-2">
                    <Link href={`/scouts/${scout.id}`} className="font-semibold text-ink underline-offset-2 hover:underline">
                      {scout.first_name} {scout.last_name[0]}.
                    </Link>
                  </td>
                  {p.required.map((a) => (
                    <td key={a.name} className="px-1.5 py-2 text-center">
                      {a.done ? (
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-bold ${
                            a.approved ? "bg-pine text-white" : "bg-gold-100 text-gold-800"
                          }`}
                          title={a.approved ? "Done" : "Done, waiting for approval"}
                        >
                          ✓
                        </span>
                      ) : a.reqsDone ? (
                        <span className="text-gold-800">
                          {a.reqsDone}/{a.reqCount}
                        </span>
                      ) : (
                        <span className="text-outline">·</span>
                      )}
                    </td>
                  ))}
                  <td className="px-1.5 py-2 text-center font-semibold text-navy">
                    {p.electivesDone}/{ELECTIVES_NEEDED}
                  </td>
                  <td className="px-2 py-2 text-right font-extrabold text-pine">{p.earned ? "🏅" : p.percent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-3 py-2 text-[11px] text-muted">
          Green ✓ done · yellow ✓ waiting for leader approval · 2/5 = requirements done so far. From Scoutbook.
        </p>
      </section>

      {electiveCounts.size > 0 && (
        <section className="card space-y-1">
          <h2 className="section-title">Electives earned in this den</h2>
          <ul className="text-sm">
            {[...electiveCounts.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([name, n]) => (
                <li key={name} className="flex justify-between">
                  <span className="text-ink">{name}</span>
                  <span className="text-muted">{n}</span>
                </li>
              ))}
          </ul>
        </section>
      )}
    </>
  );
}
