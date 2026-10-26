"use client";

import { useState } from "react";

const OTHER = "__other__";

/**
 * Where a gear item is kept: a real drop-down of the places the pack uses, plus "Somewhere
 * else…" to type a new one. (A text box with suggestions didn't look like a drop-down on phones.)
 */
export default function GearLocationPicker({ places, value }: { places: string[]; value: string | null }) {
  const list = [...new Set(["Pack shed", "At the quartermaster's house", "Sass house", ...places].map((p) => p.trim()).filter(Boolean))];
  const start = value?.trim() || "Pack shed";
  if (!list.includes(start)) list.push(start);
  const [pick, setPick] = useState(start);
  const [typed, setTyped] = useState("");
  const other = pick === OTHER;
  return (
    <div className="space-y-2">
      <select className="input" name={other ? undefined : "location"} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Where it's kept">
        {list.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
        <option value={OTHER}>Somewhere else…</option>
      </select>
      {other && (
        <input
          className="input"
          name="location"
          maxLength={120}
          required
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="e.g. Greenspon garage"
          aria-label="Where it's kept (type the place)"
        />
      )}
    </div>
  );
}
