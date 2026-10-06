"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { CalendarPlus, Check, Copy } from "lucide-react";
import { resetCalendarLink } from "@/app/(app)/actions";

/** Subscribe buttons for the private pack calendar feed. */
export default function CalendarSubscribe({ feedUrl, open = false }: { feedUrl: string; open?: boolean }) {
  // Which link was copied: after "Get a new link" the old one's "Link copied" goes away.
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const copied = copiedUrl === feedUrl;
  const webcal = feedUrl.replace(/^https?:/, "webcal:");
  const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
  return (
    <details id="subscribe" open={open} className="card group scroll-mt-20">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-bold text-pine">
        <CalendarPlus className="h-5 w-5" aria-hidden /> Add the pack calendar to your phone
      </summary>
      <div className="mt-3 space-y-2 text-sm">
        <p className="text-muted">Events show up in your own calendar app and update on their own.</p>
        <div className="flex flex-wrap gap-2">
          <a href={webcal} className="btn-primary py-2">
            iPhone / Mac / Outlook
          </a>
          <a href={google} target="_blank" rel="noopener noreferrer" className="btn-ghost py-2">
            Google Calendar
          </a>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-semibold text-pine underline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(feedUrl);
              setCopiedUrl(feedUrl);
            } catch {
              setCopiedUrl(null);
            }
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? "Link copied" : "Copy the calendar link"}
        </button>
        <p className="text-[11px] text-muted">This link is just for your family. Don&apos;t post it publicly.</p>
        <form action={resetCalendarLink}>
          <ResetButton />
        </form>
      </div>
    </details>
  );
}

/** Inside the reset form, so it can show that the new link is being made. */
function ResetButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className={`text-[11px] font-semibold text-muted underline ${pending ? "is-busy" : ""}`}
      disabled={pending}
      aria-busy={pending || undefined}
      onClick={(e) => {
        if (!window.confirm("Make a new calendar link? The old one stops working, so you'll need to add the calendar to your phone again.")) e.preventDefault();
      }}
    >
      {pending ? "Making a new link…" : "Shared it by mistake? Get a new link"}
    </button>
  );
}
