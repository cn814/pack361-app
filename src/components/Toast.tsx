"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CircleCheck } from "lucide-react";

/**
 * Pop-up confirmation after an action that moves you to another page, e.g. back to the event
 * after uploading photos. Triggered by ?done=<code>&n=<count>; only known codes are shown.
 */
const MESSAGES: Record<string, (n: number) => string> = {
  "photos-added": (n) => `${n} photo${n === 1 ? "" : "s"} added to the album`,
  "photos-sent": (n) =>
    `Thanks! ${n} photo${n === 1 ? "" : "s"} sent. A leader checks each one before it appears in the album.`,
};

export default function Toast() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const code = params.get("done");
  const n = Math.max(1, Number(params.get("n")) || 1);
  const make = code ? MESSAGES[code] : undefined;
  const [shown, setShown] = useState<string | null>(null);
  if (make && shown !== make(n)) setShown(make(n));

  useEffect(() => {
    if (!make) return;
    // Clean the address so a refresh doesn't show it again.
    const rest = new URLSearchParams(params.toString());
    rest.delete("done");
    rest.delete("n");
    const q = rest.toString();
    router.replace(q ? `${path}?${q}` : path, { scroll: false });
  }, [make, params, path, router]);

  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 5000);
    return () => clearTimeout(t);
  }, [shown]);

  if (!shown) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-pine-950/30 px-6 backdrop-blur-[2px] animate-[fade-in_150ms_ease-out] print:hidden"
      role="status"
      aria-live="polite"
      onClick={() => setShown(null)}
    >
      <div className="flex w-full max-w-xs flex-col items-center gap-3 rounded-3xl bg-white px-6 py-7 text-center shadow-[var(--shadow-float)] animate-[toast-in_220ms_cubic-bezier(0.2,0.9,0.3,1.2)]">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-mint">
          <CircleCheck className="h-10 w-10 text-pine" strokeWidth={2.5} aria-hidden />
        </span>
        <p className="text-lg font-extrabold leading-snug text-pine-950">{shown}</p>
        <button type="button" className="btn-primary w-full" onClick={() => setShown(null)}>
          OK
        </button>
      </div>
    </div>
  );
}
