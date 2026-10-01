import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CircleCheck, Download, Info } from "lucide-react";
import ActionForm, { Field } from "@/components/ActionForm";
import AddFeeForm from "@/components/AddFeeForm";
import BackLink from "@/components/BackLink";
import SubmitButton from "@/components/SubmitButton";
import { isCommittee, requireMember } from "@/lib/data";
import { getSettings, settingCents } from "@/lib/settings";
import { getDens } from "@/lib/roster-data";
import { createClient } from "@/lib/supabase/server";
import { onlinePaymentsReady } from "@/lib/payments";
import { paypalEnv } from "@/lib/paypal";
import {
  daysAgoIso,
  getAllCharges,
  getPaymentProblems,
  getRsvpTotals,
  inSeason,
  MIGRATED_NOTE,
  rsvpMismatch,
  summarize,
  todayEastern,
  type LeaderCharge,
} from "@/lib/money-data";
import {
  CHARGE_KINDS,
  CHARGE_STATUSES,
  KIND_LABEL,
  PAID_VIA_LABEL,
  STATUS_SHORT,
  STATUS_STYLE,
  centsToInput,
  chargeFor,
  fmtMoney,
  ownerName,
  type ChargeKind,
  type ChargeStatus,
} from "@/lib/money";
import { fmtShortDate } from "@/lib/advancement";
import { easternDate } from "@/lib/tz";
import { addRegistrationFees, chargeAction, savePaySettings, setRemitted } from "./actions";

export const metadata: Metadata = { title: "Money" };

