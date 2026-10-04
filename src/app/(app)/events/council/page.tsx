import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Check, ExternalLink, MapPin, Search, TriangleAlert, Undo2, X } from "lucide-react";
import BackLink from "@/components/BackLink";
import ActionForm, { Field } from "@/components/ActionForm";
import SubmitButton from "@/components/SubmitButton";
import CouncilAddForm from "@/components/CouncilAddForm";
import { isLeader, requireMember } from "@/lib/data";
import { getDens } from "@/lib/roster-data";
import { createClient } from "@/lib/supabase/server";
import { COUNCIL_CALENDAR_PAGE, COUNCIL_STATUS_KEY, COUNCIL_URL_KEY, NOT_A_CALENDAR, readCouncilStatus } from "@/lib/council";
import { guessCategory, isCubEvent, isMeetingOrHoliday, otherDistrict, passesFilter } from "@/lib/council-filters";
import { startOfEasternDay } from "@/lib/tz";
import { fmtMonth, fmtRange, timeAgo } from "@/lib/format";
import { checkCouncilNow, saveCouncilLink, setCouncilSkipped, undoCouncilAdd } from "./actions";

export const metadata: Metadata = { title: "Council events" };

type Status = "new" | "added" | "skipped";

interface Row {
  uid: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  url: string | null;
  description: string | null;
  categories: string | null;
  removed_at: string | null;
  status: Status;
  event_id: string | null;
  decided_by: string | null;
  decided_at: string | null;
  event: { id: string; title: string; source: string | null; archived_at: string | null; category: string } | null;
  decider: { first_name: string; preferred_name: string | null } | null;
}

const TABS: { key: Status | "all"; label: string }[] = [
  { key: "new", label: "New" },
  { key: "added", label: "Added" },
  { key: "skipped", label: "Skipped" },
  { key: "all", label: "All" },
];

