import MeetingNowBar from "@/components/MeetingNowBar";
import { getLeaderMeetingsToday, type LeaderMeeting } from "@/lib/meeting-now";

/**
 * The meeting bar for leaders (streams in on its own, so pages don't wait for it). It's on every
 * page, so a problem reading today's meetings just leaves it off instead of breaking the page.
 */
export default async function MeetingNow() {
  let meetings: LeaderMeeting[] = [];
  try {
    meetings = await getLeaderMeetingsToday();
  } catch (e) {
    console.error("meeting bar", e);
  }
  return meetings.length ? <MeetingNowBar meetings={meetings} /> : null;
}
