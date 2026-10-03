import type { Metadata } from "next";
import BackLink from "@/components/BackLink";
import PhotoPermission from "@/components/PhotoPermission";
import RegistrationLine from "@/components/RegistrationLine";
import { displayName, getFamilyAdults, getMyScouts, requireMember } from "@/lib/data";

export const metadata: Metadata = { title: "Family and registration" };

export default async function HouseholdPage() {
  const me = await requireMember();
  const [scouts, adults] = await Promise.all([getMyScouts(), getFamilyAdults()]);
  return (
    <>
      <BackLink href="/family" label="Me" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Family and registration</h1>

      <section className="card space-y-2">
        <h2 className="section-title">Scouts</h2>
        {scouts.length === 0 && <p className="text-sm text-muted">No scouts are linked to your account.</p>}
        <ul className="divide-y divide-line">
          {scouts.map((s) => (
            <li key={s.id} className="py-2">
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink">
                  {s.first_name} {s.last_name}
                </span>
                <span className="badge bg-mint text-pine">{s.den?.name ?? "No den"}</span>
              </span>
              <RegistrationLine expires={s.registration_expires_on ?? null} />
            </li>
          ))}
        </ul>
        {me.registration_expires_on && (
          <div className="border-t border-line pt-2">
            <span className="text-sm font-semibold text-ink">Your registration</span>
            <RegistrationLine expires={me.registration_expires_on} />
          </div>
        )}
      </section>

      <section className="card space-y-2">
        <h2 className="section-title">Adults on this account</h2>
        <ul className="divide-y divide-line text-sm">
          {adults.map((a) => (
            <li key={a.id} className="py-2">
              <span className="font-semibold text-ink">
                {displayName(a)} {a.last_name}
              </span>
              <span className="block text-xs text-muted">
                {a.email}
                {a.phone ? ` · ${a.phone}` : ""}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted">
          Wrong scout, den or email? Email{" "}
          <a className="font-bold text-pine underline" href="mailto:info@pack361.org">
            info@pack361.org
          </a>
          .
        </p>
      </section>

      {scouts.length > 0 && (
        <section id="photos" className="card scroll-mt-20 space-y-3">
          <h2 className="section-title">Photos</h2>
          <p className="text-sm text-muted">
            Scouts can be in the pack&apos;s private photo album unless their family opts out. Photos are visible only to signed-in
            pack families. Opt out any time, and leaders won&apos;t approve photos showing your scout.
          </p>
          <PhotoPermission scouts={scouts} />
        </section>
      )}
    </>
  );
}
