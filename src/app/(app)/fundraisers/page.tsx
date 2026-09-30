import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ExternalLink, Popcorn, ShoppingBag } from "lucide-react";
import { ProgressBar } from "@/components/RankProgress";
import { SyncGivebutterButton } from "@/components/AdminForms";
import { isLeader, requireMember } from "@/lib/data";
import { isAdmin } from "@/lib/advancement-data";
import { getCampaigns, getOrders, isPaid, money } from "@/lib/fundraising-data";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/format";
import { setFundraiserFlag } from "./actions";

export const metadata: Metadata = { title: "Fundraisers" };

export default async function FundraisersPage() {
  const me = await requireMember();
  const leader = isLeader(me);
  const supabase = await createClient();
  const [campaigns, settings, { data: sales }] = await Promise.all([
    getCampaigns(),
    getSettings(),
    supabase.from("popcorn_sales").select("amount"),
  ]);
  const shown = campaigns.filter((c) => c.show_as_fundraiser && c.status !== "inactive");
  const orders = await getOrders(shown.map((c) => c.id));
  const popcornTotal = (sales ?? []).reduce((n, r) => n + Number(r.amount), 0);
  const scoutGoal = Number(settings.popcorn_scout_goal) || 0;
  const atGoal = scoutGoal ? (sales ?? []).filter((r) => Number(r.amount) >= scoutGoal).length : 0;
  const lastSync = campaigns.reduce<string | null>((m, c) => (!m || c.synced_at > m ? c.synced_at : m), null);

  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Fundraisers</h1>

      <Link href="/popcorn" className="card block space-y-2 border-t-4 border-t-gold active:bg-surface-low">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-extrabold text-pine-950">
            <Popcorn className="h-5 w-5 text-gold-700" aria-hidden /> Popcorn sale (Trail&apos;s End)
          </span>
          <ChevronRight className="h-5 w-5 text-muted" aria-hidden />
        </div>
        <p className="text-sm text-muted">
          {money(popcornTotal)} sold by the pack
          {scoutGoal ? ` · ${atGoal} ${atGoal === 1 ? "scout has" : "scouts have"} reached the ${money(scoutGoal)} goal` : ""}
          {settings.popcorn_ends && ` · ends ${settings.popcorn_ends}`}
        </p>
      </Link>

      {shown.map((c) => {
        const mine = orders.filter((o) => o.campaign_id === c.id && isPaid(o) && me.family_id && o.family_id === me.family_id);
        const all = orders.filter((o) => o.campaign_id === c.id && isPaid(o));
        const items = mine.flatMap((o) => o.items.filter((i) => i.type !== "donation"));
        return (
          <section key={c.id} className="card space-y-2">
            <h2 className="flex items-center gap-2 font-extrabold text-pine-950">
              <ShoppingBag className="h-5 w-5 text-pine" aria-hidden /> {c.title}
            </h2>
            {c.goal ? <ProgressBar percent={Math.min(100, Math.round((Number(c.raised) / c.goal) * 100))} /> : null}
            <p className="text-sm text-muted">
              {money(c.raised)} raised{c.goal ? ` of ${money(c.goal)}` : ""} · {c.donors ?? all.length} orders
            </p>
            {mine.length > 0 && (
              <div className="rounded-xl bg-mint p-3 text-sm text-pine">
                <p className="font-bold">Your order{mine.length > 1 ? "s" : ""}</p>
                {items.length ? (
                  <ul className="list-disc pl-5">
                    {items.map((i, n) => (
                      <li key={n}>
                        {i.quantity > 1 ? `${i.quantity} × ` : ""}
                        {i.description}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{money(mine.reduce((n, o) => n + Number(o.amount ?? 0), 0))}</p>
                )}
              </div>
            )}
            {c.url && (
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="btn-gold w-full">
                <ExternalLink className="h-4 w-4" aria-hidden /> {mine.length ? "Order more" : "Order / give on Givebutter"}
              </a>
            )}
            {leader && all.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-pine">All orders ({all.length})</summary>
                <ul className="mt-2 divide-y divide-line">
                  {all.map((o) => (
                    <li key={o.id} className="py-1.5">
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold text-ink">{o.name ?? "Unknown"}</span>
                        <span className="text-xs text-muted">{money(o.amount)}</span>
                      </div>
                      {o.items.length > 0 && (
                        <p className="text-xs text-muted">
                          {o.items.map((i) => `${i.quantity > 1 ? `${i.quantity}× ` : ""}${i.description}`).join(", ")}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        );
      })}

      {campaigns.length === 0 && (
        <p className="card text-sm text-muted">Givebutter fundraisers show here once the pack&apos;s Givebutter account is connected.</p>
      )}

      {isAdmin(me) && (
        <section className="card space-y-3">
          <h2 className="section-title">Givebutter (admins)</h2>
          <p className="text-xs text-muted">
            {lastSync ? `Last synced ${timeAgo(lastSync)}. ` : ""}Syncs every morning; event sign-ups show on the calendar and
            campout pages.
          </p>
          <SyncGivebutterButton />
          {campaigns.length > 0 && (
            <ul className="divide-y divide-line text-sm">
              {campaigns.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink">{c.title}</span>
                    <span className="text-[11px] text-muted">
                      {c.status} · {money(c.raised)}
                      {c.event_id ? " · linked to calendar" : ""}
                    </span>
                  </span>
                  <form action={setFundraiserFlag}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="show" value={String(!c.show_as_fundraiser)} />
                    <button
                      className={`badge shrink-0 normal-case tracking-normal ${c.show_as_fundraiser ? "bg-pine text-white" : "bg-surface text-muted"}`}
                    >
                      {c.show_as_fundraiser ? "Shown" : "Hidden"}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