/** The time `ms` milliseconds ago. */
const msAgo = (ms: number) => Date.now() - ms;
const short = (s: string | null, n = 220) => (s && s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

export default async function CouncilEventsPage({ searchParams }: PageProps<"/events/council">) {
  const me = await requireMember();
  if (!isLeader(me)) redirect("/events");
  const canPick = isLeader(me);
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const tab = (["new", "added", "skipped", "all"].includes(one("status")) ? one("status") : "new") as Status | "all";
  const q = one("q").slice(0, 100);
  const hideMeetings = one("meetings") !== "show";
  const ourDistrict = one("districts") !== "all";
  const cubOnly = one("cub") === "1";
  const href = (over: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | null> = {
      status: tab === "new" ? null : tab,
      q: q || null,
      meetings: hideMeetings ? null : "show",
      districts: ourDistrict ? null : "all",
      cub: cubOnly ? "1" : null,
      ...over,
    };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/events/council?${s}` : "/events/council";
  };

  const supabase = await createClient();
  const today = startOfEasternDay();
  const [{ data }, { data: settingRows }, dens] = await Promise.all([
    supabase
      .from("council_events")
      .select(
        "uid, title, starts_at, ends_at, all_day, location, url, description, categories, removed_at, status, event_id, decided_by, decided_at, event:events(id, title, source, archived_at, category), decider:adults(first_name, preferred_name)",
      )
      .or(`starts_at.gte."${today}",ends_at.gte."${today}"`)
      .order("starts_at")
      .limit(2000),
    supabase.from("pack_settings").select("key, value").in("key", [COUNCIL_URL_KEY, COUNCIL_STATUS_KEY]),
    canPick ? getDens(false) : Promise.resolve([]),
  ]);
  const link = (settingRows?.find((r) => r.key === COUNCIL_URL_KEY)?.value as string | undefined) ?? "";
  const status = readCouncilStatus(settingRows?.find((r) => r.key === COUNCIL_STATUS_KEY)?.value as string | undefined);

  // Events that left the council's calendar drop off the list, except ones already on ours.
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => !r.removed_at || r.status === "added");
  const recent = msAgo(15 * 60000);
  // Just decided by me: stays in place on the New tab so Undo is right there.
  const justNow = (r: Row) => r.decided_by === me.id && r.decided_at && Date.parse(r.decided_at) > recent;
  const matchesSearch = (r: Row) => passesFilter(r, { hideMeetings: false, ourDistrict: false, q });
  const shownNew = (r: Row) =>
    passesFilter(r, { hideMeetings, ourDistrict, q }) && (!cubOnly || isCubEvent(r.title, r.categories));
  const visible = rows.filter((r) => {
    if (tab === "new") return r.status === "new" ? shownNew(r) : justNow(r) && matchesSearch(r);
    if (tab !== "all" && r.status !== tab) return false;
    return r.status === "new" ? shownNew(r) : matchesSearch(r);
  });
  const newCount = rows.filter((r) => r.status === "new" && shownNew(r)).length;
  const hiddenNew = rows.filter((r) => r.status === "new" && matchesSearch(r)).length - newCount;
  const counts: Record<Status | "all", number> = {
    new: newCount,
    added: rows.filter((r) => r.status === "added").length,
    skipped: rows.filter((r) => r.status === "skipped").length,
    all: 0,
  };
  const removedAdded = rows.filter((r) => r.status === "added" && r.removed_at);

  const byMonth = new Map<string, Row[]>();
  for (const r of visible) {
    const m = fmtMonth(r.starts_at);
    byMonth.set(m, [...(byMonth.get(m) ?? []), r]);
  }
  const denOptions = dens.map((d) => ({ id: d.id, name: d.name }));
  const chip = (on: boolean) =>
    `inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ${on ? "bg-brand text-white" : "border border-line bg-card text-navy"}`;

  return (
    <>
      <BackLink href="/events" label="Calendar" />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Council events</h1>
        <p className="text-sm text-muted">
          Baltimore Area Council and National Pike District events.{" "}
          {canPick ? "Pick the ones to put on the pack calendar." : "Leaders pick which ones go on the pack calendar."}
        </p>
      </div>

      {removedAdded.length > 0 && (
        <Link href={href({ status: "added" })} className="card flex items-start gap-2 border-l-4 border-l-danger text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
          <span>
            <span className="font-bold text-danger">
              {removedAdded.length} event{removedAdded.length === 1 ? " we added was" : "s we added were"} removed from the council calendar.
            </span>{" "}
            {removedAdded.length === 1 ? "It's" : "They're"} still on ours. Check with the council, then take {removedAdded.length === 1 ? "it" : "them"} off if
            needed.
          </span>
        </Link>
      )}

      <section className="card space-y-3">
        <h2 className="section-title">Council calendar link</h2>
        <CheckStatus link={link} status={status} />
        {canPick ? (
          <>
            <ActionForm action={saveCouncilLink} submit="Save and check" busy="Checking…" buttonClass="btn-primary w-full py-2.5">
              <Field
                label="Calendar feed link"
                hint="On the council calendar, choose Subscribe → Outlook or Google and copy the address that starts with webcal:// or ends in .ics. Leave blank to stop checking."
              >
                <input className="input" name="url" type="text" inputMode="url" maxLength={1000} defaultValue={link} placeholder="webcal://…" />
              </Field>
            </ActionForm>
            {link && <ActionForm action={checkCouncilNow} submit="Check now" busy="Checking…" buttonClass="btn-ghost w-full" />}
          </>
        ) : (
          <p className="text-xs text-muted">Leaders set the link. The app checks the council calendar every afternoon.</p>
        )}
        <a href={COUNCIL_CALENDAR_PAGE} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-pine underline">
          <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open the council calendar
        </a>
      </section>

      <form className="relative" role="search" action="/events/council">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input className="input pl-9" type="search" name="q" defaultValue={q} placeholder="Search council events" />
        {tab !== "new" && <input type="hidden" name="status" value={tab} />}
        {!hideMeetings && <input type="hidden" name="meetings" value="show" />}
        {!ourDistrict && <input type="hidden" name="districts" value="all" />}
        {cubOnly && <input type="hidden" name="cub" value="1" />}
      </form>

      <nav className="flex flex-wrap gap-2" aria-label="Status">
        {TABS.map((t) => (
          <Link key={t.key} href={href({ status: t.key === "new" ? null : t.key })} aria-current={tab === t.key ? "page" : undefined} className={chip(tab === t.key)}>
            {t.label}
            {t.key !== "all" && ` (${counts[t.key]})`}
          </Link>
        ))}
      </nav>
      <div className="-mt-1 flex flex-wrap gap-2" aria-label="Filters">
        <Link href={href({ meetings: hideMeetings ? "show" : null })} className={chip(hideMeetings)} aria-pressed={hideMeetings}>
          {hideMeetings ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />} Hide meetings &amp; holidays
        </Link>
        <Link href={href({ districts: ourDistrict ? "all" : null })} className={chip(ourDistrict)} aria-pressed={ourDistrict}>
          {ourDistrict ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />} Our district (National Pike) and council-wide
        </Link>
        <Link href={href({ cub: cubOnly ? null : "1" })} className={chip(cubOnly)} aria-pressed={cubOnly}>
          {cubOnly ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />} Cub Scout events only
        </Link>
      </div>
      {hiddenNew > 0 && (tab === "new" || tab === "all") && (
        <p className="-mt-1 text-xs text-muted">
          {hiddenNew} more new event{hiddenNew === 1 ? " is" : "s are"} hidden by the filters.
        </p>
      )}

      {visible.length === 0 && (
        <p className="card text-sm text-muted">
          {rows.length === 0
            ? link
              ? "No council events yet. Press Check now, or wait for the afternoon check."
              : "No council events yet. Add the council calendar link above."
            : tab === "new"
              ? "Nothing new to decide on."
              : "No events here."}
        </p>
      )}

      {[...byMonth.entries()].map(([month, list]) => (
        <section key={month} className="space-y-3">
          <h2 className="section-title">{month}</h2>
          {list.map((r) => (
            <CouncilCard key={r.uid} r={r} canPick={canPick} dens={denOptions} />
          ))}
        </section>
      ))}
    </>
  );
}

function CheckStatus({ link, status }: { link: string; status: ReturnType<typeof readCouncilStatus> }) {
  if (!link) {
    return (
      <p className="rounded-xl bg-gold-50 p-2 text-xs text-gold-800">
        No link yet. On the council calendar (scoutingevent.com/220), open Subscribe and choose Outlook or Google, then copy the address that starts
        with webcal:// or ends in .ics.
      </p>
    );
  }
  if (!status) return <p className="text-sm text-muted">Not checked yet.</p>;
  if (status.error) {
    return (
      <div className="space-y-1 rounded-xl bg-danger-50 p-2 text-xs text-danger">
        <p className="font-bold">Last check {timeAgo(status.at)} didn&apos;t work.</p>
        <p>{status.error}</p>
        {status.error === NOT_A_CALENDAR && (
          <p>The short link scoutcal.com/18715 opens the calendar web page in a browser; calendar apps may need the longer address.</p>
        )}
        {status.last_ok_at && <p>The last check that worked was {timeAgo(status.last_ok_at)}.</p>}
      </div>
    );
  }
  const notes = [status.found_url ? `The saved link opened a web page; this calendar link on it worked: ${status.found_url}. Save it instead.` : null, status.skipped, ...(status.errors ?? [])].filter(Boolean);
  return (
    <>
      <p className="text-sm text-muted">
        Checked {timeAgo(status.at)}: {status.feed} upcoming council events, {status.fresh} new
        {status.removed ? `, ${status.removed} removed from the council calendar` : ""}
        {status.pack_updated ? `, ${status.pack_updated} of ours updated to match` : ""}. Checked again every afternoon.
      </p>
      {notes.length > 0 && <p className="rounded-xl bg-gold-50 p-2 text-xs text-gold-800">{notes.join(" ")}</p>}
    </>
  );
}

function CouncilCard({ r, canPick, dens }: { r: Row; canPick: boolean; dens: { id: string; name: string }[] }) {
  const cub = isCubEvent(r.title, r.categories);
  const district = otherDistrict(r.title);
  const meeting = isMeetingOrHoliday(r.title, r.categories);
  const who = r.decider ? r.decider.preferred_name || r.decider.first_name : null;
  return (
    <article className={`card space-y-1.5 ${cub ? "border-l-4 border-l-gold" : ""}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {cub && <span className="badge bg-gold text-on-gold">Cub Scouts</span>}
        {r.status === "added" && <span className="badge bg-mint text-pine">On our calendar</span>}
        {r.status === "skipped" && <span className="badge bg-surface text-muted">Skipped</span>}
        {district && <span className="badge bg-surface text-navy">{district}</span>}
        {meeting && <span className="badge bg-surface text-navy">Meeting or holiday</span>}
        {r.removed_at && <span className="badge bg-danger-50 text-danger">Removed from the council calendar</span>}
      </div>
      <h3 className="font-bold text-ink">{r.title}</h3>
      <p className="flex items-center gap-1 text-xs text-muted">
        <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden /> {fmtRange(r.starts_at, r.ends_at, r.all_day)}
      </p>
      {r.location && (
        <p className="flex items-start gap-1 text-xs text-muted">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {r.location}
        </p>
      )}
      {r.description && <p className="whitespace-pre-line text-sm text-navy">{short(r.description)}</p>}
      {r.url && (
        <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-pine underline">
          <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Council page
        </a>
      )}

      {r.status === "added" && (
        <div className="space-y-1 pt-1 text-xs text-muted">
          {r.event ? (
            <p>
              <Link href={r.event.category === "Campout" ? `/campouts/${r.event.id}` : `/events/${r.event.id}`} className="font-bold text-pine underline">
                {r.event.title}
              </Link>
              {who && ` · added by ${who}`}
              {r.event.archived_at && " · taken off our calendar (in the archive)"}
              {r.event.source !== "council" && " · edited in the app, so council changes no longer copy over"}
            </p>
          ) : (
            <p>The pack event is gone.</p>
          )}
          {r.removed_at && <p className="text-danger">It&apos;s still on our calendar. Check with the council before taking it off.</p>}
        </div>
      )}
      {r.status === "skipped" && who && <p className="pt-1 text-xs text-muted">Skipped by {who}</p>}

      {canPick && r.status === "new" && (
        <div className="flex flex-wrap items-start gap-2 pt-2">
          <details className="w-full">
            <summary className="btn-primary w-full cursor-pointer list-none py-2 [&::-webkit-details-marker]:hidden">Add to our calendar</summary>
            <CouncilAddForm uid={r.uid} title={r.title} category={guessCategory(r.title)} dens={dens} />
          </details>
          <form action={setCouncilSkipped} className="w-full">
            <input type="hidden" name="uid" value={r.uid} />
            <input type="hidden" name="skip" value="1" />
            <SubmitButton className="btn-ghost w-full py-2">Skip</SubmitButton>
          </form>
        </div>
      )}
      {canPick && r.status === "skipped" && (
        <form action={setCouncilSkipped} className="pt-2">
          <input type="hidden" name="uid" value={r.uid} />
          <input type="hidden" name="skip" value="0" />
          <SubmitButton className="btn-ghost w-full py-2">
            <Undo2 className="h-4 w-4" aria-hidden /> Undo skip
          </SubmitButton>
        </form>
      )}
      {canPick && r.status === "added" && (
        <details className="pt-2">
          <summary className="btn-ghost w-full cursor-pointer list-none py-2 [&::-webkit-details-marker]:hidden">
            <Undo2 className="h-4 w-4" aria-hidden /> Undo add
          </summary>
          <form action={undoCouncilAdd} className="space-y-2 pt-3">
            <input type="hidden" name="uid" value={r.uid} />
            {r.event && !r.event.archived_at ? (
              <label className="flex items-start gap-2 text-sm text-navy">
                <input type="checkbox" name="take_off" defaultChecked className="mt-0.5 h-4 w-4 accent-pine" />
                Also take it off our calendar (it moves to the archive; nothing is deleted)
              </label>
            ) : (
              <input type="hidden" name="take_off" value="on" />
            )}
            <SubmitButton className="btn-primary w-full py-2">Move back to New</SubmitButton>
          </form>
        </details>
      )}
    </article>
  );
}
