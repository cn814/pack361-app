import type { Metadata } from "next";
import Link from "next/link";
import FeedbackForm from "@/components/FeedbackForm";
import ViewAsPicker from "@/components/ViewAsPicker";
import { Mail, Phone, ShieldAlert } from "lucide-react";
import { getLeaders, isLeader, requireMember } from "@/lib/data";
import { ROLE_LABEL } from "@/lib/roster-data";

export const metadata: Metadata = { title: "Leader contacts" };

const ROLE_ORDER: Record<string, number> = { cubmaster: 0, admin: 1, committee: 2, den_leader: 3, parent: 4 };

export default async function LeadersPage() {
  const me = await requireMember();
  const leaders = (await getLeaders()).sort(
    (a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.name.localeCompare(b.name),
  );
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Leader contacts</h1>
      <p className="-mt-2 text-sm text-muted">
        Call or email any of the pack&apos;s leaders. Leader tools are under{" "}
        <Link href="/pack" className="font-semibold text-pine underline">
          Pack
        </Link>
        {isLeader(me) ? " in Leader mode." : "."}
      </p>
      <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0">
        {leaders.map((l) => (
          <li key={l.adult_id} className="card flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate font-bold text-ink">{l.name}</p>
              <p className="text-xs font-semibold text-pine">{l.position_title ?? ROLE_LABEL[l.role]}</p>
              {l.dens && <p className="truncate text-[11px] text-muted">{l.dens}</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              {l.phone && (
                <a href={`tel:${l.phone.replace(/[^\d+]/g, "")}`} aria-label={`Call ${l.name}`} className="flex h-10 w-10 items-center justify-center rounded-xl border border-mint-200 bg-mint text-pine">
                  <Phone className="h-4 w-4" aria-hidden />
                </a>
              )}
              <a href={`mailto:${l.email}`} aria-label={`Email ${l.name}`} className="flex h-10 w-10 items-center justify-center rounded-xl border border-mint-200 bg-mint text-pine">
                <Mail className="h-4 w-4" aria-hidden />
              </a>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-start gap-3 rounded-2xl border border-gold-100 bg-gold-50 p-4 text-xs text-gold-800">
        <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden />
        <p>
          <strong className="block text-sm">Scouts First Helpline</strong>
          For any youth protection concern, call{" "}
          <a className="font-bold underline" href="tel:18447268871">1-844-SCOUTS1 (1-844-726-8871)</a>. In an emergency,
          call 911.
        </p>
      </div>
      <ViewAsPicker me={me} />
      <FeedbackForm page="Leaders" />
    </>
  );
}
