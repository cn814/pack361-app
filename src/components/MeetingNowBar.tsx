"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, ClipboardCheck, NotebookPen, Video } from "lucide-react";
import { meetingIsOn } from "@/lib/meeting-window";

export interface BarMeeting {
  key: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  href: string;
  /** A meeting held on a video call: join it and take notes, no attendance. */
  call_url: string | null;
  den: boolean;
  saved: boolean;
}

/**
 * For leaders, across the top of every page while one of today's meetings is on: one tap to take
 * attendance and keep notes. A virtual meeting (a committee meeting on Meet or Zoom) gets "Join
 * the meeting" and "Take notes" instead. Checks the time every minute, so it comes and goes on its
 * own.
 */
export default function MeetingNowBar({ meetings }: { meetings: BarMeeting[] }) {
  const path = usePathname();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const t = window.setInterval(tick, 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, []);
  if (now === null) return null;
  const on = meetings.filter((m) => meetingIsOn(m, now));
  const m = on[0];
  // Already on its page: no need for the bar.
  if (!m) return null;
  const pulse = (
    <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-deep opacity-60" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-deep" />
    </span>
  );
  // A virtual meeting: the call link stays up even on the event's own page.
  if (on.length === 1 && m.call_url) {
    const onPage = path === m.href.split("#")[0];
    return (
      <div className="print:hidden flex items-center gap-2 bg-gold px-4 py-1.5 text-sm text-on-gold lg:px-8">
        {pulse}
        <b className="min-w-0 flex-1 truncate">{m.title}</b>
        <a
          href={m.call_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1 rounded-full bg-deep px-3 py-1 font-extrabold text-gold active:brightness-95"
        >
          <Video className="h-4 w-4" aria-hidden /> Join the meeting
        </a>
        {!onPage && (
          <Link href={m.href} className="flex shrink-0 items-center gap-1 py-1 font-extrabold">
            <NotebookPen className="h-4 w-4" aria-hidden /> Take notes
          </Link>
        )}
      </div>
    );
  }
  if (path === m.href.split("#")[0]) return null;
  return (
    <Link
      href={on.length > 1 ? "/lead" : m.href}
      className="print:hidden flex items-center gap-2 bg-gold px-4 py-2 text-sm text-on-gold lg:px-8"
    >
      {pulse}
      <span className="min-w-0 flex-1 truncate">
        <b>{m.title}</b>
        {on.length > 1 ? ` and ${on.length - 1} more` : ""}
      </span>
      <span className="flex shrink-0 items-center gap-1 font-extrabold">
        <ClipboardCheck className="h-4 w-4" aria-hidden />
        {on.length > 1 ? "Meetings" : m.saved ? "Recorded" : "Attendance & notes"}
        <ChevronRight className="h-4 w-4" aria-hidden />
      </span>
    </Link>
  );
}
