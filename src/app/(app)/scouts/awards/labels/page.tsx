import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import PrintButton from "@/components/PrintButton";
import { isLeader, requireMember } from "@/lib/data";
import { getAwardsToHandOut, getReviewableScouts } from "@/lib/advancement-data";
import { RANKS, awardLabel } from "@/lib/advancement";
import { getSettings } from "@/lib/settings";
import { LABEL_SHEETS, sheetById } from "@/lib/labels";

export const metadata: Metadata = { title: "Award bag labels" };

/** Short name for a label: the adventure (rank is on the label already) or the award. */
function shortLabel(r: Parameters<typeof awardLabel>[0]) {
  if (r.kind === "adventure") return r.adventure ?? r.item;
  if (r.kind === "rank") return `${r.item.replace(/ Rank$/, "")} rank`;
  return r.item;
}

export default async function AwardLabelsPage({ searchParams }: PageProps<"/scouts/awards/labels">) {
  const me = await requireMember();
  if (!isLeader(me)) redirect("/scouts");
  const sp = await searchParams;
  const sheet = sheetById(typeof sp.t === "string" ? sp.t : undefined);
  const perSheet = sheet.cols * sheet.rows;
  const skipRaw = Number(typeof sp.skip === "string" ? sp.skip : 0);
  const skip = Number.isInteger(skipRaw) && skipRaw > 0 && skipRaw < perSheet ? skipRaw : 0;

  const [scouts, settings] = await Promise.all([getReviewableScouts(), getSettings()]);
  const items = await getAwardsToHandOut(scouts.map((s) => s.id), settings.awards_tracked_from);
  const byScout = new Map<string, typeof items>();
  for (const r of items) byScout.set(r.scout_id, [...(byScout.get(r.scout_id) ?? []), r]);
  // Den by den (Lion first), then by name: the bags come off the sheet in the order you'll hand them out.
  const labels = scouts
    .filter((s) => byScout.has(s.id))
    .sort(
      (a, b) =>
        (a.den ? RANKS.indexOf(a.den.rank) : 99) - (b.den ? RANKS.indexOf(b.den.rank) : 99) ||
        (a.den?.name ?? "").localeCompare(b.den?.name ?? "") ||
        a.last_name.localeCompare(b.last_name) ||
        a.first_name.localeCompare(b.first_name),
    )
    .map((s) => ({ scout: s, rows: byScout.get(s.id)! }));

  const cells: ((typeof labels)[number] | null)[] = [...Array(skip).fill(null), ...labels];
  const sheets: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += perSheet) sheets.push(cells.slice(i, i + perSheet));

  const small = sheet.height < 1.5;
  const maxLines = small ? 2 : Math.floor((sheet.height - 0.75) / 0.15);
  const href = (t: string, s = 0) => `/scouts/awards/labels?t=${t}${s ? `&skip=${s}` : ""}`;

  return (
    <>
      <div className="space-y-3 print:hidden">
        <Link href="/scouts/awards" className="inline-flex items-center gap-1 text-sm font-semibold text-pine">
          <ChevronLeft className="h-4 w-4" aria-hidden /> Shopping list
        </Link>
        <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Award bag labels</h1>
        <p className="text-sm text-muted">
          One label per scout with their den, how many items and what they are, to stick on each scout&apos;s bag. {labels.length} scout
          {labels.length === 1 ? "" : "s"}, {sheets.length} sheet{sheets.length === 1 ? "" : "s"}.
        </p>
        <div className="flex flex-wrap gap-2 text-sm font-semibold">
          {LABEL_SHEETS.map((s) => (
            <Link key={s.id} href={href(s.id)} className={`rounded-full px-3 py-1 ${s.id === sheet.id ? "bg-brand text-white" : "bg-card text-pine ring-1 ring-line"}`}>
              {s.name}
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap items-end gap-2 text-sm">
          <input type="hidden" name="t" value={sheet.id} />
          <label className="space-y-1">
            <span className="block text-xs font-bold text-navy">Using a sheet you&apos;ve already started? Skip this many labels</span>
            <input className="input w-28" type="number" name="skip" min={0} max={perSheet - 1} defaultValue={skip} />
          </label>
          <button className="btn-ghost px-3 py-2">Update</button>
          <PrintButton label="Print labels" />
        </form>
        <p className="text-xs text-muted">
          Print at <b>100% (actual size)</b>, not &ldquo;fit to page&rdquo;, with no margins or headers. Try one on plain paper first and
          hold it up to a label sheet.
        </p>
      </div>

      {labels.length === 0 && <p className="card text-sm text-muted print:hidden">No awards waiting to be handed out.</p>}

      <div className="label-sheets page-wide space-y-4 overflow-x-auto print:space-y-0 print:overflow-visible">
        {sheets.map((cellsOnSheet, si) => (
          <div
            key={si}
            className="label-sheet relative bg-card ring-1 ring-line print:ring-0"
            style={{ width: "8.5in", height: "11in" }}
          >
            {cellsOnSheet.map((c, i) => {
              const col = i % sheet.cols;
              const row = Math.floor(i / sheet.cols);
              const style = {
                left: `${sheet.left + col * sheet.pitchX}in`,
                top: `${sheet.top + row * sheet.pitchY}in`,
                width: `${sheet.width}in`,
                height: `${sheet.height}in`,
              };
              if (!c) return <div key={i} className="absolute rounded-md border border-dashed border-line print:border-0" style={style} />;
              const names = c.rows.map(shortLabel);
              const shown = names.length > maxLines && !small ? [...names.slice(0, maxLines - 1), `+ ${names.length - maxLines + 1} more`] : names;
              return (
                <div
                  key={i}
                  className="absolute flex overflow-hidden rounded-md border border-line px-[0.08in] py-[0.05in] text-pine-950 print:border-0"
                  style={style}
                >
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-extrabold leading-tight text-navy ${small ? "text-[11pt]" : "text-[14pt]"}`}>
                      {c.scout.first_name} {c.scout.last_name}
                    </p>
                    <p className={`leading-tight text-muted ${small ? "text-[7pt]" : "text-[9pt]"}`}>
                      Pack 361 · {c.scout.den?.name ?? "Cub Scouts"}
                    </p>
                    <p className={`mt-[0.03in] leading-snug text-ink ${small ? "line-clamp-2 text-[6pt]" : "text-[8pt]"}`}>
                      {small ? names.join(" · ") : shown.map((n, k) => <span key={k} className="block truncate">{n}</span>)}
                    </p>
                  </div>
                  <span
                    className={`ml-1 flex shrink-0 items-center justify-center self-center rounded-full bg-gold font-extrabold text-on-gold ${small ? "h-[0.36in] w-[0.36in] text-[10pt]" : "h-[0.5in] w-[0.5in] text-[14pt]"}`}
                    aria-label={`${names.length} items`}
                  >
                    {names.length}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
