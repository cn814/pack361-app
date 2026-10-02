import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LogOut, ShieldCheck } from "lucide-react";
import { APP_CHANNEL, APP_VERSION } from "@/lib/version";
import { getMyPaperwork, formState, needsForm } from "@/lib/paperwork";
import { getMyCharges, totalDue } from "@/lib/payments";
import { fmtMoney } from "@/lib/money";
import { displayName, getMyScouts, isLeader, needsTwoStep, requireMember } from "@/lib/data";
import { getMyPositions, getMyTraining } from "@/lib/training-data";
import { COURSE_BY_KEY, positionLabels, trainedStatus, trainingState } from "@/lib/training";
import { fmtRegDate, needsRenewal, regStatus } from "@/lib/registration";
import { ROLE_LABEL } from "@/lib/roster-data";
import { viewableRoles } from "@/lib/view-as";

export const metadata: Metadata = { title: "Me" };

interface Row {
  href: string;
  label: string;
  note?: string;
  alert?: boolean;
  ok?: boolean;
}

/** Me: short groups that open one focused page each (what used to be one long My family page). */
export default async function MePage() {
  const me = await requireMember();
  const [scouts, training, paperwork, charges, mine] = await Promise.all([
    getMyScouts(),
    getMyTraining(me.id),
    getMyPaperwork(me),
    getMyCharges(me),
    getMyPositions(me),
  ]);
  const role = me.real_role ?? me.role;
  const leaderish = isLeader(me) || Boolean(me.position_title) || mine.positions.length > 0;
  const status = trainedStatus(mine.positions, training);
  const ypt = trainingState(training.find((t) => t.course === "ypt"));

  const renew = [...scouts.map((s) => s.registration_expires_on ?? null), me.registration_expires_on ?? null].filter(
    (d): d is string => Boolean(d) && needsRenewal(regStatus(d)),
  );
  const due = totalDue(charges);
  const formsNeeded = paperwork.people.filter((p) => needsForm(formState(p.form))).length;

  const family: Row[] = [
    {
      href: "/family/household",
      label: "Family and registration",
      note: renew.length ? `Renew by ${fmtRegDate(renew.sort()[0])}` : `${scouts.length} scout${scouts.length === 1 ? "" : "s"}`,
      alert: renew.length > 0,
    },
    { href: "/pay", label: "Payments", note: due > 0 ? `${fmtMoney(due)} due` : "All paid", alert: due > 0, ok: due === 0 },
    {
      href: "/family/forms",
      label: "Medical forms",
      note: formsNeeded ? `${formsNeeded} need${formsNeeded === 1 ? "s" : ""} a form` : "All current",
      alert: formsNeeded > 0,
      ok: formsNeeded === 0,
    },
    { href: "/family/files", label: "Saved on this phone" },
  ];
  const leaderRows: Row[] = [
    ...(leaderish
      ? [
          {
            href: "/family/training",
            label: "My training",
            note: ypt !== "current" ? "Safeguarding Youth due" : status.trained ? "Trained" : `${status.missing.length} missing`,
            alert: ypt !== "current" || !status.trained,
            ok: ypt === "current" && status.trained,
          },
        ]
      : []),
    ...(needsTwoStep(role) ? [{ href: "/family/security", label: "Two-step sign-in", note: "On", ok: true }] : []),
    ...(viewableRoles(role).length ? [{ href: "/family/view-as", label: "See the app as…", note: me.real_role ? "Viewing" : undefined }] : []),
  ];
  const settings: Row[] = [
    { href: "/family/alerts", label: "Phone alerts and the app" },
    { href: "/family/contact", label: "My contact info" },
    { href: "/family/help", label: "Report a problem or send a note" },
  ];

  return (
    <>
      <div className="flex items-center gap-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gold text-lg font-extrabold text-pine-950">
          {(displayName(me)[0] + me.last_name[0]).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold tracking-tight text-pine-950">
            {displayName(me)} {me.last_name}
          </h1>
          <p className="truncate text-sm text-muted">
            {ROLE_LABEL[role]}
            {me.position_title ? ` · ${me.position_title.split(",")[0]}` : ""}
          </p>
        </div>
      </div>

      {leaderish && (ypt !== "current" || !status.trained) && (
        <Link href="/family/training" className="flex items-start gap-2 rounded-2xl border border-gold-100 bg-gold-50 p-3 text-sm text-gold-800">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {ypt !== "current"
              ? `Safeguarding Youth training: ${ypt === "missing" ? "no date recorded yet" : ypt === "expired" ? "expired" : "expires soon"}.`
              : `Training still needed: ${status.missing.map((c) => (c === "position" ? `${positionLabels(status.positions)} position training` : COURSE_BY_KEY[c].label)).join(", ")}.`}{" "}
            <b className="underline">See My training</b>
          </span>
        </Link>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Group title="My family" rows={family} />
        {leaderRows.length > 0 && <Group title="As a leader" rows={leaderRows} />}
        <Group title="Settings and help" rows={settings} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <form action="/auth/signout" method="post">
          <button className="btn-ghost px-4 py-2.5">
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </button>
        </form>
        <span className="text-[11px] text-muted">
          Version {APP_VERSION}
          {APP_CHANNEL === "beta" ? " beta" : ""}
        </span>
      </div>
    </>
  );
}

function Group({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="space-y-2">
      <h2 className="px-0.5 text-xs font-extrabold uppercase tracking-[0.1em] text-muted">{title}</h2>
      <ul className="card divide-y divide-line p-0">
        {rows.map((r) => (
          <li key={r.href}>
            <Link href={r.href} className="flex min-h-[3.25rem] items-center gap-3 px-4 py-2.5">
              <span className="flex-1 text-[15px] font-bold text-ink">{r.label}</span>
              {r.note && (
                <span className={`text-xs ${r.alert ? "font-extrabold text-gold-800" : r.ok ? "font-bold text-pine" : "text-muted"}`}>{r.note}</span>
              )}
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
