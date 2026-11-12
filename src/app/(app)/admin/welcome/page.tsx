import type { Metadata } from "next";
import { BellRing, CircleCheck, Clock, Mail, TriangleAlert, UserRoundPlus } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import BackLink from "@/components/BackLink";
import Link from "next/link";
import { getAllAdults, getSignIns, requireAdmin, welcomeBudget } from "@/lib/roster-data";
import { getAdultsWithAlerts, getNewFamilies, type NewFamilyRow } from "@/lib/onboarding";
import { emailConfigured } from "@/lib/email";
import { fmtDay } from "@/lib/format";
import { sendWelcomeEmails } from "../actions";

export const metadata: Metadata = { title: "Welcome emails" };

export default async function WelcomePage() {
  await requireAdmin();
  const [adults, signIns, budget, alerts, newFamilies] = await Promise.all([
    getAllAdults(),
    getSignIns(),
    welcomeBudget(),
    getAdultsWithAlerts(),
    getNewFamilies(),
  ]);
  const active = adults.filter((a) => a.is_active);
  const signedIn = active.filter((a) => signIns.get(a.id));
  const welcomed = active.filter((a) => !signIns.get(a.id) && a.welcomed_at);
  const waiting = active.filter((a) => !signIns.get(a.id) && !a.welcomed_at);
  const configured = emailConfigured();
  const nextBatch = Math.min(waiting.length, budget.left, 100);
  const alertsOn = signedIn.filter((a) => alerts.has(a.id)).length;
  // New families (last 90 days) with two or more steps the app can see still to do.
  const stuck = newFamilies.filter((f) => f.missing.length >= 2);

  return (
    <>
      <BackLink href="/admin/people" label="Families and dens" />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Welcome emails</h1>
        <p className="text-sm text-muted">
          Each adult on the roster gets one email saying the app is ready and how to sign in with a one-time code. No
          passwords, and the email doesn&apos;t sign them in by itself.
        </p>
        <p className="mt-1 text-sm text-muted">
          At pack meetings, put out the{" "}
          <Link href="/get/qr" className="font-semibold text-pine underline">
            &ldquo;Get the pack app&rdquo; QR sign
          </Link>
          : families scan it to add the app to their phone and sign in.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="card px-2 py-3">
          <p className="text-2xl font-extrabold text-pine">{signedIn.length}</p>
          <p className="text-[11px] text-muted">signed in</p>
        </div>
        <div className="card px-2 py-3">
          <p className="text-2xl font-extrabold text-gold-800">{welcomed.length}</p>
          <p className="text-[11px] text-muted">emailed, not yet in</p>
        </div>
        <div className="card px-2 py-3">
          <p className="text-2xl font-extrabold text-navy">{waiting.length}</p>
          <p className="text-[11px] text-muted">not emailed</p>
        </div>
      </div>
      <p className="-mt-2 flex items-center gap-1.5 px-1 text-xs text-muted">
        <BellRing className="h-3.5 w-3.5 text-pine" aria-hidden />
        {alertsOn} of {signedIn.length} signed-in {signedIn.length === 1 ? "adult has" : "adults have"} phone alerts on.
      </p>

      {newFamilies.length > 0 && <NewFamilies all={newFamilies.length} stuck={stuck} />}

      {!configured ? (
        <p className="flex items-start gap-2 rounded-2xl border border-gold-100 bg-gold-50 p-3 text-sm text-gold-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Email isn&apos;t switched on yet. Create an API key in Resend (Sending access, pack361.org) and add it in Vercel as
          RESEND_API_KEY, then redeploy.
        </p>
      ) : (
        <section className="card space-y-2">
          <p className="text-sm text-ink">
            {budget.sentToday} of {budget.limit} emails used today. The free email plan allows 100 a day, and sign-in codes count
            too, so large rosters go out over two days.
          </p>
          {nextBatch > 0 ? (
            <ActionForm
              action={sendWelcomeEmails}
              submit={
                <>
                  <Mail className="h-4 w-4" aria-hidden /> Send {nextBatch} welcome email{nextBatch === 1 ? "" : "s"}
                </>
              }
              busy="Sending…"
              confirm={`Send the welcome email to ${nextBatch} ${nextBatch === 1 ? "person" : "people"}?`}
            />
          ) : (
            <p className="text-sm font-semibold text-pine">
              {waiting.length ? "Today's limit is used up. Send the rest tomorrow." : "Everyone on the roster has been emailed."}
            </p>
          )}
        </section>
      )}

      <PeopleList title="Not emailed yet" icon={Mail} people={waiting} canSend={configured} alerts={alerts} />
      <PeopleList title="Emailed, hasn't signed in" icon={Clock} people={welcomed} canSend={configured} alerts={alerts} showWelcomed />
      <details className="card">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-bold text-pine">
          <CircleCheck className="h-4 w-4" aria-hidden /> Signed in ({signedIn.length})
        </summary>
        <ul className="divide-y divide-line pt-2 text-sm">
          {signedIn.map((a) => (
            <li key={a.id} className="flex justify-between gap-2 py-1.5">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">
                  {a.first_name} {a.last_name}
                </span>
                {alerts.has(a.id) && <AlertsOn />}
              </span>
              <span className="shrink-0 text-xs text-muted">{fmtDay(signIns.get(a.id)!)}</span>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

function PeopleList({
  title,
  icon: Icon,
  people,
  canSend,
  alerts,
  showWelcomed,
}: {
  title: string;
  icon: typeof Mail;
  people: Awaited<ReturnType<typeof getAllAdults>>;
  canSend: boolean;
  alerts: Set<string>;
  showWelcomed?: boolean;
}) {
  if (!people.length) return null;
  return (
    <section className="card space-y-1">
      <h2 className="section-title flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" aria-hidden /> {title} ({people.length})
      </h2>
      <ul className="divide-y divide-line">
        {people.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2 py-2">
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-ink">
                  {a.first_name} {a.last_name}
                </span>
                {alerts.has(a.id) && <AlertsOn />}
              </span>
              <span className="block truncate text-xs text-muted">
                {a.email}
                {showWelcomed && a.welcomed_at ? ` · emailed ${fmtDay(a.welcomed_at)}` : ""}
              </span>
            </span>
            {canSend && (
              <ActionForm action={sendWelcomeEmails} submit={showWelcomed ? "Resend" : "Send"} busy="…" className="shrink-0" buttonClass="btn-ghost px-3 py-1.5 text-xs">
                <input type="hidden" name="adult_id" value={a.id} />
              </ActionForm>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Phone alerts are on for this adult (a phone or browser is saved). */
function AlertsOn() {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-pine" title="Phone alerts on">
      <BellRing className="h-3 w-3" aria-hidden />
      <span>alerts on</span>
    </span>
  );
}

/** New families (last 90 days) stuck on two or more steps of their Getting started list. */
function NewFamilies({ all, stuck }: { all: number; stuck: NewFamilyRow[] }) {
  return (
    <section className="card space-y-2">
      <h2 className="section-title flex items-center gap-1.5">
        <UserRoundPlus className="h-3.5 w-3.5" aria-hidden /> New families who could use a hand ({stuck.length})
      </h2>
      <p className="text-xs text-muted">
        {stuck.length
          ? `Of ${all} ${all === 1 ? "family" : "families"} who joined in the last 90 days, these still have two or more getting-started steps to do. A friendly call or a word at the next meeting helps.`
          : `All ${all} new ${all === 1 ? "family is" : "families are"} on track: at most one getting-started step left.`}
      </p>
      {stuck.length > 0 && (
        <ul className="divide-y divide-line">
          {stuck.map((f) => (
            <li key={f.family_id}>
              <Link href={`/admin/families/${f.family_id}`} className="block min-h-11 py-2">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-ink">{f.family_name}</span>
                  <span className="shrink-0 text-[11px] text-muted">joined {fmtDay(f.joined_at)}</span>
                </span>
                {f.adults && <span className="block truncate text-xs text-muted">{f.adults}</span>}
                <span className="block text-xs text-gold-800">
                  To do: {f.missing.join(", ")}
                  {f.signed_in ? "" : " · hasn't signed in yet"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
