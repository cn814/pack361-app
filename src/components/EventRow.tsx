import Link from "next/link";
import { CircleCheck, MapPin, Users } from "lucide-react";
import type { PackEvent } from "@/lib/types";
import RsvpLink from "@/components/RsvpLink";
import { fmtRange } from "@/lib/format";

const CATEGORY_STYLE: Record<string, string> = {
  Campout: "bg-mint text-pine",
  "Den Meeting": "bg-navy text-white",
  "Pack Meeting": "bg-gold-50 text-gold-700",
  Pack: "bg-gold-50 text-gold-700",
};

export interface SignupSummary {
  families: number;
  mine: boolean;
}

export default function EventRow({
  e,
  signup,
}: {
  e: PackEvent & { href?: string; den_name?: string | null; kind?: "event" | "meeting" };
  signup?: SignupSummary;
}) {
  const isCampout = e.category === "Campout";
  const href = e.href ?? (isCampout ? `/campouts/${e.id}` : `/events/${e.id}`);
  const body = (
    <div className="flex items-start gap-3">
      <div className="w-12 shrink-0 rounded-xl bg-surface-low py-1.5 text-center">
        <div className="text-[10px] font-extrabold uppercase text-gold-800">
          {new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short" }).format(new Date(e.starts_at))}
        </div>
        <div className="text-lg font-extrabold leading-none text-pine-950">
          {new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", day: "numeric" }).format(new Date(e.starts_at))}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`badge ${CATEGORY_STYLE[e.category] ?? "bg-surface text-navy"}`}>{e.category}</span>
          {e.den_name && <span className="badge bg-gold-50 text-gold-800">{e.den_name}</span>}
        </div>
        <h3 className="mt-1 font-bold text-ink">{e.title}</h3>
        <p className="text-xs text-muted">{fmtRange(e.starts_at, e.ends_at, e.all_day)}</p>
        {e.location_name && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
            {e.location_name}
          </p>
        )}
        {signup && (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            {signup.mine && (
              <span className="inline-flex items-center gap-1 font-bold text-pine">
                <CircleCheck className="h-3.5 w-3.5" aria-hidden /> You&apos;re signed up
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-muted">
              <Users className="h-3.5 w-3.5" aria-hidden /> {signup.families} {signup.families === 1 ? "family" : "families"} going
            </span>
          </p>
        )}
      </div>
    </div>
  );
  return isCampout ? (
    <div className="card">
      <Link href={href} className="block">
        {body}
      </Link>
      {e.twh_uid && (
        <div className="mt-2">
          <RsvpLink e={e} variant="link" />
        </div>
      )}
    </div>
  ) : (
    <div className="card">
      <Link href={href} className="block">
        {body}
      </Link>
      {(e.twh_uid || (e.signup_url && !signup?.mine)) && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <RsvpLink e={e} variant="link" />
          {e.signup_url && !signup?.mine && (
            <a href={e.signup_url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-pine underline">
              {/givebutter/i.test(e.signup_url) ? "Pay / order on Givebutter" : "Sign up"}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
