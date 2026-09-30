import type { Metadata } from "next";
import { LogOut, ShieldCheck } from "lucide-react";
import ContactForm from "@/components/ContactForm";
import FeedbackForm from "@/components/FeedbackForm";
import PhotoPermission from "@/components/PhotoPermission";
import PushToggle from "@/components/PushToggle";
import TrainingEditor, { stateText } from "@/components/TrainingEditor";
import { displayName, getFamilyAdults, getMyScouts, isLeader, requireMember } from "@/lib/data";
import { getMyTraining } from "@/lib/training-data";
import { trainingState } from "@/lib/training";

export const metadata: Metadata = { title: "My family" };

export default async function FamilyPage() {
  const me = await requireMember();
  const [scouts, adults, training] = await Promise.all([getMyScouts(), getFamilyAdults(), getMyTraining(me.id)]);
  const leader = isLeader(me) || Boolean(me.position_title);
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
            renew it at my.scouting.org, then add the date under My training below.
          </span>
        </p>
      )}

      <section className="card space-y-2">
        <h2 className="section-title">Scouts</h2>
        {scouts.length === 0 && <p className="text-sm text-muted">No scouts are linked to your account.</p>}
        <ul className="divide-y divide-line">
          {scouts.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2">
              <span className="font-semibold text-ink">{s.first_name} {s.last_name}</span>
              <span className="badge bg-mint text-pine">{s.den?.name ?? "No den"}</span>
            </li>
          ))}
        </ul>
      </section>

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
        <section className="card space-y-1">
          <h2 className="section-title">My training</h2>
          <TrainingEditor adultId={me.id} rows={training} />
        </section>
      )}

      <section className="card space-y-3">
        <h2 className="section-title">Notifications</h2>
        <p className="text-sm text-muted">
          Get phone alerts for pack announcements, reminders for jobs you volunteer for, and (for leaders) training renewals.
        </p>
        <PushToggle />
      </section>

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
