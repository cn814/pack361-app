"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleCheck, ExternalLink, Pencil, Plus, TriangleAlert, X } from "lucide-react";
import type { AdventureOption } from "@/components/MeetingForm";
import type { MeetingWork } from "@/lib/meetings";
import { recordDenMeeting, type RecordResult } from "@/app/(app)/scouts/den/[denId]/meetings/actions";

interface Props {
  denId: string;
  day: string;
  today: string;
  dayLabel: string;
  meetingId: string | null;
  savedAt: string | null;
  scouts: { id: string; label: string }[];
  present: string[];
  /** "Checked from 5 RSVPs" etc. */
  presentNote: string | null;
  adventures: AdventureOption[];
  work: MeetingWork[];
}

const range = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1));

/** Record a den meeting on a phone: tap who's here, tap what you did, Save. */
export default function RecordMeeting(p: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<RecordResult, FormData>(recordDenMeeting, {});
  const [present, setPresent] = useState<Set<string>>(new Set(p.present));
  const [work, setWork] = useState<MeetingWork[]>(p.work);
  const [noAdventure, setNoAdventure] = useState(Boolean(p.savedAt) && p.work.length === 0);
  const [picking, setPicking] = useState(p.work.length === 0 && !p.savedAt);
  const [showGrid, setShowGrid] = useState(p.work.some((w) => Object.values(w.skip ?? {}).some((s) => s.length)));
  const [showDate, setShowDate] = useState(p.day !== p.today);
  const [editing, setEditing] = useState(true);
  const [lastOk, setLastOk] = useState<RecordResult | null>(null);
  if (state.ok && state !== lastOk) {
    setLastOk(state);
    setEditing(false);
  }
  const meetingId = state.meetingId ?? p.meetingId;

  const byName = new Map(p.adventures.map((a) => [a.name, a]));
  const chosen = new Set(work.map((w) => w.adventure));
  const suggested = p.adventures
    .filter((a) => a.missing > 0 && !chosen.has(a.name))
    .sort((a, b) => b.missing - a.missing || Number(b.required) - Number(a.required))
    .slice(0, 4);

  const toggleScout = (id: string) =>
    setPresent((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const addAdventure = (name: string) => {
    const a = byName.get(name);
    if (!a || chosen.has(name)) return;
    setWork((w) => [...w, { adventure: name, requirements: range(a.req_count), skip: {} }]);
    setPicking(false);
    setNoAdventure(false);
  };
  const updateItem = (i: number, f: (w: MeetingWork) => MeetingWork) => setWork((all) => all.map((w, j) => (j === i ? f(w) : w)));
  const toggleReq = (i: number, r: string) =>
    updateItem(i, (w) => ({
      ...w,
      requirements: w.requirements.includes(r) ? w.requirements.filter((x) => x !== r) : [...w.requirements, r].sort((a, b) => Number(a) - Number(b)),
    }));
  const toggleSkip = (i: number, scout: string, r: string) =>
    updateItem(i, (w) => {
      const cur = w.skip?.[scout] ?? [];
      return { ...w, skip: { ...w.skip, [scout]: cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r] } };
    });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return; // a second tap while saving does nothing
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  };

  const cleanWork = noAdventure ? [] : work.filter((w) => w.requirements.length > 0);
  const reqTotal = cleanWork.reduce((n, w) => n + w.requirements.length, 0);
  const presentList = p.scouts.filter((s) => present.has(s.id));

  if (!editing && lastOk) {
    return (
      <section className="card space-y-3 border-t-4 border-t-pine">
        <p className="flex items-start gap-2 text-lg font-extrabold leading-snug text-pine">
          <CircleCheck className="mt-0.5 h-6 w-6 shrink-0" aria-hidden /> {lastOk.message}
        </p>
        <EnteredNote entered={lastOk.entered} />
        <button type="button" className="btn-ghost w-full py-3 text-base" onClick={() => setEditing(true)}>
          <Pencil className="h-4 w-4" aria-hidden /> Edit
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="den_id" value={p.denId} />
      {meetingId && <input type="hidden" name="meeting_id" value={meetingId} />}
      <input type="hidden" name="meets_on" value={p.day} />
      <input type="hidden" name="work" value={JSON.stringify(cleanWork)} />
      {[...present].map((id) => (
        <input key={id} type="hidden" name="present" value={id} />
      ))}

      <p className="rounded-2xl bg-mint p-3 text-base font-semibold text-pine">Tap who&apos;s here, tap what you did, then Save.</p>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-bold text-navy">{p.dayLabel}</span>
        {showDate ? (
          <label className="flex items-center gap-2">
            <span className="text-muted">Day</span>
            <input
              type="date"
              className="input w-auto py-1.5"
              max={p.today}
              defaultValue={p.day}
              onChange={(e) => {
                const v = e.target.value;
                if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v <= p.today) router.push(`/scouts/den/${p.denId}/today?date=${v}`);
              }}
            />
          </label>
        ) : (
          <button type="button" className="font-semibold text-pine underline" onClick={() => setShowDate(true)}>
            Different day?
          </button>
        )}
      </div>
      {p.savedAt && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-pine">
          <CircleCheck className="h-4 w-4" aria-hidden /> Saved already. Change anything below and Save again.
        </p>
      )}

      {/* Step 1 */}
      <section className="card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-pine-950">1. Who&apos;s here?</h2>
          <span className="badge bg-gold-50 text-gold-800" aria-live="polite">
            {present.size} of {p.scouts.length} here
          </span>
        </div>
        {p.presentNote && <p className="text-xs text-muted">{p.presentNote}</p>}
        <div className="grid grid-cols-2 gap-2">
          {p.scouts.map((s) => {
            const on = present.has(s.id);
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleScout(s.id)}
                className={`flex min-h-14 items-center gap-2 rounded-2xl border-2 px-3 py-3 text-left text-base font-bold ${
                  on ? "border-pine bg-brand text-white" : "border-line bg-card text-navy"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-white bg-white text-brand" : "border-outline"}`}
                  aria-hidden
                >
                  {on && <Check className="h-4 w-4" />}
                </span>
                <span className="min-w-0 truncate">{s.label}</span>
              </button>
            );
          })}
        </div>
        {p.scouts.length === 0 && <p className="text-sm text-muted">No scouts in this den yet.</p>}
        {p.scouts.length > 0 && (
          <button
            type="button"
            className="btn-ghost w-full py-3 text-base"
            onClick={() => setPresent(present.size === p.scouts.length ? new Set() : new Set(p.scouts.map((s) => s.id)))}
          >
            {present.size === p.scouts.length ? "Clear everyone" : "Everyone's here"}
          </button>
        )}
      </section>

      {/* Step 2 */}
      <section className="card space-y-3">
        <h2 className="text-lg font-extrabold text-pine-950">2. What did you work on?</h2>

        {!noAdventure &&
          work.map((w, i) => {
            const a = byName.get(w.adventure);
            return (
              <div key={w.adventure} className="space-y-2 rounded-2xl border border-line p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-base font-extrabold text-ink">{w.adventure}</span>
                  <button
                    type="button"
                    className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-muted"
                    onClick={() => {
                      setWork((all) => all.filter((_, j) => j !== i));
                      if (work.length === 1) setPicking(true);
                    }}
                  >
                    <X className="h-4 w-4" aria-hidden /> Remove
                  </button>
                </div>
                <p className="text-xs text-muted">Requirements you did (tap to turn one off):</p>
                <div className="flex flex-wrap gap-2">
                  {range(a?.req_count ?? 0).map((r) => {
                    const on = w.requirements.includes(r);
                    return (
                      <button
                        key={r}
                        type="button"
                        aria-pressed={on}
                        aria-label={`Requirement ${r}`}
                        onClick={() => toggleReq(i, r)}
                        className={`flex h-12 w-12 items-center justify-center rounded-xl border-2 text-lg font-extrabold ${
                          on ? "border-pine bg-brand text-white" : "border-line bg-card text-muted line-through"
                        }`}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
                {a?.url && (
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-pine underline">
                    See the requirements <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                )}
              </div>
            );
          })}

        {!noAdventure && (picking || work.length === 0) && (
          <div className="space-y-2">
            {suggested.length > 0 && (
              <div className="grid gap-2">
                {suggested.map((a) => (
                  <button
                    key={a.name}
                    type="button"
                    onClick={() => addAdventure(a.name)}
                    className="flex min-h-14 items-center justify-between gap-2 rounded-2xl border-2 border-line bg-card px-4 py-3 text-left"
                  >
                    <span className="text-base font-bold text-ink">{a.name}</span>
                    <span className="shrink-0 text-xs text-muted">
                      {a.missing} scout{a.missing === 1 ? "" : "s"} still need it
                    </span>
                  </button>
                ))}
              </div>
            )}
            <label className="block space-y-1">
              <span className="text-xs font-bold text-navy">Choose another adventure</span>
              <select className="input py-3 text-base" value="" onChange={(e) => addAdventure(e.target.value)}>
                <option value="">Pick from the list…</option>
                <optgroup label="Required">
                  {p.adventures
                    .filter((a) => a.required && !chosen.has(a.name))
                    .map((a) => (
                      <option key={a.name} value={a.name}>
                        {a.name}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Electives">
                  {p.adventures
                    .filter((a) => !a.required && !chosen.has(a.name))
                    .map((a) => (
                      <option key={a.name} value={a.name}>
                        {a.name}
                      </option>
                    ))}
                </optgroup>
              </select>
            </label>
          </div>
        )}

        {!noAdventure && work.length > 0 && !picking && (
          <button type="button" className="btn-ghost w-full py-3 text-base" onClick={() => setPicking(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Add another adventure
          </button>
        )}

        {noAdventure ? (
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-surface-low p-3 text-sm">
            <span className="font-semibold text-ink">No adventure today (outing or activity). Saves who was here.</span>
            <button type="button" className="shrink-0 font-semibold text-pine underline" onClick={() => setNoAdventure(false)}>
              Undo
            </button>
          </div>
        ) : (
          work.length === 0 && (
            <button type="button" className="w-full py-2 text-sm font-semibold text-pine underline" onClick={() => setNoAdventure(true)}>
              No adventure today (outing / activity)
            </button>
          )
        )}

        {!noAdventure && cleanWork.length > 0 && presentList.length > 0 && (
          <div className="border-t border-line pt-2">
            {!showGrid ? (
              <button type="button" className="text-sm font-semibold text-pine underline" onClick={() => setShowGrid(true)}>
                Not everyone finished?
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted">Untick anything a scout didn&apos;t finish (left early, missed a part).</p>
                {cleanWork.map((w) => {
                  const i = work.findIndex((x) => x.adventure === w.adventure);
                  return (
                    <div key={w.adventure} className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="py-1 pr-2 text-left text-xs font-bold text-navy">{w.adventure}</th>
                            {w.requirements.map((r) => (
                              <th key={r} className="px-1 text-center text-xs font-bold text-navy">
                                {r}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {presentList.map((s) => (
                            <tr key={s.id}>
                              <td className="py-1 pr-2 font-semibold text-ink">{s.label}</td>
                              {w.requirements.map((r) => {
                                const on = !(w.skip?.[s.id] ?? []).includes(r);
                                return (
                                  <td key={r} className="px-1 text-center">
                                    <button
                                      type="button"
                                      aria-pressed={on}
                                      aria-label={`${s.label}, requirement ${r}`}
                                      onClick={() => toggleSkip(i, s.id, r)}
                                      className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border-2 ${
                                        on ? "border-pine bg-brand text-white" : "border-line bg-card text-muted"
                                      }`}
                                    >
                                      {on ? <Check className="h-4 w-4" aria-hidden /> : "–"}
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Step 3 */}
      <div className="space-y-2">
        <button
          className={`btn-primary w-full py-4 text-lg ${pending ? "is-busy" : ""}`}
          disabled={pending}
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <p className="text-center text-xs text-muted">
          {present.size} here
          {reqTotal > 0 ? ` · ${reqTotal} requirement${reqTotal === 1 ? "" : "s"} go on the Scoutbook list for them` : ""}
        </p>
        {state.error && !pending && <p className="text-center text-sm font-semibold text-danger">{state.error}</p>}
      </div>
    </form>
  );
}

function EnteredNote({ entered }: { entered?: RecordResult["entered"] }) {
  if (!entered?.length) return null;
  return (
    <div className="rounded-xl border border-gold-100 bg-gold-50 p-3 text-sm text-gold-800">
      <p className="flex items-center gap-1.5 font-bold">
        <TriangleAlert className="h-4 w-4" aria-hidden /> Already entered in Scoutbook, so it stays:
      </p>
      <ul className="mt-1 list-disc pl-5">
        {entered.map((e, i) => (
          <li key={i}>
            {e.scout}: {e.adventure} {e.requirement}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs">If that&apos;s wrong, ask the advancement chair to fix it in Scoutbook.</p>
    </div>
  );
}
