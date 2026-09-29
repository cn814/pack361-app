import type { Metadata } from "next";
import { LogOut, ShieldCheck } from "lucide-react";
import ContactForm from "@/components/ContactForm";
import { dueWithin } from "@/lib/format";
import { displayName, getFamilyAdults, getMyScouts, requireMember } from "@/lib/data";

export const metadata: Metadata = { title: "My family" };

export default async function FamilyPage() {
  const me = await requireMember();
  const [scouts, adults] = await Promise.all([getMyScouts(), getFamilyAdults()]);
  const yptSoon = dueWithin(me.ypt_expires_on, 60) ? me.ypt_expires_on : null;

  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">My family</h1>

      {yptSoon && (
        <p className="flex items-start gap-2 rounded-2xl border border-gold-100 bg-gold-50 p-3 text-sm text-gold-800">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Your Safeguarding Youth training expires {new Date(yptSoon + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.
          Renew it at my.scouting.org.
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

      <section className="card space-y-3">
        <h2 className="section-title">My contact info</h2>
        <ContactForm phone={me.phone} preferred={me.preferred_name} />
      </section>

      <form action="/auth/signout" method="post">
        <button className="btn-ghost w-full">
          <LogOut className="h-4 w-4" aria-hidden /> Sign out
        </button>
      </form>
    </>
  );
}
