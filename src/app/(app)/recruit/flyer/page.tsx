import type { Metadata } from "next";
import BackLink from "@/components/BackLink";
import PrintButton from "@/components/PrintButton";
import { requireMember } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { getJoinEvents, joinEventWhen, qrSvg } from "@/lib/recruiting";

export const metadata: Metadata = { title: "Pack 361 flyer" };

/** A one-page flyer to print: what the pack is, events to come see, and a QR code to the pack's page. */
export default async function FlyerPage() {
  await requireMember();
  const [settings, events] = await Promise.all([getSettings(), getJoinEvents()]);
  const link = settings.public_site_url || "https://app.pack361.org/join";
  const qr = await qrSvg(link);
  const shown = link.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (
    <>
      <div className="flex items-center justify-between gap-2 print:hidden">
        <BackLink href="/recruit" label="Invite a family" />
        <PrintButton label="Print" />
      </div>
      <article className="card mx-auto w-full max-w-[7.5in] space-y-5 p-8 print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/badge.png" alt="" className="h-20 w-20 rounded-full" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-sage">Cub Scouts · Ellicott City, MD</p>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-pine-950">Join Pack 361</h1>
            <p className="text-lg font-semibold text-pine">Adventure. Friendship. Leadership.</p>
          </div>
        </header>
        <p className="text-base text-ink">
          A co-ed Cub Scout pack for kids in <b>kindergarten through 5th grade</b>, serving Centennial Lane Elementary and the
          Ellicott City area for over 35 years. Family campouts, the Pinewood Derby, rocket launches, hikes and a pack full of
          friends.
        </p>
        {events.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-lg font-extrabold text-pine-950">Come see us</h2>
            <ul className="space-y-1.5">
              {events.slice(0, 4).map((e) => (
                <li key={`${e.title}-${e.starts_at}`} className="text-base">
                  <b>{e.title}</b> · {joinEventWhen(e)}
                </li>
              ))}
            </ul>
            <p className="text-sm text-ink">Email app@pack361.org for the time and place.</p>
          </section>
        )}
        <section className="flex items-center gap-6 rounded-2xl bg-mint p-5">
          <div className="w-36 shrink-0 rounded-xl bg-card p-2" dangerouslySetInnerHTML={{ __html: qr }} role="img" aria-label="QR code" />
          <div className="space-y-1">
            <p className="text-lg font-extrabold text-pine-950">Scan to learn more and join</p>
            <p className="text-base font-bold text-pine">{shown}</p>
            <p className="text-sm text-ink">Questions? app@pack361.org</p>
          </div>
        </section>
      </article>
    </>
  );
}
