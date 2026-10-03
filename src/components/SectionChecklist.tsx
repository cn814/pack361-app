"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { Check, RotateCcw } from "lucide-react";

const CHANGE_EVENT = "pack361:section-check-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked (private mode): ticks still work, just aren't remembered
  }
}

/**
 * A tap-to-check list inside an event section (a scavenger hunt, say). Ticks are kept on this
 * phone only, so it works on the trail with no signal.
 */
export default function SectionChecklist({ eventId, title, items }: { eventId: string; title: string; items: string[] }) {
  const key = `pack361:check:${eventId}:${title}`;
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  const checked = useMemo<Record<string, boolean>>(() => {
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, [raw]);

  const save = useCallback(
    (next: Record<string, boolean>) => {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [key],
  );

  const found = items.filter((i) => checked[i]).length;
  const all = found === items.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={`rounded-lg px-2 py-0.5 text-sm font-extrabold ${all ? "bg-gold text-on-gold" : "bg-mint text-pine"}`}>
          {all ? `All ${items.length} found!` : `${found} of ${items.length} found`}
        </span>
        {found > 0 && (
          <button type="button" onClick={() => save({})} className="ml-auto flex items-center gap-1 text-xs font-bold text-muted">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Start over
          </button>
        )}
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {items.map((i) => {
          const on = Boolean(checked[i]);
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => save({ ...checked, [i]: !on })}
                aria-pressed={on}
                className={`flex min-h-11 w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition ${
                  on ? "border-pine/30 bg-mint" : "border-line bg-card"
                }`}
              >
                <span
                  className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border-2 border-pine ${on ? "bg-brand" : "bg-card"}`}
                >
                  {on && <Check className="h-4 w-4 text-white" strokeWidth={3} aria-hidden />}
                </span>
                <span className={on ? "font-semibold text-pine" : "text-ink"}>{i}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-muted">Saved on this phone, so it works on the trail without signal.</p>
    </div>
  );
}
