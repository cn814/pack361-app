import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ExternalLink, Popcorn, Trophy } from "lucide-react";
import { ProgressBar } from "@/components/RankProgress";
import { PopcornEntryForm, PopcornSettingsForm, TrailsEndImportForm } from "@/components/AdminForms";
import { getMyScouts, requireMember } from "@/lib/data";
import { isAdmin } from "@/lib/advancement-data";
import { RANKS } from "@/lib/advancement";
import { money } from "@/lib/fundraising-data";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/format";
import type { DenRank } from "@/lib/types";

export const metadata: Metadata = { title: "Popcorn" };

interface SaleRow {
  scout_id: string;
  amount: number;
  updated_at: string;
  scout: { first_name: string; last_name: string; is_active: boolean; den: { name: string; rank: DenRank } | null } | null;
}

export default async function PopcornPage() {
  const me = await requireMember();
  const admin = isAdmin(me);
  const supabase = await createClient();
  const [settings, mine, { data }, scoutsForAdmin] = await Promise.all([
    getSettings(),
    getMyScouts(),
    supabase
      .from("popcorn_sales")
      .select("scout_id, amount, updated_at, scout:scouts(first_name, last_name, is_active, den:dens(name, rank))"),
    admin
      ? supabase.from("scouts").select("id, first_name, last_name").eq("is_active", true).order("last_name")
      : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
  ]);
  const sales = ((data ?? []) as unknown as SaleRow[]).filter((r) => r.scout?.is_active && Number(r.amount) > 0);
  const total = sales.reduce((n, r) => n + Number(r.amount), 0);
  const goal = Number(settings.popcorn_goal) || 0;
  const updated = sales.reduce<string | null>((m, r) => (!m || r.updated_at > m ? r.updated_at : m), null);
  const mineIds = new Set(mine.map((s) => s.id));

  const dens = new Map<string, { total: number; sellers: number; rank: number }>();
  for (const r of sales) {
    const name = r.scout?.den?.name ?? "No den";
    const d = dens.get(name) ?? { total: 0, sellers: 0, rank: r.scout?.den ? RANKS.indexOf(r.scout.den.rank) : 99 };
    d.total += Number(r.amount);
    d.sellers++;
    dens.set(name, d);
  }
  const denBoard = [...dens.entries()].sort((a, b) => b[1].total - a[1].total);
  const top = [...sales].sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 10);

  return (
    <>
      <Link href="/fundraisers" className="inline-flex items-center gap-1 text-sm font-semibold text-pine">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Fundraisers
      </Link>
      <section className="card space-y-3 border-t-4 border-t-gold">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-pine-950">
          <Popcorn className="h-6 w-6 text-gold-700" aria-hidden /> Popcorn sale
        </h1>
        {settings.popcorn_note && <p className="text-sm text-navy">{settings.popcorn_note}</p>}
        <div className="flex items-end justify-between">
          <span className="text-3xl font-extrabold text-pine">{money(total)}</span>
          {goal > 0 && <span className="text-sm text-muted">of {money(goal)} goal</span>}
        </div>
        {goal > 0 && <ProgressBar percent={Math.min(100, Math.round((total / goal) * 100))} className="h-3" />}
        <p className="text-xs text-muted">
          {settings.popcorn_ends ? `Sale ends ${settings.popcorn_ends}. ` : ""}
          {updated ? `Totals from Trail's End, updated ${timeAgo(updated)}.` : "Totals appear after the first Trail's End update."}
        </p>
        <div className="flex flex-wrap gap-2">
          <a href="https://www.trails-end.com/" target="_blank" rel="noopener noreferrer" className="btn-primary py-2">
            <ExternalLink className="h-4 w-4" aria-hidden /> Trail&apos;s End app
          </a>
          {settings.popcorn_store_url && (
            <a href={settings.popcorn_store_url} target="_blank" rel="noopener noreferrer" className="btn-gold py-2">
              Pack online store
            </a>
          )}
        </div>
      </section>

      {mine.length > 0 && (
        <section className="card space-y-1">
          <h2 className="section-title">My scouts</h2>
          <ul className="divide-y divide-line">
            {mine.map((s) => {
              const r = sales.find((x) => x.scout_id === s.id);
              return (
                <li key={s.id} className="flex justify-between py-2 text-sm">
                  <span className="font-semibold text-ink">{s.first_name}</span>
                  <span className="font-extrabold text-pine">{money(r?.amount ?? 0)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {denBoard.length > 0 && (
        <section className="card space-y-2">
          <h2 className="section-title">Den leaderboard</h2>
          <ol className="space-y-2">
            {denBoard.map(([name, d], i) => (
              <li key={name} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-semibold text-ink">
                    {i + 1}. {name}
                  </span>
                  <span className="font-extrabold text-pine">{money(d.total)}</span>
                </div>
                <ProgressBar percent={Math.round((d.total / denBoard[0][1].total) * 100)} className="h-1.5" />
              </li>
            ))}
          </ol>
        </section>
      )}

      {top.length > 0 && (
        <section className="card space-y-1">
          <h2 className="section-title flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5 text-gold-700" aria-hidden /> Top sellers
          </h2>
          <ol className="divide-y divide-line">
            {top.map((r, i) => (
              <li key={r.scout_id} className={`flex justify-between py-2 text-sm ${mineIds.has(r.scout_id) ? "font-bold" : ""}`}>
                <span className="text-ink">
                  {i + 1}. {r.scout?.first_name} {r.scout?.last_name[0]}.
                  <span className="ml-1 text-xs font-normal text-muted">{r.scout?.den?.name}</span>
                </span>
                <span className="text-pine">{money(r.amount)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {admin && (
        <>
          <section className="card space-y-2">
            <h2 className="section-title">Update sales (admins)</h2>
            <p className="text-xs text-muted">
              In the Trail&apos;s End unit dashboard, export the scout sales report as CSV and upload it here. Scouts are
              matched by name; each upload replaces those scouts&apos; totals.
            </p>
            <TrailsEndImportForm />
            <p className="pt-2 text-xs font-semibold text-navy">Or set one scout&apos;s total</p>
            <PopcornEntryForm
              scouts={(scoutsForAdmin.data ?? []).map((s) => ({ id: s.id, label: `${s.last_name}, ${s.first_name}` }))}
            />
          </section>
          <section className="card space-y-2">
            <h2 className="section-title">Sale details (admins)</h2>
            <PopcornSettingsForm v={settings} />
          </section>
        </>
      )}
    </>
  );
}
