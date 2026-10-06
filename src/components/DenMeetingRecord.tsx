import Link from "next/link";
import { CircleCheck, ClipboardCheck } from "lucide-react";
import { getMyDenIds, reviewsWholePack } from "@/lib/advancement-data";
import { isLeader } from "@/lib/data";
import { todayEastern } from "@/lib/meetings";
import { createClient } from "@/lib/supabase/server";
import { easternDate } from "@/lib/tz";
import type { Adult, DenRank, PackEvent } from "@/lib/types";

/**
 * On a "Den Meeting" calendar event, for leaders: den meetings are recorded on the den's meeting
 * page (who's there plus what they worked on, in one Save), not with the event's attendance list.
 * One button per den this leader runs that the event includes; pack leadership, who can record
 * any den, get every den in it when they don't lead one themselves.
 */
export default async function DenMeetingRecord({ e, me }: { e: PackEvent; me: Adult }) {
  if (!isLeader(me)) return null;
  const day = easternDate(e.starts_at);
  const today = todayEastern();
  const supabase = await createClient();
  const [{ data: denRows }, mine] = await Promise.all([
    supabase.from("dens").select("id, name, rank").eq("is_active", true).order("name"),
    getMyDenIds(),
  ]);
  const ranks = (e.ranks ?? []) as string[];
  const inEvent = ((denRows ?? []) as { id: string; name: string; rank: DenRank }[]).filter((d) =>
    e.den_id ? d.id === e.den_id : !ranks.length || ranks.includes(d.rank),
  );
  const own = inEvent.filter((d) => mine.includes(d.id));
  const dens = own.length ? own : reviewsWholePack(me) ? inEvent : [];
  const { data: saved } = dens.length
    ? await supabase.from("den_meetings").select("den_id").in("den_id", dens.map((d) => d.id)).eq("meets_on", day).not("recorded_at", "is", null)
    : { data: [] };
  const done = new Set(((saved ?? []) as { den_id: string }[]).map((r) => r.den_id));

  return (
    <section className="card space-y-3 border-l-4 border-l-gold">
      <div>
        <h2 className="flex items-center gap-2 font-extrabold text-pine-950">
          <ClipboardCheck className="h-5 w-5 text-gold-700" aria-hidden /> Record the den meeting
        </h2>
        <p className="text-sm text-muted">
          Tap your den: check who&apos;s there, tap what you worked on, Save. That takes attendance and records the requirements for
          everyone there.
        </p>
      </div>
      {dens.length === 0 ? (
        <p className="text-sm text-muted">Each den&apos;s leaders record their own den&apos;s meeting.</p>
      ) : day > today ? (
        <p className="text-sm text-muted">This opens on the day of the meeting (the gold meeting bar shows it too).</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {dens.map((d) => (
            <Link key={d.id} href={`/scouts/den/${d.id}/today?date=${day}`} className={done.has(d.id) ? "btn-ghost w-full py-2.5" : "btn-primary w-full py-2.5"}>
              {done.has(d.id) && <CircleCheck className="h-4 w-4" aria-hidden />}
              {done.has(d.id) ? `${d.name}: saved, open` : `Record ${d.name}`}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
