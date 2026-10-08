import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, CircleCheck, Settings2, Tent } from "lucide-react";
import BackLink from "@/components/BackLink";
import SubmitButton from "@/components/SubmitButton";
import { isGearKeeper, requireMember } from "@/lib/data";
import { fmtShortDate } from "@/lib/advancement";
import {
  GEAR_CATEGORIES,
  LOAN_STATUS_LABEL,
  LOAN_STATUS_STYLE,
  countWaitingGear,
  gearToday,
  getFamilyLoans,
  getGearItems,
  isOverdue,
  type GearLoan,
} from "@/lib/gear";
import { cancelGearRequest } from "./actions";

export const metadata: Metadata = { title: "Gear closet" };

const DONE: Record<string, string> = {
  sent: "Request sent. The quartermaster will let you know.",
  cancelled: "Your request was cancelled.",
};

export default async function GearPage({ searchParams }: PageProps<"/gear">) {
  const me = await requireMember();
  const sp = await searchParams;
  const done = DONE[String(sp.done ?? "")];
  const leader = isGearKeeper(me);
  const [items, loans, waiting] = await Promise.all([
    getGearItems(),
    getFamilyLoans(me.family_id),
    leader ? countWaitingGear() : Promise.resolve(0),
  ]);
  const today = gearToday();
  const current = loans.filter((l) => ["requested", "approved", "out"].includes(l.status));
  const past = loans.filter((l) => !current.includes(l)).slice(0, 10);

  return (
    <>
      <BackLink href="/pack" label="Pack" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Gear closet</h1>
      <p className="-mt-1 text-sm text-muted">
        Tents, camp stoves and more that the pack lends to families. Ask to borrow something and the quartermaster will let you know.
      </p>

      {done && (
        <p className="flex items-center gap-1.5 rounded-xl bg-mint p-3 text-sm font-semibold text-pine">
          <CircleCheck className="h-4 w-4 shrink-0" aria-hidden /> {done}
        </p>
      )}

      {leader && (
        <Link href="/gear/manage" className="btn-ghost w-full">
          <Settings2 className="h-4 w-4" aria-hidden /> Manage the gear closet
          {waiting > 0 && <span className="rounded-full bg-gold px-2 py-0.5 text-xs font-extrabold text-on-gold">{waiting} waiting</span>}
        </Link>
      )}

      {current.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-title px-1">Your requests</h2>
          <ul className="space-y-2">
            {current.map((l) => (
              <LoanCard key={l.id} l={l} today={today} />
            ))}
          </ul>
        </section>
      )}

      {items.length === 0 ? (
        <p className="card text-sm text-muted">Nothing in the closet yet.</p>
      ) : (
        GEAR_CATEGORIES.map((cat) => {
          const list = items.filter((i) => i.category === cat);
          if (!list.length) return null;
          return (
            <section key={cat} className="space-y-2">
              <h2 className="section-title px-1">{cat}</h2>
              <ul className="card divide-y divide-line p-0">
                {list.map((i) => (
                  <li key={i.id}>
                    <Link href={`/gear/${i.id}`} className="flex min-h-[3.5rem] items-center gap-3 px-4 py-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mint">
                        <Tent className="h-[18px] w-[18px] text-pine" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-bold text-ink">{i.name}</span>
                        {i.description && <span className="line-clamp-2 block text-xs text-muted">{i.description}</span>}
                        <span className={`block text-xs font-bold ${i.available ? "text-pine" : "text-gold-800"}`}>
                          {i.available ? `${i.available} of ${i.quantity} free now` : "All lent out right now"}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-bold text-pine">Borrow</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}

      {past.length > 0 && (
        <details className="card">
          <summary className="flex min-h-10 cursor-pointer items-center text-sm font-bold text-navy">Past requests ({past.length})</summary>
          <ul className="mt-2 space-y-2">
            {past.map((l) => (
              <LoanCard key={l.id} l={l} today={today} plain />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function LoanCard({ l, today, plain }: { l: GearLoan; today: string; plain?: boolean }) {
  const late = isOverdue(l, today);
  return (
    <li className={plain ? "rounded-xl border border-line p-3" : `card space-y-2 py-3 ${late ? "border-gold bg-gold-50" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-sm font-bold text-ink">
            {l.quantity > 1 ? `${l.quantity} × ` : ""}
            {l.item?.name ?? "Gear"}
          </span>
          <span className="block text-xs text-muted">
            {[l.event?.title, l.needed_on ? `Pick up ${fmtShortDate(l.needed_on)}` : null, `Back by ${fmtShortDate(l.due_on)}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {late && <span className="block text-xs font-bold text-gold-800">Past the bring-back day. Please return it soon.</span>}
          {l.leader_note && <span className="block text-xs text-navy">From the quartermaster: “{l.leader_note}”</span>}
        </span>
        <span className={`badge shrink-0 normal-case tracking-normal ${late ? "bg-gold text-on-gold" : LOAN_STATUS_STYLE[l.status]}`}>
          {late ? "Overdue" : LOAN_STATUS_LABEL[l.status]}
        </span>
      </div>
      {(l.status === "requested" || l.status === "approved") && (
        <form action={cancelGearRequest}>
          <input type="hidden" name="id" value={l.id} />
          <SubmitButton className="min-h-10 text-sm font-bold text-danger underline">Cancel request</SubmitButton>
        </form>
      )}
    </li>
  );
}
