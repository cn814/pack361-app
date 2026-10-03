import { ShieldCheck } from "lucide-react";
import { setMode } from "@/app/(app)/mode-actions";

/** Across the top of every page while a leader is in Leader mode, with a way back to Family. */
export default function LeaderModeBanner() {
  return (
    <div className="print:hidden bg-deep-navy text-white">
      <form action={setMode} className="mx-auto flex max-w-md items-center gap-2 px-4 py-2 text-sm lg:max-w-3xl lg:px-8">
        <ShieldCheck className="h-4 w-4 shrink-0 text-gold" aria-hidden />
        <span className="min-w-0 flex-1 font-semibold">Now viewing in Leader mode</span>
        <button name="mode" value="family" className="shrink-0 rounded-lg bg-white/15 px-3 py-1 text-xs font-bold text-white hover:bg-white/25">
          Switch to Family
        </button>
      </form>
    </div>
  );
}
