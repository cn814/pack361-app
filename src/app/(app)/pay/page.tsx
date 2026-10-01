import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, HandCoins } from "lucide-react";
import DuesPayCard from "@/components/DuesPayCard";
import PayCheckout, { type PayItem } from "@/components/PayCheckout";
import { requireMember } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { getDuesPayUrl, getMyCharges, onlinePaymentsReady } from "@/lib/payments";
import { chargeFor, fmtMoney, PAID_VIA_LABEL, STATUS_LABEL, STATUS_STYLE } from "@/lib/money";
import { fmtShortDate } from "@/lib/advancement";
import { easternDate } from "@/lib/tz";
import { paypalEnv } from "@/lib/paypal";

export const metadata: Metadata = { title: "Pay the pack" };

export default async function PayPage() {
  const me = await requireMember();
  const [charges, settings, duesUrl] = await Promise.all([getMyCharges(me), getSettings(), getDuesPayUrl()]);
  const due = charges.filter((c) => c.status === "open" && c.amount_cents > 0);
  const waiting = charges.filter((c) => c.status === "reported");
  const done = charges
    .filter((c) => c.status === "paid" || c.status === "waived")
    .sort((a, b) => (b.paid_at ?? b.created_at).localeCompare(a.paid_at ?? a.created_at))
    .slice(0, 10);
  const toItem = (c: (typeof due)[number]): PayItem => {
    const who = chargeFor(c);
    return { id: c.id, title: c.title, detail: who ? `For ${who}` : null, amount_cents: c.amount_cents, due_on: c.due_on };
  };
  // With a Givebutter dues page, dues are paid there; everything else is paid here.
  const duesItems = duesUrl ? due.filter((c) => c.kind === "dues").map(toItem) : [];
  const items: PayItem[] = due.filter((c) => !(duesUrl && c.kind === "dues")).map(toItem);
  const ready = onlinePaymentsReady();

  return (
    <>
      <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-pine-950">
        <HandCoins className="h-6 w-6 text-pine" aria-hidden /> Pay the pack
      </h1>
      <p className="-mt-1 text-sm text-muted">
        {settings.registration_billing === "on" ? "Pack dues, registration fees, campouts and events" : "Pack dues, campouts and events"}, all in one place.
      </p>

      {duesUrl && duesItems.length > 0 && <DuesPayCard items={duesItems} url={duesUrl} />}

      {items.length ? (
        <PayCheckout
          items={items}
          clientId={ready ? (process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() ?? null) : null}
          sandbox={paypalEnv() === "sandbox"}
          otherHow={settings.pay_other_how}
        />
      ) : duesItems.length ? null : (
        <section className="card flex items-start gap-2 text-sm text-pine">
          <CircleCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p className="font-semibold">You&apos;re all paid up. Thank you!</p>
        </section>
      )}

      {waiting.length > 0 && (
        <section className="card space-y-2">
          <h2 className="section-title">Waiting for a leader to confirm</h2>
          <ul className="divide-y divide-line">
            {waiting.map((c) => {
              const who = chargeFor(c);
              return (
                <li key={c.id} className="flex items-start justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{c.title}</span>
                    <span className="block text-[11px] text-muted">
                      {[who ? `For ${who}` : null, c.paid_via ? `Paid by ${PAID_VIA_LABEL[c.paid_via].toLowerCase()}` : null, c.report_note]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-bold text-ink">{fmtMoney(c.amount_cents)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <section className="card space-y-2">
          <h2 className="section-title">Paid</h2>
          <ul className="divide-y divide-line">
            {done.map((c) => {
              const who = chargeFor(c);
              return (
                <li key={c.id} className="flex items-start justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{c.title}</span>
                    <span className="block text-[11px] text-muted">
                      {[
                        who ? `For ${who}` : null,
                        c.paid_at ? fmtShortDate(easternDate(c.paid_at)) : null,
                        c.paid_via ? PAID_VIA_LABEL[c.paid_via] : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className={`badge shrink-0 normal-case tracking-normal ${STATUS_STYLE[c.status]}`}>
                    {c.status === "paid" ? fmtMoney(c.paid_amount_cents ?? c.amount_cents) : STATUS_LABEL[c.status]}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="px-1 text-[11px] text-muted">
        If cost is ever a reason your scout might miss out, talk to the Cubmaster or Committee Chair privately. Questions about a
        charge? <Link href="/leaders" className="font-semibold text-pine underline">Contact a leader</Link>.
      </p>
    </>
  );
}
