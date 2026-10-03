"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** A short code shown big, with a Copy button (e.g. the popcorn unit code). */
export default function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="select-all rounded-xl bg-card px-4 py-2 font-mono text-2xl font-extrabold tracking-[0.25em] text-navy ring-1 ring-line">
        {code}
      </span>
      <button
        type="button"
        className="btn-ghost px-3 py-2 text-sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Clipboard blocked: the code is selectable instead.
          }
        }}
      >
        {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
