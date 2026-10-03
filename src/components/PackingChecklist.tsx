"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { Check, WifiOff } from "lucide-react";
import type { PackingItem } from "@/lib/types";

const CHANGE_EVENT = "pack361:packing-change";

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
    return null; // storage blocked (private mode): checklist still works, just isn't remembered
  }
}

/** Checklist ticks live on this device only, so it works with no cell signal at camp. */
export default function PackingChecklist({ eventId, items }: { eventId: string; items: PackingItem[] }) {
  const key = `pack361:packing:${eventId}`;
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const checked = useMemo<Record<string, boolean>>(() => {
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, [raw]);

  const toggle = useCallback(
    (id: string) => {
      const next = { ...checked, [id]: !checked[id] };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [checked, key],
  );

  const groups = useMemo(() => {
    const m = new Map<string, PackingItem[]>();
    for (const i of items) m.set(i.category, [...(m.get(i.category) ?? []), i]);
    return [...m.entries()];
  }, [items]);

  const done = items.filter((i) => checked[i.id]).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  if (!items.length) return <p className="card text-sm text-muted">No packing list for this campout yet.</p>;

  return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-bold text-pine-950">Packing progress</span>
          <span className="rounded-lg bg-mint px-2 py-0.5 text-sm font-extrabold text-pine">{pct}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-muted">
          <WifiOff className="h-3.5 w-3.5" aria-hidden /> Saved on this phone, so it works without signal at camp.
        </p>
      </div>
      {groups.map(([cat, list]) => (
        <section key={cat} className="space-y-2">
          <h3 className="section-title">{cat}</h3>
          {list.map((i) => {
            const on = Boolean(checked[i.id]);
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => toggle(i.id)}
                aria-pressed={on}
                className="flex w-full items-start gap-3 rounded-xl border border-line bg-card p-3 text-left"
              >
                <span
                  className={`mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border-2 border-pine transition ${
                    on ? "bg-brand" : "bg-card"
                  }`}
                >
                  {on && <Check className="h-4 w-4 text-white" strokeWidth={3} aria-hidden />}
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold ${on ? "text-sage line-through" : "text-ink"}`}>
                    {i.label}
                  </span>
                  {i.detail && <span className={`block text-xs ${on ? "text-sage" : "text-muted"}`}>{i.detail}</span>}
                </span>
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
}
