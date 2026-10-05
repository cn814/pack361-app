"use client";

import { useState } from "react";

/** Long text cut to a few lines, with "Read more" to see it all. Short text shows as is. */
export default function ClampText({ text, className = "" }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 260 || text.split("\n").length > 4;
  return (
    <div className={className}>
      <p className={`whitespace-pre-line text-sm text-ink ${long && !open ? "line-clamp-4 print:line-clamp-none" : ""}`}>{text}</p>
      {long && (
        <button type="button" onClick={() => setOpen(!open)} className="mt-1 text-sm font-bold text-pine underline-offset-2 hover:underline print:hidden">
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}
