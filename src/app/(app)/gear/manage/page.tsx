import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleCheck, Plus } from "lucide-react";
import BackLink from "@/components/BackLink";
import GearLoanActions from "@/components/GearLoanActions";
import { displayName, isGearKeeper, requireMember } from "@/lib/data";
import { fmtShortDate } from "@/lib/advancement";
import { easternDate } from "@/lib/tz";
import { LOAN_STATUS_LABEL, LOAN_STATUS_STYLE, gearToday, getGearItems, getManagedLoans, isOverdue, type ManagedLoan } from "@/lib/gear";

export const metadata: Metadata = { title: "Manage gear" };

const DONE: Record<string, string> = {
  added: "Added to the closet.",
  saved: "Your changes are saved.",
};

export default async function ManageGearPage({ searchParams }: PageProps<"/gear/manage">) {
  const me = await requireMember();
  if (!isGearKeeper(me)) redirect("/gear");
  const sp = await searchParams;
  const done = DONE[String(sp.done ?? "")];
  const [items, { open, recent }] = await Promise.all([getGearItems({ all: true }), getManagedLoans()]);
  const today = gearToday();
  const waiting = open.filter((l) => l.status === "requested").sort((a, b) => a.requested_at.localeCompare(b.requested_at));
  const ready = open.filter((l) => l.status === "approved");
  const out = open.filter((l) => l.status === "out");
  const late = out.filter((l) => isOverdue(l, today)).length;

  return (
    <>
      <BackLink href="/gear" label="Gear closet" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Manage gear</h1>
      <p className="-mt-1 text-sm text-muted">
        Answer requests, mark gear picked up and returned. Families get a phone alert when you approve or decline, and a reminder when gear is overdue.
      </p>

      {done && (
        <p className="flex items-center gap-1.5 rounded-xl bg-mint p-3 text-sm font-semibold text-pine">
          <CircleCheck className="h-4 w-4 shrink-0" aria-hidden /> {done}
        </p>
      )}

      <LoanSection title="Waiting for an answer" empty="No requests waiting." loans={waiting} today={today} />
      {ready.length > 0 && <LoanSection title="Ready to pick up" loans={ready} today={today} />}
      <LoanSection
        title="Out now"
        right={late > 0 ? <span className="text-xs font-bold text-gold-800">{late} overdue</span> : undefined}
        empty="Nothing is out right now."
        loans={[...out].sort((a, b) => a.due_on.localeCompare(b.due_on))}
        today={today}
      />

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="section-title">Inventory</h2>
          <span className="text-xs text-muted">{items.filter((i) => i.active).length} items</span>
        </div>
        <p className="px-1 text-xs text-muted">What the pack has, where it&apos;s kept, and who has it now. Tap an item to change it.</p>
        <Link href="/gear/manage/new" className="btn-primary w-full">
          <Plus className="h-4 w-4" aria-hidden /> Add gear
        </Link>
        {items.length > 0 && (
          <div className="card overflow-x-auto p-0">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="bg-surface-low text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2 font-bold">Item</th>
                  <th className="px-3 py-2 font-bold">Where it&apos;s kept</th>
                  <th className="px-3 py-2 text-right font-bold">Free</th>
                  <th className="px-3 py-2 font-bold">Who has it</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((i) => {
                  const holders = [...ready, ...out].filter((l) => l.item_id === i.id);
                  return (
                    <tr key={i.id} className={i.active ? "" : "opacity-60"}>
                      <td className="px-3 py-2.5 align-top">
                        <Link href={`/gear/manage/${i.id}`} className="font-bold text-pine underline-offset-2 hover:underline">
                          {i.name}
                        </Link>
                        <span className="block text-xs text-muted">
                          {i.category}
                          {!i.active && " · put away"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-top text-ink">{i.location || <span className="text-muted">Not set</span>}</td>
                      <td className="px-3 py-2.5 text-right align-top font-semibold text-ink">
                        {i.available} of {i.quantity}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        {holders.length ? (
                          <ul className="space-y-0.5">
                            {holders.map((l) => (
                              <li key={l.id} className="text-xs text-ink">
                                <b>{l.family?.family_name ?? "A"} family</b>
                                {l.quantity > 1 ? ` × ${l.quantity}` : ""}
                                <span className="text-muted">
                                  {" "}
                                  · {l.status === "out" ? `back by ${fmtShortDate(l.due_on)}` : "to pick up"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-xs text-muted">All here</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {recent.length > 0 && (
        <details className="card">
          <summary className="flex min-h-10 cursor-pointer items-center text-sm font-bold text-navy">Recently returned or declined</summary>
          <ul className="mt-2 divide-y divide-line">
            {recent.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-2 py-2">
                <span className="min-w-0 text-sm">
                  <span className="block font-semibold text-ink">{loanTitle(l)}</span>
                  <span className="block text-xs text-muted">
                    {who(l)}
                    {l.returned_at ? ` · back ${fmtShortDate(easternDate(l.returned_at))}` : ""}
                  </span>
                </span>
                <span className={`badge shrink-0 normal-case tracking-normal ${LOAN_STATUS_STYLE[l.status]}`}>{LOAN_STATUS_LABEL[l.status]}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

const loanTitle = (l: ManagedLoan) => `${l.quantity > 1 ? `${l.quantity} × ` : ""}${l.item?.name ?? "Gear"}`;
const who = (l: ManagedLoan) =>
  `${l.family?.family_name ?? "Unknown"} family${l.adult ? ` · asked by ${displayName(l.adult)}` : ""}`;

function LoanSection({
  title,
  loans,
  today,
  empty,
  right,
}: {
  title: string;
  loans: ManagedLoan[];
  today: string;
  empty?: string;
  right?: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="section-title">
          {title}
          {loans.length > 0 ? ` (${loans.length})` : ""}
        </h2>
        {right}
      </div>
      {loans.length === 0 ? (
        <p className="card text-sm text-muted">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {loans.map((l) => {
            const late = isOverdue(l, today);
            return (
              <li key={l.id} className={`card space-y-2 py-3 ${late ? "border-gold bg-gold-50" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold text-ink">{loanTitle(l)}</span>
                    <span className="block text-xs font-semibold text-navy">{who(l)}</span>
                    <span className="block text-xs text-muted">
                      {[l.event?.title, l.needed_on ? `Pick up ${fmtShortDate(l.needed_on)}` : null, `Back by ${fmtShortDate(l.due_on)}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {l.note && <span className="block text-xs text-ink">“{l.note}”</span>}
                  </span>
                  <span className={`badge shrink-0 normal-case tracking-normal ${late ? "bg-gold text-on-gold" : LOAN_STATUS_STYLE[l.status]}`}>
                    {late ? "Overdue" : LOAN_STATUS_LABEL[l.status]}
                  </span>
                </div>
                <GearLoanActions id={l.id} status={l.status as "requested" | "approved" | "out"} dueOn={l.due_on} today={today} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
