"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { Camera, Check } from "lucide-react";

const CHANGE_EVENT = "pack361:hunt-change";

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
    return null; // storage blocked: the hunt still works, it just isn't remembered
  }
}

/** A seasonal scavenger hunt on the Trail guide. Ticks stay on this phone (works with no signal). */
export default function ScavengerHunt({ eventId, title, items }: { eventId: string; title: string; items: string[] }) {
  const key = `pack361:hunt:${eventId}`;
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const found = useMemo<Record<string, boolean>>(() => {
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, [raw]);
  const toggle = useCallback(
    (item: string) => {
      const next = { ...found, [item]: !found[item] };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [found, key],
  );
  const done = items.filter((i) => found[i]).length;

  return (
    <div id="scavenger-hunt" className="scroll-mt-20 space-y-2 border-t border-line pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-extrabold text-pine-950">{title}</h3>
        <span className="text-xs font-bold text-pine">
          {done} of {items.length}
        </span>
      </div>
      <p className="flex items-start gap-1.5 text-sm text-muted">
        <Camera className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Find each one and snap a photo instead of taking it home. Tap to check it off.
      </p>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {items.map((item) => {
          const on = Boolean(found[item]);
          return (
            <li key={item}>
              <button
                type="button"
                onClick={() => toggle(item)}
                aria-pressed={on}
                className={`flex min-h-11 w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition active:scale-[0.99] ${
                  on ? "border-pine bg-mint font-semibold text-pine" : "border-line bg-card text-ink"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${on ? "border-pine bg-pine text-white" : "border-muted"}`}
                  aria-hidden
                >
                  {on && <Check className="h-3.5 w-3.5" />}
                </span>
                {item}
              </button>
            </li>
          );
        })}
      </ul>
      {done === items.length && <p className="text-sm font-bold text-pine">You found them all! Show your photos at the campfire.</p>}
    </div>
  );
}
