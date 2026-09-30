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
    const t = setTimeout(() => setShown(null), 4500);
    return () => clearTimeout(t);
  }, [shown]);

  if (!shown) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4 print:hidden" role="status" aria-live="polite">
      <button
        type="button"
        onClick={() => setShown(null)}
        className="pointer-events-auto flex max-w-sm items-start gap-2 rounded-2xl bg-pine-950 px-4 py-3 text-left text-sm font-semibold text-white shadow-[var(--shadow-float)] animate-[toast-in_200ms_ease-out]"
      >
        <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden />
        <span>{shown}</span>
      </button>
    </div>
  );
}
