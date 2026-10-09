import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ExternalLink, Printer } from "lucide-react";
import RecruitShare from "@/components/RecruitShare";
import { isLeader, requireMember } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { getJoinEvents, inviteMessage, joinEventWhen, qrSvg } from "@/lib/recruiting";

export const metadata: Metadata = { title: "Invite a family" };

export default async function RecruitPage() {
  const me = await requireMember();
  const [settings, events] = await Promise.all([getSettings(), getJoinEvents()]);
  const link = settings.public_site_url || "https://app.pack361.org/join";
  const qr = await qrSvg(link);
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Invite a family</h1>
      <p className="-mt-1 text-sm text-muted">
        Most families join because a friend asked. Know someone with a kid in kindergarten through 5th grade? Send them the
        pack&apos;s page.
      </p>

      <section className="card">
        <RecruitShare link={link} message={inviteMessage(link, events[0])} />
      </section>

      <section className="card grid gap-4 sm:grid-cols-[160px_1fr] sm:items-center">
        <div className="mx-auto w-40 rounded-xl border border-line bg-card p-2" dangerouslySetInnerHTML={{ __html: qr }} aria-label="QR code for the pack's page" role="img" />
        <div className="space-y-2">
          <h2 className="section-title">Face to face</h2>
          <p className="text-sm text-ink">At school pickup or a ball game, let them scan this with their phone&apos;s camera.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/recruit/flyer" className="btn-ghost py-2">
              <Printer className="h-4 w-4" aria-hidden /> Print a flyer
            </Link>
            <a href={link} target="_blank" rel="noopener" className="btn-ghost py-2">
              <ExternalLink className="h-4 w-4" aria-hidden /> See the page
            </a>
          </div>
        </div>
      </section>

      <section className="card space-y-2">
        <h2 className="section-title">Events to bring them to</h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted">
            None picked yet.{" "}
            {isLeader(me)
              ? "When you add or edit an event, tick “Show on the public join page” to list it here and on the pack's page."
              : "Leaders pick events that visiting families are welcome at; they'll show up here."}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {events.map((e) => (
              <li key={`${e.title}-${e.starts_at}`} className="py-2">
                <span className="block font-bold text-pine-950">{e.title}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden /> {joinEventWhen(e)}
                </span>
                {e.public_blurb && <span className="block text-xs text-ink">{e.public_blurb}</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-muted">These are also listed on the pack&apos;s public page under “Big events coming up”, with the date only: visiting
          families ask app@pack361.org for the time and place.</p>
      </section>
    </>
  );
}
