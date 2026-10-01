import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ExternalLink, LogOut, ShieldCheck, Smartphone } from "lucide-react";
import ContactForm from "@/components/ContactForm";
import FeedbackForm from "@/components/FeedbackForm";
import PhotoPermission from "@/components/PhotoPermission";
import PushToggle from "@/components/PushToggle";
import InstallHelp from "@/components/InstallHelp";
import PaperworkCard from "@/components/PaperworkCard";
import PaymentsCard from "@/components/PaymentsCard";
import { getMyPaperwork } from "@/lib/paperwork";
import { getDuesPayUrl, getMyCharges } from "@/lib/payments";
import TrainingEditor, { stateText } from "@/components/TrainingEditor";
import TrainingStatus, { MyScoutingLink } from "@/components/TrainingStatus";
import ActionForm, { Field } from "@/components/ActionForm";
import { saveMyMemberId } from "@/app/(app)/leaders/training/actions";
import { displayName, getFamilyAdults, getMyScouts, isLeader, requireMember } from "@/lib/data";
import { getMyPositions, getMyTraining } from "@/lib/training-data";
import { COURSE_BY_KEY, POSITION_BY_KEY, trainedStatus, trainingState } from "@/lib/training";
import { fmtRegDate, needsRenewal, regStatus, RENEW_URL, REG_STYLE } from "@/lib/registration";

export const metadata: Metadata = { title: "My family" };

export default async function FamilyPage() {
  const me = await requireMember();
  const [scouts, adults, training, paperwork, charges, mine, duesUrl] = await Promise.all([
    getMyScouts(),
    getFamilyAdults(),
    getMyTraining(me.id),
    getMyPaperwork(me),
    getMyCharges(me),
    getMyPositions(me),
    getDuesPayUrl(),
  ]);
  const leader = isLeader(me) || Boolean(me.position_title) || mine.positions.length > 0;
  const status = trainedStatus(mine.positions, training);
  const focus = [...new Set([...status.required, ...mine.positions.flatMap((p) => POSITION_BY_KEY[p].recommended)])];
  const ypt = training.find((t) => t.course === "ypt");
  const yptState = trainingState(ypt);
  const yptWarn = leader && yptState !== "current";

  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">My family</h1>

      {yptWarn && (
        <p className="flex items-start gap-2 rounded-2xl border border-gold-100 bg-gold-50 p-3 text-sm text-gold-800">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Safeguarding Youth training: {yptState === "missing" ? "no date recorded yet" : stateText(ypt).toLowerCase()}. Take or
            renew it at my.scouting.org, then add the date under My training below. <MyScoutingLink />
          </span>
        </p>
      )}
      {leader && !yptWarn && !status.trained && (
        <p className="flex items-start gap-2 rounded-2xl border border-gold-100 bg-gold-50 p-3 text-sm text-gold-800">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Training still needed for your position: {status.missing.map((c) => COURSE_BY_KEY[c].label).join(", ")}.{" "}
            <a href="#training" className="font-bold underline">
              See My training
            </a>
          </span>
        </p>
      )}

      <section className="card space-y-2">
        <h2 className="section-title">Scouts</h2>
        {scouts.length === 0 && <p className="text-sm text-muted">No scouts are linked to your account.</p>}
        <ul className="divide-y divide-line">
          {scouts.map((s) => (
            <li key={s.id} className="py-2">
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink">{s.first_name} {s.last_name}</span>
                <span className="badge bg-mint text-pine">{s.den?.name ?? "No den"}</span>
              </span>
              <Registration expires={s.registration_expires_on ?? null} />
            </li>
          ))}
        </ul>
        {me.registration_expires_on && (
          <div className="border-t border-line pt-2">
            <span className="text-sm font-semibold text-ink">Your registration</span>
            <Registration expires={me.registration_expires_on} />
          </div>
        )}
      </section>

      <PaymentsCard charges={charges} duesUrl={duesUrl} />

      <PaperworkCard people={paperwork.people} ownerUserKey={me.id} />
      <Link href="/family/files" className="card flex items-center gap-3">
        <Smartphone className="h-5 w-5 shrink-0 text-pine" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-ink">Saved on this phone</span>
          <span className="block text-xs text-muted">Your own copies of medical forms and insurance cards, kept only on this device.</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      </Link>

      <section className="card space-y-2">
        <h2 className="section-title">Adults on this account</h2>
        <ul className="divide-y divide-line text-sm">
          {adults.map((a) => (
            <li key={a.id} className="py-2">
              <span className="font-semibold text-ink">{displayName(a)} {a.last_name}</span>
              <span className="block text-xs text-muted">{a.email}{a.phone ? ` · ${a.phone}` : ""}</span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted">
          Wrong scout, den or email? Email <a className="font-bold text-pine underline" href="mailto:info@pack361.org">info@pack361.org</a>.
        </p>
      </section>

      {scouts.length > 0 && (
        <section id="photos" className="card scroll-mt-20 space-y-3">
          <h2 className="section-title">Pack photo album</h2>
          <p className="text-sm text-muted">
            Leaders only approve photos showing scouts whose families said yes. Photos are visible only to signed-in pack
            families, and you can change your answer any time.
          </p>
          <PhotoPermission scouts={scouts} />
        </section>
      )}

      {leader && (
        <section id="training" className="card scroll-mt-20 space-y-2">
          <h2 className="section-title">My training</h2>
          <TrainingStatus status={status} />
          <TrainingEditor adultId={me.id} rows={training} focus={focus} />
        </section>
      )}

      <section className="card space-y-2">
        <h2 className="section-title">BSA member ID</h2>
        <p className="text-sm text-muted">
          Your Scouting America member ID links you to your my.scouting.org training records, so a leader can import your
          training dates. It&apos;s on your membership card and at my.scouting.org under My Profile.
        </p>
        <ActionForm action={saveMyMemberId} buttonClass="btn-ghost w-full py-2">
          <Field label="Member ID" hint="Digits only. Leave blank to remove it.">
            <input
              className="input"
              name="member_id"
              inputMode="numeric"
              pattern="[0-9]{1,12}"
              maxLength={12}
              autoComplete="off"
              defaultValue={mine.memberId ?? ""}
            />
          </Field>
        </ActionForm>
      </section>

      <section className="card space-y-3">
        <h2 className="section-title">Notifications</h2>
        <p className="text-sm text-muted">
          Get phone alerts for pack announcements, reminders for jobs you volunteer for, and (for leaders) training renewals.
        </p>
        <PushToggle />
      </section>
      <InstallHelp compact />

      <section className="card space-y-3">
        <h2 className="section-title">My contact info</h2>
        <ContactForm phone={me.phone} preferred={me.preferred_name} />
      </section>

      <FeedbackForm page="My family" />

      <form action="/auth/signout" method="post">
        <button className="btn-ghost w-full">
          <LogOut className="h-4 w-4" aria-hidden /> Sign out
        </button>
      </form>
    </>
  );
}

/** "Scouting America registration: expires 10/31/26", with a renew link when it's due. */
function Registration({ expires }: { expires: string | null }) {
  const st = regStatus(expires);
  if (st.state === "unknown") return null;
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      <span>
        Scouting America registration {st.state === "expired" ? "expired" : "expires"} {fmtRegDate(expires!)}
      </span>
      {st.state !== "current" && <span className={`badge normal-case tracking-normal ${REG_STYLE[st.state]}`}>{st.label}</span>}
      {needsRenewal(st) && (
        <a href={RENEW_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-pine underline">
          Renew at my.scouting.org <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      )}
    </span>
  );
}
