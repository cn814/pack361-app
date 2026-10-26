"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setShoppingCheck } from "@/app/(app)/kitchen/actions";
import { failedCallMessage } from "@/components/ActionForm";

export interface ShoppingRow {
  key: string;
  name: string;
  amount: string;
  buy: string;
  detail: string;
}

/** The shopping list by store, ticked off as things go in the cart. Every cook sees the same ticks. */
export default function ShoppingList({
  eventId,
  stores,
  checked,
}: {
  eventId: string;
  stores: { store: string; rows: ShoppingRow[] }[];
  checked: string[];
}) {
  // What the database has (as of the last tick saved here), and the tick showing while one saves.
  const [saved, setSaved] = useState(() => new Set(checked));
  const [ticks, setTick] = useOptimistic(saved, (cur, { key, on }: { key: string; on: boolean }) => {
    const next = new Set(cur);
    if (on) next.add(key);
    else next.delete(key);
    return next;
  });
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toggle = (key: string, on: boolean) =>
    start(async () => {
      setTick({ key, on });
      setError(null);
      try {
        const r = await setShoppingCheck(eventId, key, on);
        if (r.error) setError(r.error);
        else
          setSaved((cur) => {
            const next = new Set(cur);
            if (on) next.add(key);
            else next.delete(key);
            return next;
          });
      } catch (e) {
        setError(failedCallMessage(e, "the box"));
      }
    });

  return (
    <div className="space-y-3">
      {error && <p className="text-sm font-semibold text-danger">{error}</p>}
      {stores.map((g) => {
        const left = g.rows.filter((r) => !ticks.has(r.key)).length;
        return (
          <div key={g.store} className="card p-0">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <h3 className="font-bold text-pine-950">{g.store}</h3>
              <span className="text-xs text-muted">{left ? `${left} to get` : "All in the cart"}</span>
            </div>
            <ul className="divide-y divide-line">
              {g.rows.map((r) => {
                const on = ticks.has(r.key);
                return (
                  <li key={r.key}>
                    <label className="flex min-h-12 cursor-pointer items-start gap-3 px-3 py-2.5">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-5 w-5 shrink-0 accent-pine print:hidden"
                        checked={on}
                        onChange={(e) => toggle(r.key, e.target.checked)}
                      />
                      <span className="hidden print:inline">☐</span>
                      <span className={`min-w-0 flex-1 ${on ? "text-muted line-through" : "text-ink"}`}>
                        <span className="font-semibold">{r.name}</span>
                        {r.buy ? (
                          <span className="font-bold text-pine"> · buy {r.buy}</span>
                        ) : r.amount ? (
                          <span className="font-bold text-pine"> · {r.amount}</span>
                        ) : null}
                        {r.buy && r.amount && <span className="block text-xs text-muted">Recipes need {r.amount}</span>}
                        {r.detail && <span className="block text-xs text-muted">{r.detail}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
