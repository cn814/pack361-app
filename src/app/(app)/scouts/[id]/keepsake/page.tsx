import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BackLink from "@/components/BackLink";
import PrintButton from "@/components/PrintButton";
import KeepsakeSheet from "@/components/KeepsakeSheet";
import { isLeader, requireMember } from "@/lib/data";
import { getScout } from "@/lib/advancement-data";
import { getKeepsake, seasonLabel } from "@/lib/keepsake";
import { seasonOf, seasonRange } from "@/lib/finance";
import { scoutFirstName } from "@/lib/page-titles";
import { todayEastern } from "@/lib/meetings";

export async function generateMetadata({ params }: PageProps<"/scouts/[id]/keepsake">): Promise<Metadata> {
  const { id } = await params;
  const name = await scoutFirstName(id);
  return { title: name ? `${name}'s season keepsake` : "Season keepsake" };
}

// Letter paper with half-inch margins. Only on this page.
const PRINT_CSS = "@page { size: letter; margin: 0.5in; }";

/** A printable season keepsake (July to June) for the scout's family and leaders. */
export default async function KeepsakePage({ params, searchParams }: PageProps<"/scouts/[id]/keepsake">) {
  const me = await requireMember();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const scout = await getScout(id);
  // The scout's own family, or a leader (getScout already returns only scouts this person may see).
  if (!scout || (scout.family_id !== me.family_id && !isLeader(me))) notFound();

  const current = seasonOf(todayEastern());
  const asked = (await searchParams).season;
  const season = typeof asked === "string" && seasonRange(asked) && asked <= current ? asked : current;
  const k = await getKeepsake(id, season, current);
  if (!k) notFound();
  const printedOn = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric" }).format(new Date());

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="space-y-3 print:hidden">
        <BackLink href={`/scouts/${id}`} label={scout.first_name} />
        <div className="flex flex-wrap items-end gap-2">
          <form className="flex flex-1 items-end gap-2" action={`/scouts/${id}/keepsake`}>
            <label className="min-w-0 flex-1 space-y-1">
              <span className="block text-xs font-bold text-muted">Season (July to June)</span>
              <select name="season" defaultValue={season} className="input py-2.5">
                {k.seasons.map((s) => (
                  <option key={s} value={s}>
                    {seasonLabel(s)}
                    {s === current ? " (this season)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn-ghost min-h-11">
              Show
            </button>
          </form>
          <PrintButton label="Print keepsake" />
        </div>
        <p className="text-xs text-muted">Prints on one Letter page. Tip: turn off headers and footers in the print settings.</p>
      </div>
      <KeepsakeSheet
        scout={{ first_name: scout.first_name, last_name: scout.last_name, den: season === current ? (scout.den?.name ?? null) : null }}
        k={k}
        printedOn={printedOn}
      />
    </>
  );
}
