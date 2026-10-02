import type { Metadata } from "next";
import { ExternalLink, Mail, Popcorn } from "lucide-react";
import BackLink from "@/components/BackLink";
import CopyCode from "@/components/CopyCode";
import { requireMember } from "@/lib/data";
import { POPCORN, POPCORN_STEPS } from "@/lib/popcorn";

export const metadata: Metadata = { title: "Popcorn fundraiser" };

function Row({ label, value, strong, sub, highlight }: { label: string; value: string; strong?: boolean; sub?: boolean; highlight?: boolean }) {
  return (
    <tr className={highlight ? "bg-gold-50" : ""}>
      <td className={`py-2 pr-2 ${sub ? "pl-4 text-xs text-muted" : "text-ink"} ${strong ? "font-bold" : ""}`}>{label}</td>
      <td className={`whitespace-nowrap py-2 text-right ${sub ? "text-xs text-muted" : "text-ink"} ${strong ? "font-bold" : ""}`}>{value}</td>
    </tr>
  );
}

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "Is there a cap on what a Scout can earn?",
    a: `No. Every sale is credited the same way: ${POPCORN.scoutPercent}% of the Pack's commission on that sale goes to the Scout's account, no matter how much the Scout sells.`,
  },
  {
    q: "What happens to a Scout account if we leave the Pack, bridge to a troop, or stop Scouting?",
    a: "In all three cases the account balance stays with Pack 361.",
  },
  {
    q: "We have more than one Scout in the Pack. How does that work?",
    a: "Each Scout has their own storefront and sells for themselves. Earnings go to that Scout's own account.",
  },
  {
    q: "How do I set up my Trail's End account?",
    a: (
      <>
        Follow the step-by-step guide:{" "}
        <a href={POPCORN.gettingStartedUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-pine underline">
          Getting started with the Trail&apos;s End app
        </a>
        .
      </>
    ),
  },
  {
    q: "What incentives does Trail's End offer?",
    a: (
      <>
        Current rewards and prize levels:{" "}
        <a href={POPCORN.rewardsUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-pine underline">
          How Trail&apos;s End rewards work
        </a>
        .
      </>
    ),
  },
];

export default async function PopcornPage() {
  await requireMember();
  const b = POPCORN.perBag;
  return (
    <>
      <BackLink href="/store" label="Pack store" />
      <div>
        <span className="badge bg-navy text-white">Pack 361 fundraiser</span>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-extrabold tracking-tight text-pine-950">
          <Popcorn className="h-7 w-7 text-gold-700" aria-hidden /> Trail&apos;s End popcorn
        </h1>
      </div>
      <p className="-mt-1 text-sm text-ink">
        Our pack&apos;s main fundraiser of the year: an easy way to raise money for pack activities, build credit toward your
        Scout&apos;s dues, and earn individual rewards through the Trail&apos;s End program.
      </p>
      <p className="text-sm text-muted">
        Trail&apos;s End also runs <b className="text-ink">Heroes &amp; Helpers</b>, which sends product to military units, first
        responders and food banks. Supporters who don&apos;t want popcorn for themselves can still contribute that way.
      </p>

      <section className="card space-y-2 border-l-4 border-l-navy">
        <h2 className="section-title">Pack 361 unit code</h2>
        <CopyCode code={POPCORN.unitCode} />
        <p className="text-sm text-muted">Enter this code when you register your Scout in the Trail&apos;s End app. It links their sales to Pack 361.</p>
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="font-extrabold text-pine-950">Getting started: five steps</h2>
          <p className="text-xs text-muted">About ten minutes in all.</p>
        </div>
        <ol className="divide-y divide-line">
          {POPCORN_STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3 py-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-navy text-sm font-extrabold text-white">{i + 1}</span>
              <span>
                <span className="block font-bold text-navy">{s.title}</span>
                <span className="block text-sm text-muted">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="grid grid-cols-2 gap-2">
          <a href={POPCORN.androidUrl} target="_blank" rel="noopener noreferrer" className="btn-primary py-2 text-sm">
            <ExternalLink className="h-4 w-4" aria-hidden /> App for Android
          </a>
          <a href={POPCORN.appleUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost py-2 text-sm">
            <ExternalLink className="h-4 w-4" aria-hidden /> App for iPhone
          </a>
        </div>
      </section>

      <h2 className="section-title pt-2">Questions</h2>

      <section className="card space-y-2">
        <h3 className="font-extrabold text-pine-950">Where does the money go on each bag sold?</h3>
        <p className="text-sm text-muted">
          The Pack buys the popcorn from the council up front and keeps a commission on each bag. Using a {b.price} bag as the
          example:
        </p>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            <Row label="Customer pays" value={b.price} strong />
            <Row label="Paid up front by the Pack to the council" value={b.toCouncil} />
            <Row label="Of that, the cost to make and ship the popcorn" value={b.productCost} sub />
            <Row label="The rest funds our local Scouting council" value="Remainder" sub />
            <Row label="Pack commission: what the Pack receives" value={b.packCommission} strong highlight />
          </tbody>
        </table>
      </section>

      <section className="card space-y-2">
        <h3 className="font-extrabold text-pine-950">How is the Pack commission divided between the Scout and the Pack?</h3>
        <p className="text-sm text-muted">
          The {POPCORN.scoutPercent} / {100 - POPCORN.scoutPercent} split applies to the <b className="text-ink">Pack&apos;s commission</b> above.
          On that same {b.price} bag:
        </p>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            <Row label={`${POPCORN.scoutPercent}% credited to the Scout's account`} value={b.scoutShare} />
            <Row label={`${100 - POPCORN.scoutPercent}% to the Pack treasury for activities`} value={b.packShare} />
          </tbody>
        </table>
      </section>

      <section className="card divide-y divide-line py-1">
        {FAQ.map((f) => (
          <div key={f.q} className="space-y-1 py-3">
            <h3 className="font-bold text-navy">{f.q}</h3>
            <p className="text-sm text-muted">{f.a}</p>
          </div>
        ))}
      </section>

      <section className="card space-y-1 border-l-4 border-l-gold">
        <h3 className="font-extrabold text-pine-950">Questions or need help getting set up?</h3>
        <p className="text-sm text-ink">{POPCORN.contact.names}:</p>
        <a href={`mailto:${POPCORN.contact.email}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-pine underline">
          <Mail className="h-4 w-4" aria-hidden /> {POPCORN.contact.email}
        </a>
      </section>
    </>
  );
}
