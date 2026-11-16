"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { CalendarPlus, Check, Copy, Mail } from "lucide-react";
import { emailMeCalendarLink, resetCalendarLink } from "@/app/(app)/actions";

type Phone = "android" | "iphone" | null;

/**
 * Subscribe buttons for the private pack calendar feed.
 *
 * Google Calendar can only subscribe to a calendar link from its website, and on a phone its
 * one-click "add calendar" link says it worked without adding anything. So on a phone the Google
 * button shows the steps instead: copy the link, open Google's "From URL" page in desktop mode,
 * paste, then turn on Sync in the app. Or email the link to yourself and do it on a computer.
 * On a computer the one-click link works.
 */
export default function CalendarSubscribe({ feedUrl, open = false }: { feedUrl: string; open?: boolean }) {
  // Which link was copied: after "Get a new link" the old one's "Link copied" goes away.
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const copied = copiedUrl === feedUrl;
  const [phone, setPhone] = useState<Phone>(null);
  const [googleSteps, setGoogleSteps] = useState(false);
  const webcal = feedUrl.replace(/^https?:/, "webcal:");
  const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;

  useEffect(() => {
    const ua = navigator.userAgent;
    // iPadOS reports itself as a Mac; a touch screen gives it away.
    const ipad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the browser is only known after hydration
    setPhone(/Android/i.test(ua) ? "android" : /iPhone|iPad|iPod/.test(ua) || ipad ? "iphone" : null);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopiedUrl(feedUrl);
    } catch {
      setCopiedUrl(null);
    }
  };

  return (
    <details id="subscribe" open={open} className="card group scroll-mt-20">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-bold text-pine">
        <CalendarPlus className="h-5 w-5" aria-hidden /> Add the pack calendar to your phone
      </summary>
      <div className="mt-3 space-y-2 text-sm">
        <p className="text-muted">Events show up in your own calendar app and update on their own.</p>
        <div className="flex flex-wrap gap-2">
          <a href={webcal} className={phone === "android" ? "btn-ghost py-2" : "btn-primary py-2"}>
            {phone === "iphone" ? "iPhone Calendar" : "iPhone / Mac / Outlook"}
          </a>
          {phone ? (
            <button
              type="button"
              aria-expanded={googleSteps}
              onClick={() => setGoogleSteps((v) => !v)}
              className={phone === "android" ? "btn-primary py-2" : "btn-ghost py-2"}
            >
              Google Calendar
            </button>
          ) : (
            <a href={google} target="_blank" rel="noopener noreferrer" className="btn-ghost py-2">
              Google Calendar
            </a>
          )}
        </div>

        {phone && googleSteps && (
          <div className="space-y-2 rounded-xl bg-surface-low p-3">
            <p className="text-xs text-navy">
              Google only adds a calendar from a link on its website. On a phone it takes a minute:
            </p>
            <ol className="list-decimal space-y-1.5 pl-5 text-xs text-ink">
              <li>
                <button type="button" onClick={copy} className="inline-flex items-center gap-1 font-bold text-pine underline">
                  {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                  {copied ? "Link copied" : "Copy the calendar link"}
                </button>
              </li>
              <li>
                Open{" "}
                <a
                  href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-pine underline"
                >
                  Google Calendar → Add from URL
                </a>
                .{" "}
                {phone === "android"
                  ? "If Google sends you to its app or a phone page, open it in Chrome and tap ⋮ → Desktop site."
                  : "If Google shows a phone page, tap the aA (or ⋯) button in Safari → Request Desktop Website."}
              </li>
              <li>
                Paste the link into <b>URL of calendar</b> and tap <b>Add calendar</b>.
              </li>
              <li>
                In the Google Calendar app: ☰ → <b>Settings</b> → <b>Pack 361</b> → turn on <b>Sync</b>. Events can take a little while
                to appear the first time.
              </li>
            </ol>
            <EmailMe />
          </div>
        )}

        {!(phone && googleSteps) && (
          <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-pine underline" onClick={copy}>
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            {copied ? "Link copied" : "Copy the calendar link"}
          </button>
        )}
        <p className="text-[11px] text-muted">This link is just for your family. Don&apos;t post it publicly.</p>
        <form action={resetCalendarLink}>
          <ResetButton />
        </form>
      </div>
    </details>
  );
}

/** Easier on a computer: email yourself the link and the steps. */
function EmailMe() {
  const [state, action, pending] = useActionState(emailMeCalendarLink, {});
  return (
    <form action={action} className="space-y-1 border-t border-line pt-2">
      <p className="text-xs text-muted">Or do it on a computer, where Google adds it in one click:</p>
      <button className={`btn-ghost w-full py-2 ${pending ? "is-busy" : ""}`} disabled={pending}>
        <Mail className="h-4 w-4" aria-hidden /> {pending ? "Sending…" : "Email me the link and steps"}
      </button>
      {state.ok && state.message && <p className="text-xs font-semibold text-pine">{state.message}</p>}
      {state.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
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
