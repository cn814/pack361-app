import { Award, Check, Medal, Tent, Users, CalendarCheck } from "lucide-react";
import type { Keepsake } from "@/lib/keepsake";

// The season keepsake itself: one Letter page when printed (src/app/(app)/scouts/[id]/keepsake).
// Pure markup from props, so it can be previewed with sample data.

const short = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const eventDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
/** "2026-10-23" -> "Oct 23" */
const fmtDate = (d: string | null) => (d ? short.format(new Date(`${d}T12:00:00Z`)) : "");

export interface KeepsakeScout {
  first_name: string;
  last_name: string;
  den: string | null;
}

export default function KeepsakeSheet({
  scout,
  k,
  printedOn,
}: {
  scout: KeepsakeScout;
  k: Omit<Keepsake, "seasons">;
  printedOn: string;
}) {
  const t = k.totals;
  const stats = [
    { icon: Users, n: t?.den_meetings ?? 0, of: t && t.den_meetings_held > 0 ? t.den_meetings_held : null, label: "Den meetings" },
    { icon: CalendarCheck, n: t?.events ?? 0, of: null, label: "Pack events" },
    { icon: Tent, n: t?.nights ?? 0, of: null, label: t?.nights === 1 ? "Camping night" : "Camping nights" },
  ];
  return (
    <article className="keepsake-sheet card mx-auto w-full max-w-[8.5in] space-y-5 p-5 sm:p-8 print:max-w-none print:space-y-4 print:border-0 print:p-0 print:shadow-none">
      <header className="flex items-center gap-4 border-b-[3px] border-gold pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/badge.png" alt="Pack 361" width={88} height={88} className="h-20 w-20 shrink-0 sm:h-[88px] sm:w-[88px]" />
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-gold-700">Cub Scout Pack 361</p>
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-pine-950 sm:text-4xl">
            {scout.first_name} {scout.last_name}
          </h1>
          <p className="text-sm font-semibold text-navy">
            {k.season.replace("-", "–")} season keepsake{scout.den ? ` · ${scout.den}` : ""}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-mint px-2 py-3 text-center print:border print:border-line print:py-2">
            <s.icon className="mx-auto h-5 w-5 text-pine" aria-hidden />
            <p className="text-3xl font-extrabold leading-tight text-pine-950">{s.n}</p>
            <p className="text-xs font-bold text-navy">{s.label}</p>
            {s.of !== null && <p className="text-[11px] text-muted">of {s.of} held</p>}
          </div>
        ))}
      </div>

      {k.ranks.length > 0 && (
        <section className="break-inside-avoid space-y-2">
          <h2 className="section-title">Rank earned</h2>
          <ul className="flex flex-wrap gap-2">
            {k.ranks.map((r) => (
              <li key={r.label} className="flex items-center gap-2 rounded-2xl border-2 border-gold bg-gold-50 px-4 py-2">
                <Medal className="h-6 w-6 text-gold-700" aria-hidden />
                <span>
                  <span className="block text-lg font-extrabold leading-tight text-pine-950">{r.label}</span>
                  {r.date && <span className="block text-xs text-muted">{fmtDate(r.date)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="break-inside-avoid space-y-2">
        <h2 className="section-title">Adventures earned ({k.adventures.length})</h2>
        {k.adventures.length === 0 ? (
          <p className="text-sm text-muted">No adventures recorded this season yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 print:grid-cols-2">
            {k.adventures.map((a) => (
              <li key={a.label} className="flex items-baseline gap-1.5 text-sm">
                <Check className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-pine" strokeWidth={3} aria-hidden />
                <span className="min-w-0 flex-1 font-semibold text-ink">{a.label}</span>
                <span className="shrink-0 text-[11px] text-muted">{fmtDate(a.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {k.awards.length > 0 && (
        <section className="break-inside-avoid space-y-2">
          <h2 className="section-title">Awards</h2>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            {k.awards.map((a) => (
              <li key={a.label} className="flex items-baseline gap-1.5 text-sm">
                <Award className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-gold-700" aria-hidden />
                <span className="min-w-0 flex-1 font-semibold text-ink">{a.label}</span>
                <span className="shrink-0 text-[11px] text-muted">{fmtDate(a.date)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {k.events.length > 0 && (
        <section className="break-inside-avoid space-y-2">
          <h2 className="section-title">Pack events</h2>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            {k.events.map((e) => (
              <li key={e.id} className="flex items-baseline gap-2 text-sm">
                <span className="w-12 shrink-0 text-[11px] font-bold text-gold-700">{eventDay.format(new Date(e.starts_at))}</span>
                <span className="min-w-0 flex-1 text-ink">
                  {e.title}
                  {e.category === "Campout" && <Tent className="ml-1 inline h-3.5 w-3.5 -translate-y-px text-pine" aria-label="campout" />}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {k.photos.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-title break-after-avoid">Pack photos</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 print:grid-cols-6">
            {k.photos.map((p) => (
              <figure key={p.id} className="break-inside-avoid overflow-hidden rounded-xl bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.caption ?? ""} className="aspect-[4/3] w-full object-cover print:aspect-square" />
                {p.caption && <figcaption className="truncate px-2 py-1 text-[11px] text-muted print:hidden">{p.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}

      <footer className="border-t border-line pt-3 text-center text-[11px] text-muted">
        Printed {printedOn} from the Pack 361 app. Scoutbook is the official advancement record.
      </footer>
    </article>
  );
}
