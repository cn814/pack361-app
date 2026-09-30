import Link from "next/link";
import { CircleCheck, MapPin, Users } from "lucide-react";
import type { PackEvent } from "@/lib/types";
import { fmtRange } from "@/lib/format";

const CATEGORY_STYLE: Record<string, string> = {
  Campout: "bg-mint text-pine",
  "Pack Meeting": "bg-gold-50 text-gold-700",
  Pack: "bg-gold-50 text-gold-700",
};

export interface SignupSummary {
  families: number;
  mine: boolean;
}

export default function EventRow({ e, signup }: { e: PackEvent; signup?: SignupSummary }) {
  const isCampout = e.category === "Campout";
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
        </div>
        <h3 className="mt-1 font-bold text-ink">{e.title}</h3>
        <p className="text-xs text-muted">{fmtRange(e.starts_at, e.ends_at)}</p>
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
    <Link href={`/campouts/${e.id}`} className="card block transition active:translate-y-px">
      {body}
    </Link>
  ) : (
    <div className="card">
      <Link href={`/events/${e.id}`} className="block">
        {body}
      </Link>
      {e.signup_url && !signup?.mine && (
        <a href={e.signup_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs font-bold text-pine underline">
          RSVP / pay on Givebutter
        </a>
      )}
    </div>
  );
}
