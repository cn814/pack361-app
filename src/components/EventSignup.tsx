import { CircleCheck, Ticket, Users } from "lucide-react";
import type { GbCampaign, GbOrder } from "@/lib/fundraising-data";
import { isPaid, money } from "@/lib/fundraising-data";
import { timeAgo } from "@/lib/format";

/**
 * Givebutter sign-up status for one event, as every family sees it: the headcount and whether
 * your family is in. Who signed up and what they paid is in EventSignupLeaders.
 */
export default function EventSignup({
  campaign,
  orders,
  myFamilyId,
  signupUrl,
}: {
  campaign: GbCampaign;
  orders: GbOrder[];
  myFamilyId: string | null;
  signupUrl: string | null;
}) {
  const paid = orders.filter(isPaid);
  const mine = paid.filter((o) => myFamilyId && o.family_id === myFamilyId);
  const myTickets = mine.reduce((n, o) => n + o.tickets, 0);
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Sign-ups</h2>
        <span className="text-[11px] text-muted">Givebutter, updated {timeAgo(campaign.synced_at)}</span>
      </div>
      <div className={`grid gap-2 ${campaign.tickets_sold > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
        <div className="rounded-xl bg-surface-low p-3">
          <Users className="h-4 w-4 text-pine" aria-hidden />
          <p className="text-2xl font-extrabold text-pine-950">{campaign.families_registered}</p>
          <p className="text-xs text-muted">families signed up</p>
        </div>
        {campaign.tickets_sold > 0 && (
          <div className="rounded-xl bg-surface-low p-3">
            <Ticket className="h-4 w-4 text-pine" aria-hidden />
            <p className="text-2xl font-extrabold text-pine-950">{campaign.tickets_sold}</p>
            <p className="text-xs text-muted">people / tickets</p>
          </div>
        )}
      </div>
      {mine.length > 0 ? (
        <p className="flex items-center gap-2 rounded-xl bg-mint p-3 text-sm font-semibold text-pine">
          <CircleCheck className="h-4 w-4 shrink-0" aria-hidden />
          Your family is signed up{myTickets ? ` (${myTickets} ${myTickets === 1 ? "ticket" : "tickets"})` : ""}.
        </p>
      ) : (
        signupUrl && (
          <a href={signupUrl} target="_blank" rel="noopener noreferrer" className="btn-gold w-full">
            <Ticket className="h-4 w-4" aria-hidden /> Sign up on Givebutter
          </a>
        )
      )}
      {mine.length === 0 && (
        <p className="text-[11px] text-muted">
          Signed up with a different email than the one the pack has? It won&apos;t show here, but you&apos;re still registered.
        </p>
      )}
    </section>
  );
}

/** Leaders: who signed up on Givebutter and what they paid. */
export function EventSignupLeaders({ campaign, orders }: { campaign: GbCampaign; orders: GbOrder[] }) {
  const paid = orders.filter(isPaid);
  const total = paid.reduce((n, o) => n + (o.amount ?? 0), 0);
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Sign-ups and payments</h2>
        <span className="text-[11px] text-muted">Givebutter, updated {timeAgo(campaign.synced_at)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-surface-low p-3">
          <Users className="h-4 w-4 text-pine" aria-hidden />
          <p className="text-2xl font-extrabold text-pine-950">{campaign.families_registered}</p>
          <p className="text-xs text-muted">families signed up</p>
        </div>
        <div className="rounded-xl bg-surface-low p-3">
          <Ticket className="h-4 w-4 text-pine" aria-hidden />
          <p className="text-2xl font-extrabold text-pine-950">{money(total)}</p>
          <p className="text-xs text-muted">paid so far</p>
        </div>
      </div>
      {paid.length > 0 ? (
        <ul className="divide-y divide-line text-sm">
          {paid.map((o) => (
            <li key={o.id} className="flex justify-between gap-2 py-1.5">
              <span className="text-ink">{o.name ?? "Unknown"}</span>
              <span className="shrink-0 text-xs text-muted">
                {o.tickets ? `${o.tickets} · ` : ""}
                {money(o.amount)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Nobody has signed up on Givebutter yet.</p>
      )}
    </section>
  );
}
