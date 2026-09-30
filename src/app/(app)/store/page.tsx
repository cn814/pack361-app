import type { Metadata } from "next";
import SubmitButton from "@/components/SubmitButton";
import { ExternalLink, ShoppingBag } from "lucide-react";
import { SyncGivebutterButton } from "@/components/AdminForms";
import { isLeader, requireMember } from "@/lib/data";
import { isAdmin } from "@/lib/advancement-data";
import { getCampaigns, getOrders, isPaid, money } from "@/lib/fundraising-data";
import { timeAgo } from "@/lib/format";
import { setFundraiserFlag } from "./actions";

export const metadata: Metadata = { title: "Pack store" };

export default async function StorePage() {
  const me = await requireMember();
  const leader = isLeader(me);
  const campaigns = await getCampaigns();
  // show_as_fundraiser = "listed in the Pack store"
  const shown = campaigns.filter((c) => c.show_as_fundraiser && c.status !== "inactive");
  const orders = await getOrders(shown.map((c) => c.id));
  const lastSync = campaigns.reduce<string | null>((m, c) => (!m || c.synced_at > m ? c.synced_at : m), null);

  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Pack store</h1>
      <p className="-mt-2 text-sm text-muted">Pack 361 shirts, hoodies and gear, ordered through Givebutter.</p>

      {shown.map((c) => {
        const mine = orders.filter((o) => o.campaign_id === c.id && isPaid(o) && me.family_id && o.family_id === me.family_id);
        const all = orders.filter((o) => o.campaign_id === c.id && isPaid(o));
        const items = mine.flatMap((o) => o.items.filter((i) => i.type !== "donation"));
        return (
          <section key={c.id} className="card space-y-2">
            <h2 className="flex items-center gap-2 font-extrabold text-pine-950">
              <ShoppingBag className="h-5 w-5 text-pine" aria-hidden /> {c.title}
            </h2>
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
                <ExternalLink className="h-4 w-4" aria-hidden /> {mine.length ? "Order more" : "Shop on Givebutter"}
              </a>
            )}
            {leader && all.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-pine">
                  All orders ({all.length}, {money(c.raised)})
                </summary>
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

      {shown.length === 0 && (
        <section className="card space-y-2">
          <p className="text-sm text-muted">Pack shirts and hoodies are on Givebutter.</p>
          <a href="https://givebutter.com/pack361-attire" target="_blank" rel="noopener noreferrer" className="btn-gold w-full">
            <ExternalLink className="h-4 w-4" aria-hidden /> Shop pack attire
          </a>
        </section>
      )}

      {isAdmin(me) && (
        <section className="card space-y-3">
          <h2 className="section-title">Givebutter (admins)</h2>
          <p className="text-xs text-muted">
            {lastSync ? `Last synced ${timeAgo(lastSync)}. ` : ""}Syncs every morning. Choose which Givebutter campaigns are
            listed in the store; event sign-ups show on the calendar and campout pages either way.
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
                    <SubmitButton
                      className={`badge shrink-0 normal-case tracking-normal ${c.show_as_fundraiser ? "bg-pine text-white" : "bg-surface text-muted"}`}
                    >
                      {c.show_as_fundraiser ? "In store" : "Hidden"}
                    </SubmitButton>
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
