import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Award, ChevronLeft, ExternalLink, Printer, Tags } from "lucide-react";
import PrintButton from "@/components/PrintButton";
import { isLeader, requireMember } from "@/lib/data";
import { getAwardsToHandOut, getReviewableScouts } from "@/lib/advancement-data";
import { RANKS, RANK_LABEL, awardLabel, fmtShortDate } from "@/lib/advancement";
import { getSettings } from "@/lib/settings";
import { piece, shopImage, shopItem, type ShopItem } from "@/lib/scout-shop";
import type { DenRank } from "@/lib/types";

export const metadata: Metadata = { title: "Awards to hand out" };

type Row = Awaited<ReturnType<typeof getAwardsToHandOut>>[number];

interface Line {
  key: string;
  label: string;
  kind: Row["kind"];
  rank: DenRank | null;
  shop: ShopItem | null;
  rows: Row[];
}

function Thumb({ shop, kind }: { shop: ShopItem | null; kind: Row["kind"] }) {
  if (!shop) {
    return (
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-surface-low text-muted print:h-10 print:w-10" aria-hidden>
        <Award className="h-6 w-6" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={shopImage(shop.sku)}
      alt=""
      width={56}
      height={56}
      loading="lazy"
      className={`h-14 w-14 shrink-0 rounded-lg bg-white object-contain ring-1 ring-line print:h-10 print:w-10 ${kind === "rank" ? "p-0.5" : ""}`}
    />
  );
}

export default async function AwardsPage({ searchParams }: PageProps<"/scouts/awards">) {
  const me = await requireMember();
  if (!isLeader(me)) redirect("/scouts");
  const { view } = await searchParams;
  const byScoutView = view === "scout";
  const [scouts, settings] = await Promise.all([getReviewableScouts(), getSettings()]);
  const since = settings.awards_tracked_from;
  const items = await getAwardsToHandOut(scouts.map((s) => s.id), since);
  const scoutById = new Map(scouts.map((s) => [s.id, s]));
  const name = (id: string) => {
    const s = scoutById.get(id);
    return s ? `${s.first_name} ${s.last_name}` : "";
  };

  // Shopping list: one line per item to buy, by rank (Lion → Arrow of Light), like the shelves at the Scout Shop.
  const lines = new Map<string, Line>();
  for (const r of items) {
    const label = awardLabel(r);
    const k = `${r.kind}|${label}`;
    const l = lines.get(k) ?? { key: k, label, kind: r.kind, rank: r.rank, shop: shopItem(r), rows: [] };
    l.rows.push(r);
    lines.set(k, l);
  }
  const rankOrder = (r: DenRank | null) => (r ? RANKS.indexOf(r) : 99);
  const sections: { title: string; lines: Line[] }[] = [];
  const all = [...lines.values()];
  const ranksPatch = all.filter((l) => l.kind === "rank").sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank));
  if (ranksPatch.length) sections.push({ title: "Rank patches", lines: ranksPatch });
  for (const rank of [...RANKS, null] as (DenRank | null)[]) {
    const ls = all
      .filter((l) => l.kind === "adventure" && l.rank === rank)
      .sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label));
    if (ls.length) sections.push({ title: rank ? `${RANK_LABEL[rank]} adventure ${piece(rank)}s` : "Adventures", lines: ls });
  }
  const other = all.filter((l) => l.kind !== "rank" && l.kind !== "adventure");
  if (other.length) sections.push({ title: "Other awards", lines: other.sort((a, b) => b.rows.length - a.rows.length) });

  const skus = all.filter((l) => l.shop).length;
  const noSku = all.filter((l) => !l.shop).reduce((n, l) => n + l.rows.length, 0);

  // By scout: what goes in each scout's bag.
  const perScout = new Map<string, Row[]>();
  for (const r of items) perScout.set(r.scout_id, [...(perScout.get(r.scout_id) ?? []), r]);
  const scoutList = [...perScout.entries()].sort(([a], [b]) => name(a).localeCompare(name(b)));

  return (
    <>
      <Link href="/scouts" className="inline-flex items-center gap-1 text-sm font-semibold text-pine print:hidden">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Scouts
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">{byScoutView ? "Awards by scout" : "Scout Shop shopping list"}</h1>
          <p className="text-sm text-muted">
            {items.length} item{items.length === 1 ? "" : "s"} approved in Scoutbook and not yet awarded, earned since {fmtShortDate(since)}
            {!byScoutView && items.length > 0 && ` · ${skus} different Scout Shop item${skus === 1 ? "" : "s"}`}.
          </p>
        </div>
        {items.length > 0 && <PrintButton label="Print" />}
      </div>
      <div className="flex flex-wrap gap-2 text-sm font-semibold print:hidden">
        <Link href="/scouts/awards" className={`rounded-full px-3 py-1 ${!byScoutView ? "bg-pine text-white" : "bg-white text-pine ring-1 ring-line"}`}>
          Shopping list
        </Link>
        <Link href="/scouts/awards?view=scout" className={`rounded-full px-3 py-1 ${byScoutView ? "bg-pine text-white" : "bg-white text-pine ring-1 ring-line"}`}>
          By scout
        </Link>
        <Link href="/scouts/awards/labels" className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-pine ring-1 ring-line">
          <Tags className="h-3.5 w-3.5" aria-hidden /> Bag labels
        </Link>
        <Link href="/scouts/awards/sheet" className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-pine ring-1 ring-line">
          <Printer className="h-3.5 w-3.5" aria-hidden /> Awards night sheet
        </Link>
      </div>
      <p className="text-xs text-muted print:hidden">
        Anything older than {fmtShortDate(since)} counts as already handed out. Mark items awarded in Scoutbook after the pack
        meeting and they drop off at the next import.
      </p>

      {items.length === 0 && <p className="card text-sm text-muted">Everything approved has been awarded.</p>}

      {!byScoutView && (
        <div className="page-wide space-y-5">
          {sections.map((sec) => (
            <section key={sec.title} className="space-y-2 print:break-inside-avoid-page">
              <h2 className="section-title">
                {sec.title} ({sec.lines.reduce((n, l) => n + l.rows.length, 0)})
              </h2>
              <div className="grid gap-2 lg:grid-cols-2 print:grid-cols-2 print:gap-1">
                {sec.lines.map((l) => (
                  <article key={l.key} className="card flex gap-3 py-3 print:break-inside-avoid print:p-2 print:shadow-none">
                    <Thumb shop={l.shop} kind={l.kind} />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-extrabold leading-tight text-pine-950">{l.kind === "adventure" ? (l.rows[0].adventure ?? l.label) : l.label}</h3>
                        <span className="badge shrink-0 bg-gold text-base text-pine-950 print:text-sm">× {l.rows.length}</span>
                      </div>
                      {l.shop ? (
                        <p className="text-xs text-muted">
                          SKU <b className="font-mono text-ink">{l.shop.sku}</b>
                          <a href={l.shop.url} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-0.5 font-semibold text-pine underline print:hidden">
                            Scout Shop <ExternalLink className="h-3 w-3" aria-hidden />
                          </a>
                        </p>
                      ) : (
                        <p className="text-xs text-muted">{l.kind === "rank" ? "Ask at the Scout Shop counter" : "Not in the Scout Shop list"}</p>
                      )}
                      <p className="text-xs text-ink">{l.rows.map((r) => scoutById.get(r.scout_id)?.first_name ?? "").filter(Boolean).sort().join(", ")}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
          {noSku > 0 && (
            <p className="text-xs text-muted">
              {noSku} item{noSku === 1 ? "" : "s"} without a Scout Shop number (special awards, or a rank patch the list doesn&apos;t have): ask at the
              counter.
            </p>
          )}
        </div>
      )}

      {byScoutView && (
        <div className="page-wide grid gap-2 lg:grid-cols-2 print:grid-cols-2">
          {scoutList.map(([id, rows]) => {
            const s = scoutById.get(id);
            return (
              <section key={id} className="card space-y-1 print:break-inside-avoid print:shadow-none">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-extrabold text-pine-950">{name(id)}</h2>
                  <span className="text-xs text-muted">
                    {s?.den?.name ?? ""} · {rows.length} item{rows.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="space-y-1 text-sm">
                  {rows.map((r) => {
                    const shop = shopItem(r);
                    return (
                      <li key={r.kind + awardLabel(r)} className="flex items-center gap-2">
                        {shop ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={shopImage(shop.sku)} alt="" width={28} height={28} loading="lazy" className="h-7 w-7 shrink-0 rounded bg-white object-contain ring-1 ring-line" />
                        ) : (
                          <Award className="h-7 w-7 shrink-0 p-1 text-muted" aria-hidden />
                        )}
                        <span className="min-w-0 flex-1 text-ink">{awardLabel(r)}</span>
                        <span className="shrink-0 text-xs text-muted">{fmtShortDate(r.completed_on)}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
