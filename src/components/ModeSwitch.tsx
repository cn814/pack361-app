import { setMode } from "@/app/(app)/mode-actions";
import type { Mode } from "@/lib/mode";

/** The Family / Leader switch for leaders (Home on phones, the bottom of the computer sidebar). */
export default function ModeSwitch({ mode, dark = false }: { mode: Mode; dark?: boolean }) {
  const on = dark ? "bg-white text-pine-950" : "bg-pine text-white";
  const off = dark ? "text-mint-200 hover:text-white" : "text-muted";
  return (
    <form action={setMode} className={`flex gap-1 rounded-full p-1 ${dark ? "bg-white/10" : "bg-surface"}`} aria-label="Show the app as">
      {(["family", "leader"] as Mode[]).map((m) => (
        <button
          key={m}
          name="mode"
          value={m}
          aria-pressed={mode === m}
          className={`min-h-10 flex-1 rounded-full px-4 text-sm font-extrabold transition ${mode === m ? on : off}`}
        >
          {m === "family" ? "Family" : "Leader"}
        </button>
      ))}
    </form>
  );
}
