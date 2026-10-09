import "server-only";
import { cache } from "react";
import { getUpcomingEvents, isLeader, requireMember } from "./data";
import { easternDate, easternToIso } from "./calendar";
import { myDenMeetingButtons, todayEastern } from "./meetings";
import { meetingIsOn } from "./meeting-window";
import { isVideoCall } from "./event-link";

// Today's meetings for a leader, for the Leaders tab and the "meeting now" bar across the app:
// their own dens' meetings (record who's here, what they did, and notes) and the day's other
// short events (pack meetings, hikes: take attendance and notes). A meeting held on a video call
// (a virtual committee meeting) has no attendance: join the call and take notes. Campouts and
// all-day events aren't meetings.

export interface LeaderMeeting {
  key: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  /** Where the leader takes attendance and keeps notes (just notes for a video-call meeting). */
  href: string;
  /** The video call, for a meeting held online (no attendance there). */
  call_url: string | null;
  den: boolean;
  /** A den meeting already recorded today. */
  saved: boolean;
  /** On right now (when this was read; the meeting bar keeps checking on its own). */
  on: boolean;
}

const LONGEST_MS = 6 * 3600_000;

export const getLeaderMeetingsToday = cache(async (): Promise<LeaderMeeting[]> => {
  const me = await requireMember();
  if (!isLeader(me)) return [];
  const today = todayEastern();
  const [items, dens] = await Promise.all([getUpcomingEvents(80, { near: true }), myDenMeetingButtons()]);
  const todays = items.filter((e) => easternDate(e.starts_at) === today && !e.all_day && !e.archived_at);
  const out: LeaderMeeting[] = [];
  for (const d of dens.filter((x) => x.today)) {
    // Its time: the den's own meeting, else the den-meeting night on the calendar.
    const t =
      todays.find((e) => e.kind === "meeting" && e.den_id === d.denId) ??
      todays.find((e) => e.category === "Den Meeting" && (e.den_id === d.denId || (!e.den_id && (!e.ranks?.length || e.ranks.includes(d.rank)))));
    out.push({
      key: `den-${d.denId}`,
      title: `${d.name} den meeting`,
      starts_at: t?.starts_at ?? easternToIso(today, "18:30"),
      ends_at: t?.ends_at ?? null,
      href: `/scouts/den/${d.denId}/today`,
      call_url: null,
      den: true,
      saved: d.saved,
      on: false,
    });
  }
  for (const e of todays) {
    if (e.kind !== "event" || e.category === "Den Meeting" || e.category === "Campout") continue;
    if (e.ends_at && Date.parse(e.ends_at) - Date.parse(e.starts_at) > LONGEST_MS) continue;
    const call = isVideoCall(e.signup_url) ? e.signup_url!.trim() : null;
    out.push({
      key: e.id,
      title: e.title,
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      href: `${e.href}#${call ? "notes" : "attendance"}`,
      call_url: call,
      den: false,
      saved: false,
      on: false,
    });
  }
  const now = Date.now();
  for (const m of out) m.on = meetingIsOn(m, now);
  return out.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
});
