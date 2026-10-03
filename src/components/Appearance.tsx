"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { BAR_DARK, BAR_LIGHT, THEME_KEY, type Theme } from "@/lib/theme";

const CHOICES: { key: Theme; label: string; icon: typeof Sun }[] = [
  { key: "light", label: "Off", icon: Sun },
  { key: "dark", label: "On", icon: Moon },
  { key: "auto", label: "Match device", icon: Monitor },
];

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function read(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "dark" || t === "auto" ? t : "light";
  } catch {
    return "light";
  }
}

/** Me → Appearance: dark mode off, on, or following the phone or computer's setting. */
export default function Appearance() {
  const theme = useSyncExternalStore(subscribe, read, () => null);

  function choose(t: Theme) {
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      // Private browsing: still switch for this visit.
    }
    document.documentElement.setAttribute("data-theme", t);
    const dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? BAR_DARK : BAR_LIGHT);
    listeners.forEach((l) => l());
  }

  return (
    <section className="space-y-2">
      <h2 className="px-0.5 text-xs font-extrabold uppercase tracking-[0.1em] text-muted">Appearance</h2>
      <div className="card space-y-2.5">
        <p className="text-[15px] font-bold text-ink">Dark mode</p>
        <div role="radiogroup" aria-label="Dark mode" className="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1">
          {CHOICES.map(({ key, label, icon: Icon }) => {
            const on = theme === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => choose(key)}
                className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-bold ${
                  on ? "bg-card text-pine-950 shadow-[var(--shadow-card)]" : "text-muted"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden /> {label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted">Saved on this device. &ldquo;Match device&rdquo; follows your phone or computer&rsquo;s own setting.</p>
      </div>
    </section>
  );
}
