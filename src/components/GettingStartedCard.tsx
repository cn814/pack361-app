"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { Check, ChevronRight, PartyPopper, Sparkles } from "lucide-react";
import SubmitButton from "@/components/SubmitButton";
import { ProgressBar } from "@/components/RankProgress";
import { hideGettingStarted } from "@/app/(app)/onboarding-actions";
import type { Step } from "@/lib/onboarding";

const STORE_KEY = "pack361:getting-started";
const CHANGE_EVENT = "pack361:getting-started-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function read(): string | null {
  try {
    return localStorage.getItem(STORE_KEY);
  } catch {
    return null; // storage blocked (private mode): ticks still work, just aren't remembered
  }
}

/**
 * The Getting started list. Steps the app can see tick themselves; the rest (calendar, guide,
 * den leader) are ticked here and kept on this phone.
 */
export default function GettingStartedCard({ steps }: { steps: Step[] }) {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const ticked = useMemo<Record<string, boolean>>(() => {
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, [raw]);
  const toggle = useCallback(
    (key: string) => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ ...ticked, [key]: !ticked[key] }));
      } catch {}
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [ticked],
  );

  const isDone = (s: Step) => (s.done === null ? Boolean(ticked[s.key]) : s.done);
  const doneCount = steps.filter(isDone).length;
  const allDone = doneCount === steps.length;

  return (
    <section className="card space-y-3 border-l-4 border-l-gold" aria-labelledby="getting-started-title">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h2 id="getting-started-title" className="flex items-center gap-1.5 text-base font-extrabold text-pine-950">
            {allDone ? <PartyPopper className="h-4 w-4 text-gold-700" aria-hidden /> : <Sparkles className="h-4 w-4 text-gold-700" aria-hidden />}
            {allDone ? "You're all set!" : "Getting started"}
          </h2>
          <span className="shrink-0 text-xs font-bold text-muted">
            {doneCount} of {steps.length} done
          </span>
        </div>
        <ProgressBar percent={Math.round((doneCount / steps.length) * 100)} />
        <p className="text-xs text-muted">
          {allDone
            ? "Welcome to Pack 361. Everything on the list is done."
            : "Welcome to Pack 361! A few things to set up. Most tick themselves off once they're done."}
        </p>
      </div>

      {!allDone && (
        <ul className="divide-y divide-line">
          {steps.map((s) => {
            const done = isDone(s);
            const manual = s.done === null;
            return (
              <li key={s.key} className="flex items-center gap-2 py-1">
                {manual ? (
                  <button
                    type="button"
                    onClick={() => toggle(s.key)}
                    aria-pressed={done}
                    aria-label={done ? `${s.title}: done. Tap to undo` : `Mark “${s.title}” done`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  >
                    <Tick done={done} manual />
                  </button>
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center" aria-label={done ? "Done" : "Not done yet"} role="img">
                    <Tick done={done} />
                  </span>
                )}
                <Link href={s.href} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 py-1">
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-bold ${done ? "text-muted line-through decoration-1" : "text-ink"}`}>{s.title}</span>
                    <span className="block text-xs text-muted">
                      {s.detail}
                      {manual && !done ? " Tap the circle when it's done." : ""}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <form action={hideGettingStarted} className="flex justify-end">
        {allDone ? (
          <SubmitButton className="btn-primary min-h-10 w-full">Close</SubmitButton>
        ) : (
          <SubmitButton className="min-h-10 rounded-xl px-3 text-xs font-bold text-muted underline">Hide this list</SubmitButton>
        )}
      </form>
    </section>
  );
}

function Tick({ done, manual }: { done: boolean; manual?: boolean }) {
  return (
    <span
      className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
        done ? "border-pine bg-brand text-white" : manual ? "border-pine bg-card" : "border-outline bg-card"
      }`}
      aria-hidden
    >
      {done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
    </span>
  );
}
