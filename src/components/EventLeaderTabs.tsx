import { ClipboardCheck, ClipboardList, FileSignature, Megaphone, MessageCircle, NotebookPen, Pencil, Ticket, Users } from "lucide-react";
import type { EventTab } from "@/components/EventTabs";
import EventAttendance from "@/components/EventAttendance";
import DenMeetingRecord from "@/components/DenMeetingRecord";
import { EventRsvpLeaders, EditEventLink } from "@/components/EventRsvp";
import ReadyToGo from "@/components/ReadyToGo";
import { EventSignupLeaders } from "@/components/EventSignup";
import PermissionSlips from "@/components/PermissionSlips";
import EventSignal from "@/components/EventSignal";
import MeetingNotes from "@/components/MeetingNotes";
import { BuildEventLink, CopyEventButton } from "@/components/EventBuildButtons";
import ArchiveControl from "@/components/ArchiveControl";
import { isLeader } from "@/lib/data";
import type { GbCampaign, GbOrder } from "@/lib/fundraising-data";
import type { Adult, PackEvent } from "@/lib/types";
import { isVideoCall } from "@/lib/event-link";
import { takesMyNotes } from "@/lib/my-notes-rules";

/**
 * Everything on an event or campout page that families don't see, as buttons for the page's
 * "Leaders only" box: attendance, who's going, what's missing, Givebutter payments, permission
 * slips, the Signal group, notes, messaging families and editing. Empty for families. A section
 * with nothing in it (no slips on this event, say) hides its button.
 */
export function eventLeaderTabs({
  e,
  me,
  back,
  campaign,
  orders = [],
}: {
  e: PackEvent;
  me: Adult;
  /** Where Archive returns to (this page). */
  back: string;
  /** The event's Givebutter sign-up, when it has one (campouts). */
  campaign?: GbCampaign | null;
  orders?: GbOrder[];
}): EventTab[] {
  if (!isLeader(me)) return [];
  const denMeeting = e.category === "Den Meeting";
  // A meeting on a video call (a virtual committee meeting) has no attendance: just notes.
  const virtual = !denMeeting && isVideoCall(e.signup_url);
  const tabs: EventTab[] = [
    ...(virtual
      ? []
      : [
          {
            id: "attendance",
            aliases: ["leaders"],
            label: denMeeting ? "Record the meeting" : "Take attendance",
            hint: denMeeting ? "Who came and what you worked on" : "Who came, from the day of",
            icon: <ClipboardCheck aria-hidden />,
            content: denMeeting ? <DenMeetingRecord e={e} me={me} /> : <EventAttendance e={e} me={me} />,
          },
        ]),
    { id: "going", label: "Who's going", hint: "Every family's RSVP", icon: <Users aria-hidden />, content: <EventRsvpLeaders e={e} me={me} /> },
    { id: "ready", label: "Ready to go?", hint: "What families going still need", icon: <ClipboardList aria-hidden />, content: <ReadyToGo e={e} me={me} /> },
    {
      id: "signups",
      label: "Sign-ups and payments",
      hint: "Givebutter: who and how much",
      icon: <Ticket aria-hidden />,
      content: campaign ? <EventSignupLeaders campaign={campaign} orders={orders} /> : null,
    },
    { id: "slips", label: "Permission slips", hint: "Who has signed", icon: <FileSignature aria-hidden />, content: <PermissionSlips e={e} me={me} view="leaders" /> },
    { id: "signal", label: "Signal group", hint: "Add or change the link", icon: <MessageCircle aria-hidden />, content: <EventSignal e={e} me={me} view="leaders" /> },
    // Committee and online meetings: everyone keeps their own notes on the page instead.
    {
      id: "notes",
      label: "Leader notes",
      hint: "Only leaders see them",
      icon: <NotebookPen aria-hidden />,
      content: takesMyNotes(e) ? null : <MeetingNotes target={{ eventId: e.id }} />,
    },
  ];
  if (e.rsvp_enabled) {
    tabs.push({ id: "message", label: "Message families", hint: "Alert and email the families", icon: <Megaphone aria-hidden />, href: `/announce?event=${e.id}` });
  }
  tabs.push({
    id: "edit",
    label: "Edit event",
    hint: "Edit, copy or archive",
    icon: <Pencil aria-hidden />,
    content: (
      <>
        <EditEventLink e={e} me={me} />
        <BuildEventLink e={e} me={me} />
        <CopyEventButton e={e} me={me} />
        <ArchiveControl e={e} leader back={back} part="button" />
      </>
    ),
  });
  return tabs;
}