const TABS = { charges: "Charges", registration: "Registration", add: "Add a fee", settings: "Settings" } as const;
type Tab = keyof typeof TABS;
const SHOW_MAX = 300;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function MoneyPage({ searchParams }: PageProps<"/leaders/money">) {
  const me = await requireMember();
  if (!isCommittee(me)) redirect("/leaders");
  const sp = await searchParams;
  const tab: Tab = one(sp.tab) in TABS ? (one(sp.tab) as Tab) : "charges";
  const note = one(sp.note).slice(0, 200);
  const [settings, all, problems] = await Promise.all([getSettings(), getAllCharges(), getPaymentProblems()]);
  const season = all.filter((c) => c.status !== "canceled" && inSeason(c, settings));
  const sum = summarize(season);
  const needAmount = all.filter((c) => c.amount_cents === 0 && (c.status === "open" || c.status === "reported"));
  const migrated = needAmount.filter((c) => c.note?.startsWith(MIGRATED_NOTE)).length;

  return (
    <>
      <BackLink href="/leaders" label="Leaders" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Money</h1>
      <p className="-mt-1 text-sm text-muted">
        Dues, registration and event fees for {settings.dues_season}
        {settings.registration_year ? ` (registration ${settings.registration_year})` : ""}.
      </p>

      {note && (
        <p className="flex items-center gap-1.5 rounded-xl bg-mint p-3 text-sm font-semibold text-pine">
          <CircleCheck className="h-4 w-4 shrink-0" aria-hidden /> {note}
        </p>
      )}

      {!onlinePaymentsReady() && (
        <p className="flex items-start gap-2 rounded-xl bg-gold-50 p-3 text-xs text-gold-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Online payments are off until the PayPal keys are added in Vercel. Families can still see what they owe and pay by check or
          cash.
        </p>
      )}
      {onlinePaymentsReady() && paypalEnv() === "sandbox" && (
        <p className="flex items-start gap-2 rounded-xl bg-gold-50 p-3 text-xs text-gold-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          PayPal is in test mode (sandbox): no real money moves. Set PAYPAL_ENV to live in Vercel when you&apos;re ready.
        </p>
      )}

      {needAmount.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-gold-50 p-3 text-xs text-gold-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {needAmount.length} unpaid item{needAmount.length === 1 ? " has" : "s have"} no amount
            {migrated ? ` (${migrated} moved from the old dues list)` : ""}. Set each amount before confirming it, or waive it.{" "}
            <Link href="/leaders/money?scope=all&amount=none" className="font-bold underline">
              Show them below
            </Link>
          </span>
        </p>
      )}

      {problems.length > 0 && (
        <section className="card space-y-2 border-l-4 border-l-danger">
          <h2 className="section-title flex items-center gap-1.5 text-danger">
            <AlertTriangle className="h-4 w-4" aria-hidden /> Online payments to check
          </h2>
          <ul className="divide-y divide-line text-sm">
            {problems.map((p) => (
              <li key={p.id} className="py-2">
                <span className="font-semibold text-ink">
                  {p.family ? `${p.family.family_name} family` : p.adult ? `${p.adult.preferred_name || p.adult.first_name} ${p.adult.last_name}` : "Someone"}
                </span>{" "}
                · {fmtMoney(p.amount_cents)} · {fmtShortDate(easternDate(p.created_at))}
                <span className="block text-xs text-muted">{p.error}</span>
                <span className="block text-[11px] text-muted">PayPal transaction {p.provider_capture_id ?? p.provider_order_id}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card grid grid-cols-2 gap-3">
        <Stat label="Still owed" value={fmtMoney(sum.owed)} sub={`${sum.owedCount} item${sum.owedCount === 1 ? "" : "s"}`} href="/leaders/money?status=open" />
        <Stat
          label="Families say paid"
          value={fmtMoney(sum.reported)}
          sub={sum.reportedCount ? `${sum.reportedCount} to confirm` : "Nothing to confirm"}
          href="/leaders/money?status=reported"
          warn={sum.reportedCount > 0}
        />
        <Stat label="Paid" value={fmtMoney(sum.paid)} sub={`${sum.paidCount} item${sum.paidCount === 1 ? "" : "s"}`} href="/leaders/money?status=paid" />
        <Stat label="Online / check & cash" value={`${fmtMoney(sum.online)} / ${fmtMoney(sum.offline)}`} sub={sum.waivedCount ? `${sum.waivedCount} waived` : "This season"} />
      </section>

      <div className="flex flex-wrap gap-2 text-sm font-semibold" role="tablist">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <Link
            key={t}
            href={`/leaders/money?tab=${t}`}
            role="tab"
            aria-selected={tab === t}
            className={`rounded-full px-3 py-1.5 ${tab === t ? "bg-pine text-white" : "border border-line bg-white text-navy"}`}
          >
            {TABS[t]}
          </Link>
        ))}
      </div>

      {tab === "charges" && <ChargesTab all={all} settings={settings} sp={sp} />}
      {tab === "registration" && <RegistrationTab all={all} settings={settings} year={one(sp.year)} />}
      {tab === "add" && <AddTab settings={settings} />}
      {tab === "settings" && <SettingsTab settings={settings} />}
    </>
  );
}

function Stat({ label, value, sub, href, warn }: { label: string; value: string; sub: string; href?: string; warn?: boolean }) {
  const body = (
    <>
      <span className="block text-[11px] font-bold uppercase tracking-wider text-muted">{label}</span>
      <span className={`block text-lg font-extrabold ${warn ? "text-gold-800" : "text-pine-950"}`}>{value}</span>
      <span className="block text-[11px] text-muted">{sub}</span>
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-xl bg-surface-low p-2">
      {body}
    </Link>
  ) : (
    <div className="rounded-xl bg-surface-low p-2">{body}</div>
  );
}

// ---------------------------------------------------------------------------
// Charges: filter, confirm, mark paid, waive, cancel, reopen
// ---------------------------------------------------------------------------
async function ChargesTab({
  all,
  settings,
  sp,
}: {
  all: LeaderCharge[];
  settings: Awaited<ReturnType<typeof getSettings>>;
  sp: Record<string, string | string[] | undefined>;
}) {
  const kind = one(sp.kind) as ChargeKind | "";
  const status = one(sp.status) as ChargeStatus | "";
  const scope = one(sp.scope) === "all" ? "all" : "season";
  const q = one(sp.q).trim().slice(0, 60);
  const ql = q.toLowerCase();
  const noAmount = one(sp.amount) === "none";
  const rows = all.filter(
    (c) =>
      (!noAmount || (c.amount_cents === 0 && (c.status === "open" || c.status === "reported"))) &&
      (scope === "all" || inSeason(c, settings)) &&
      (!kind || c.kind === kind) &&
      (status ? c.status === status : c.status !== "canceled") &&
      (!ql || `${ownerName(c)} ${chargeFor(c) ?? ""} ${c.title}`.toLowerCase().includes(ql)),
  );
  rows.sort((a, b) => ownerName(a).localeCompare(ownerName(b)) || a.title.localeCompare(b.title));
  const shown = rows.slice(0, SHOW_MAX);
  const rsvps = await getRsvpTotals([...new Set(shown.filter((c) => c.kind === "event" && c.event_id).map((c) => c.event_id!))]);
  const reported = rows.filter((c) => c.status === "reported" && c.amount_cents > 0);
  const qs = new URLSearchParams();
  if (kind) qs.set("kind", kind);
  if (status) qs.set("status", status);
  if (scope === "all") qs.set("scope", "all");
  if (q) qs.set("q", q);
  if (noAmount) qs.set("amount", "none");
  const query = qs.toString();
  const back = `/leaders/money${query ? `?${query}` : ""}`;
  const total = rows.reduce((s, c) => s + (c.status === "paid" ? (c.paid_amount_cents ?? c.amount_cents) : c.amount_cents), 0);

  return (
    <>
      <Form className="card grid grid-cols-2 gap-2" action="/leaders/money">
        <label className="block space-y-1">
          <span className="text-xs font-bold text-navy">Kind</span>
          <select className="input py-2" name="kind" defaultValue={kind}>
            <option value="">All kinds</option>
            {CHARGE_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold text-navy">Status</span>
          <select className="input py-2" name="status" defaultValue={status}>
            <option value="">All but canceled</option>
            {CHARGE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_SHORT[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold text-navy">Family or name</span>
          <input className="input py-2" name="q" defaultValue={q} placeholder="Search" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold text-navy">When</span>
          <select className="input py-2" name="scope" defaultValue={scope}>
            <option value="season">This season</option>
            <option value="all">Everything</option>
          </select>
        </label>
        <button className="btn-ghost col-span-2 py-2">Show</button>
      </Form>

      <div className="flex items-center justify-between gap-2 px-1 text-xs text-muted">
        <span>
          {rows.length} item{rows.length === 1 ? "" : "s"} · {fmtMoney(total)}
          {rows.length > SHOW_MAX ? ` (showing the first ${SHOW_MAX}; narrow the search)` : ""}
        </span>
        <a href={`/leaders/money/csv${query ? `?${query}` : ""}`} className="inline-flex items-center gap-1 font-bold text-pine underline">
          <Download className="h-3.5 w-3.5" aria-hidden /> Download CSV
        </a>
      </div>

      {reported.length > 1 && (
        <form action={chargeAction} className="card flex items-center justify-between gap-2 border-l-4 border-l-gold">
          <input type="hidden" name="back" value={back} />
          {reported.map((c) => (
            <input key={c.id} type="hidden" name="id" value={c.id} />
          ))}
          <span className="text-sm text-ink">
            {reported.length} families say they paid ({fmtMoney(reported.reduce((s, c) => s + c.amount_cents, 0))}).
          </span>
          <SubmitButton name="do" value="confirm" className="btn-primary shrink-0 py-2">
            Confirm all
          </SubmitButton>
        </form>
      )}

      {shown.length === 0 ? (
        <p className="card text-sm text-muted">Nothing here.</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((c) => (
            <ChargeItem key={c.id} c={c} back={back} mismatch={rsvpMismatch(c, rsvps)} />
          ))}
        </ul>
      )}
    </>
  );
}

function ChargeItem({ c, back, mismatch }: { c: LeaderCharge; back: string; mismatch: number | null }) {
  const who = chargeFor(c);
  const online = c.status === "paid" && c.paid_via === "paypal";
  const unpaid = c.status === "open" || c.status === "reported";
  const details = [
    KIND_LABEL[c.kind],
    c.season,
    c.due_on && c.status === "open" ? `due ${fmtShortDate(c.due_on)}` : null,
    c.status === "paid"
      ? `${c.paid_via ? PAID_VIA_LABEL[c.paid_via] : "Paid"}${c.paid_at ? ` ${fmtShortDate(easternDate(c.paid_at))}` : ""}`
      : c.status === "reported" && c.paid_via
        ? `says paid by ${PAID_VIA_LABEL[c.paid_via].toLowerCase()}`
        : null,
    c.remitted_on ? `sent to council ${fmtShortDate(c.remitted_on)}` : null,
  ].filter(Boolean);
  return (
    <li className="card space-y-2 py-3">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-sm font-bold text-ink">
            {ownerName(c)}
            {who ? <span className="font-semibold text-muted"> · {who}</span> : null}
          </span>
          <span className="block text-sm text-ink">{c.title}</span>
          <span className="block text-[11px] text-muted">{details.join(" · ")}</span>
          {c.report_note && <span className="block text-xs text-navy">Family: “{c.report_note}”</span>}
          {c.note && <span className="block text-xs text-muted">Note: {c.note}</span>}
          {mismatch !== null && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-lg bg-gold-50 px-2 py-0.5 text-[11px] font-semibold text-gold-800">
              <AlertTriangle className="h-3 w-3" aria-hidden /> RSVP now adds up to {fmtMoney(mismatch)}
            </span>
          )}
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-extrabold text-ink">
            {fmtMoney(c.status === "paid" ? (c.paid_amount_cents ?? c.amount_cents) : c.amount_cents)}
          </span>
          <span className={`badge normal-case tracking-normal ${STATUS_STYLE[c.status]}`}>{STATUS_SHORT[c.status]}</span>
        </span>
      </div>
      <form action={chargeAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={c.id} />
        <input type="hidden" name="back" value={back} />
        {unpaid && c.amount_cents === 0 && (
          <>
            <span className="text-xs font-semibold text-gold-800">No amount yet:</span>
            <input
              name="amount"
              inputMode="decimal"
              required
              placeholder="$"
              aria-label="Amount in dollars"
              className="w-20 rounded-lg border border-line bg-white px-2 py-1.5 text-xs"
            />
            <SubmitButton name="do" value="amount" className="btn-primary px-3 py-1.5 text-xs">
              Set amount
            </SubmitButton>
          </>
        )}
        {c.status === "reported" && c.amount_cents > 0 && (
          <SubmitButton name="do" value="confirm" className="btn-primary px-3 py-1.5 text-xs">
            Confirm paid
          </SubmitButton>
        )}
        {c.status === "open" && c.amount_cents > 0 && (
          <>
            <select name="how" className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs" defaultValue="check" aria-label="How they paid">
              <option value="check">Check</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
            <SubmitButton name="do" value="paid" className="btn-ghost px-3 py-1.5 text-xs">
              Mark paid
            </SubmitButton>
          </>
        )}
        {(c.status === "open" || c.status === "reported") && (
          <>
            <SubmitButton name="do" value="waive" className="rounded-lg px-2 py-1.5 text-xs font-bold text-navy underline">
              Waive
            </SubmitButton>
            <SubmitButton name="do" value="cancel" className="rounded-lg px-2 py-1.5 text-xs font-bold text-danger underline">
              Cancel
            </SubmitButton>
          </>
        )}
        {c.status === "reported" && (
          <SubmitButton name="do" value="reopen" className="rounded-lg px-2 py-1.5 text-xs font-bold text-navy underline">
            Not received
          </SubmitButton>
        )}
        {(c.status === "waived" || c.status === "canceled" || (c.status === "paid" && !online)) && (
          <SubmitButton name="do" value="reopen" className="rounded-lg px-2 py-1.5 text-xs font-bold text-navy underline">
            Reopen
          </SubmitButton>
        )}
        {c.status === "waived" && (
          <SubmitButton name="do" value="cancel" className="rounded-lg px-2 py-1.5 text-xs font-bold text-danger underline">
            Cancel
          </SubmitButton>
        )}
        {online && (
          <span className="text-[11px] text-muted">
            Paid online{c.paypal_capture_id ? ` (PayPal ${c.paypal_capture_id})` : ""}. Refunds happen in PayPal.
          </span>
        )}
      </form>
      {unpaid && c.amount_cents > 0 && (
        <details>
          <summary className="cursor-pointer text-[11px] font-bold text-pine">Change amount</summary>
          <form action={chargeAction} className="mt-1 flex items-center gap-2">
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="back" value={back} />
            <input
              name="amount"
              inputMode="decimal"
              required
              defaultValue={centsToInput(c.amount_cents)}
              aria-label="New amount in dollars"
              className="w-24 rounded-lg border border-line bg-white px-2 py-1.5 text-xs"
            />
            <SubmitButton name="do" value="amount" className="btn-ghost px-3 py-1.5 text-xs">
              Save amount
            </SubmitButton>
          </form>
        </details>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Registration: national and council fees per person, and what's been sent to the council
// ---------------------------------------------------------------------------
async function RegistrationTab({
  all,
  settings,
  year: yearParam,
}: {
  all: LeaderCharge[];
  settings: Awaited<ReturnType<typeof getSettings>>;
  year: string;
}) {
  const year = /^\d{4}$/.test(yearParam) ? yearParam : settings.registration_year || String(new Date().getFullYear() + 1);
  const supabase = await createClient();
  const [{ data: scouts }, { data: adults }, { data: denLeaders }] = await Promise.all([
    supabase.from("scouts").select("id, first_name, last_name, den:dens(name, rank, number)").eq("is_active", true),
    supabase.from("adults").select("id, first_name, preferred_name, last_name, role, position_title").eq("is_active", true),
    supabase.from("den_leaders").select("adult_id"),
  ]);
  const leads = new Set((denLeaders ?? []).map((d) => d.adult_id as string));
  const reg = all.filter((c) => (c.kind === "national" || c.kind === "council") && c.season === year && c.status !== "canceled");
  type Person = { key: string; name: string; group: string; order: number };
  const people = new Map<string, Person>();
  const RANKS = ["lion", "tiger", "wolf", "bear", "webelos", "aol"];
  for (const s of (scouts ?? []) as unknown as { id: string; first_name: string; last_name: string; den: { name: string; rank: string; number: number } | null }[]) {
    people.set(`s:${s.id}`, {
      key: `s:${s.id}`,
      name: `${s.first_name} ${s.last_name}`,
      group: s.den?.name ?? "Scouts, no den",
      order: (s.den ? RANKS.indexOf(s.den.rank) : 9) * 100 + (s.den?.number ?? 0),
    });
  }
  for (const a of (adults ?? []) as { id: string; first_name: string; preferred_name: string | null; last_name: string; role: string; position_title: string | null }[]) {
    if (a.role === "parent" && !a.position_title && !leads.has(a.id)) continue;
    people.set(`a:${a.id}`, { key: `a:${a.id}`, name: `${a.preferred_name || a.first_name} ${a.last_name}`, group: "Adult leaders", order: 2000 });
  }
  for (const c of reg) {
    const key = c.scout_id ? `s:${c.scout_id}` : `a:${c.adult_id}`;
    if (!people.has(key)) {
      const name = c.scout ? `${c.scout.first_name} ${c.scout.last_name ?? ""}` : c.adult ? `${c.adult.preferred_name || c.adult.first_name} ${c.adult.last_name ?? ""}` : "Unknown";
      people.set(key, { key, name: name.trim(), group: "No longer active", order: 3000 });
    }
  }
  const list = [...people.values()].sort((a, b) => a.order - b.order || a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  const groups = [...new Set(list.map((p) => p.group))];
  const chargeOf = (key: string, kind: "national" | "council") =>
    reg.find((c) => c.kind === kind && (key.startsWith("s:") ? c.scout_id === key.slice(2) : !c.scout_id && c.adult_id === key.slice(2)));
  const paidNotSent = reg.filter((c) => c.status === "paid" && !c.remitted_on);
  const natPaid = reg.filter((c) => c.kind === "national" && c.status === "paid").length;
  const natAll = reg.filter((c) => c.kind === "national").length;

  return (
    <>
      <Form action="/leaders/money" className="flex items-end gap-2">
        <input type="hidden" name="tab" value="registration" />
        <label className="block flex-1 space-y-1">
          <span className="text-xs font-bold text-navy">Registration year</span>
          <input className="input py-2" name="year" defaultValue={year} inputMode="numeric" maxLength={4} />
        </label>
        <button className="btn-ghost py-2">Show</button>
      </Form>
      <p className="px-1 text-sm text-muted">
        {natPaid} of {natAll} national registrations paid. {fmtMoney(paidNotSent.reduce((s, c) => s + (c.paid_amount_cents ?? c.amount_cents), 0))}{" "}
        collected and not yet sent to the council.
      </p>
      {list.length === 0 ? (
        <p className="card text-sm text-muted">No one to show.</p>
      ) : (
        <ActionForm action={setRemitted} submit="Save for checked people" busy="Saving…" className="space-y-3">
          {groups.map((g) => (
            <section key={g} className="card space-y-1">
              <h2 className="section-title">{g}</h2>
              <ul className="divide-y divide-line">
                {list
                  .filter((p) => p.group === g)
                  .map((p) => {
                    const nat = chargeOf(p.key, "national");
                    const cou = chargeOf(p.key, "council");
                    const ids = [nat?.id, cou?.id].filter(Boolean).join(",");
                    const sent = [nat?.remitted_on, cou?.remitted_on].filter(Boolean) as string[];
                    return (
                      <li key={p.key}>
                        <label className="flex items-center gap-3 py-2">
                          <input type="checkbox" name="id" value={ids} disabled={!ids} className="h-5 w-5 shrink-0 accent-pine" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-ink">{p.name}</span>
                            <span className="block text-[11px] text-muted">
                              {sent.length ? `Sent to council ${fmtShortDate(sent.sort()[sent.length - 1])}` : ids ? "Not sent to council yet" : "No fees added"}
                            </span>
                          </span>
                          <RegBadge label="National" c={nat} />
                          <RegBadge label="Council" c={cou} />
                        </label>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
          <label className="card block space-y-1">
            <span className="text-xs font-bold text-navy">Date sent to the council</span>
            <input type="date" name="remitted_on" className="input" defaultValue={todayEastern()} />
          </label>
          <label className="flex items-center gap-2 px-1 text-xs text-muted">
            <input type="checkbox" name="intent" value="clear" className="h-4 w-4 accent-danger" /> Instead, clear &quot;sent to council&quot; for
            the checked people
          </label>
        </ActionForm>
      )}
    </>
  );
}

function RegBadge({ label, c }: { label: string; c: LeaderCharge | undefined }) {
  const style = c ? STATUS_STYLE[c.status] : "bg-surface text-muted";
  const text = !c ? "None" : c.status === "paid" ? "Paid" : c.status === "reported" ? "Says paid" : c.status === "waived" ? "Waived" : "Due";
  return (
    <span className="w-16 shrink-0 text-center">
      <span className="block text-[9px] font-bold uppercase tracking-wider text-muted">{label}</span>
      <span className={`badge normal-case tracking-normal ${style}`}>{text}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Add a fee
// ---------------------------------------------------------------------------
async function AddTab({ settings }: { settings: Awaited<ReturnType<typeof getSettings>> }) {
  const supabase = await createClient();
  const since = daysAgoIso(120);
  const [dens, { data: families }, { data: scouts }, { data: adults }, { data: events }] = await Promise.all([
    getDens(false),
    supabase.from("families").select("id, family_name").eq("is_active", true).order("family_name"),
    supabase.from("scouts").select("id, first_name, last_name").eq("is_active", true).order("last_name").order("first_name"),
    supabase.from("adults").select("id, first_name, preferred_name, last_name").eq("is_active", true).order("last_name").order("first_name"),
    supabase.from("events").select("id, title, starts_at").is("archived_at", null).gte("starts_at", since).order("starts_at").limit(150),
  ]);
  const year = settings.registration_year;
  const amounts = {
    national_youth: settingCents(settings, "national_youth_cents"),
    national_adult: settingCents(settings, "national_adult_cents"),
    council_youth: settingCents(settings, "council_youth_cents"),
    council_adult: settingCents(settings, "council_adult_cents"),
  };
  return (
    <>
      <section className="card space-y-2 border-l-4 border-l-gold">
        <h2 className="section-title">Registration shortcut</h2>
        {year ? (
          <>
            <p className="text-sm text-ink">
              Adds Scouting America registration ({fmtMoney(amounts.national_youth)} per scout, {fmtMoney(amounts.national_adult)} per
              leader) and the council fee ({fmtMoney(amounts.council_youth)} per scout, {fmtMoney(amounts.council_adult)} per leader) for
              every active scout and adult leader. Anyone who already has them is skipped, so it&apos;s safe to run again after new
              families join.
            </p>
            <ActionForm action={addRegistrationFees} submit={`Set up registration fees for ${year}`} busy="Adding…" className="space-y-2">
              <Field label="Due (optional)">
                <input type="date" name="due_on" className="input" />
              </Field>
            </ActionForm>
          </>
        ) : (
          <p className="text-sm text-muted">
            Set the registration year and amounts in{" "}
            <Link href="/leaders/money?tab=settings" className="font-semibold text-pine underline">
              Settings
            </Link>{" "}
            first.
          </p>
        )}
      </section>
      <section className="card space-y-2">
        <h2 className="section-title">Add a fee</h2>
        <AddFeeForm
          defaults={{
            dues_season: settings.dues_season,
            registration_year: year,
            dues: settingCents(settings, "dues_amount_cents"),
            ...amounts,
          }}
          dens={dens.map((d) => ({ id: d.id, name: d.name }))}
          families={(families ?? []).map((f) => ({ id: f.id as string, name: f.family_name as string }))}
          people={[
            ...(scouts ?? []).map((s) => ({ value: `s:${s.id}`, label: `${s.first_name} ${s.last_name} (scout)` })),
            ...(adults ?? []).map((a) => ({ value: `a:${a.id}`, label: `${a.preferred_name || a.first_name} ${a.last_name} (adult)` })),
          ]}
          events={(events ?? []).map((e) => ({ id: e.id as string, label: `${e.title} · ${fmtShortDate(easternDate(e.starts_at as string))}` }))}
        />
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function SettingsTab({ settings }: { settings: Awaited<ReturnType<typeof getSettings>> }) {
  const dollars = (k: Parameters<typeof settingCents>[1]) => centsToInput(settingCents(settings, k) || null);
  return (
    <section className="card space-y-3">
      <h2 className="section-title">Amounts and how to pay</h2>
      <ActionForm action={savePaySettings}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Dues season" hint="Like 2026-27">
            <input className="input" name="dues_season" defaultValue={settings.dues_season} required />
          </Field>
          <Field label="Pack dues ($)" hint="Per family">
            <input className="input" name="dues_amount_cents" inputMode="decimal" defaultValue={dollars("dues_amount_cents")} placeholder="0" />
          </Field>
        </div>
        <Field label="Registration year" hint="The year Scouting America and council fees are for, like 2027.">
          <input className="input" name="registration_year" inputMode="numeric" maxLength={4} defaultValue={settings.registration_year} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="National, per scout ($)">
            <input className="input" name="national_youth_cents" inputMode="decimal" defaultValue={dollars("national_youth_cents")} placeholder="0" />
          </Field>
          <Field label="National, per adult ($)">
            <input className="input" name="national_adult_cents" inputMode="decimal" defaultValue={dollars("national_adult_cents")} placeholder="0" />
          </Field>
          <Field label="Council, per scout ($)">
            <input className="input" name="council_youth_cents" inputMode="decimal" defaultValue={dollars("council_youth_cents")} placeholder="0" />
          </Field>
          <Field label="Council, per adult ($)">
            <input className="input" name="council_adult_cents" inputMode="decimal" defaultValue={dollars("council_adult_cents")} placeholder="0" />
          </Field>
        </div>
        <p className="text-[11px] text-muted">These fill in the amount when you add a fee. Changing them doesn&apos;t change fees already added.</p>
        <Field label="Other ways to pay" hint="Shown to families on the Pay page, e.g. who checks are payable to and who takes cash.">
          <textarea className="input min-h-20" name="pay_other_how" maxLength={600} defaultValue={settings.pay_other_how} />
        </Field>
      </ActionForm>
    </section>
  );
}
