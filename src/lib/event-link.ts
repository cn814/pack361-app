// An event's one outside link (events.signup_url): usually where to sign up or pay, but it can be
// a video call (committee meetings on Google Meet, Zoom or Teams) or the council's registration
// page. The button says which.

const VIDEO_CALL =
  /^https?:\/\/(?:[a-z0-9-]+\.)*(?:meet\.google\.com|zoom\.us|zoom\.com|teams\.microsoft\.com|teams\.live\.com|webex\.com|whereby\.com|meet\.jit\.si|gotomeeting\.com|meet\.goto\.com)(?:[/?#:]|$)/i;

/** Is this link a video call rather than a sign-up page? */
export function isVideoCall(url: string | null | undefined): boolean {
  return Boolean(url && VIDEO_CALL.test(url.trim()));
}

export type EventLinkKind = "video" | "council" | "givebutter" | "signup";

export function eventLinkKind(url: string, source?: string | null): EventLinkKind {
  if (isVideoCall(url)) return "video";
  if (source === "council") return "council";
  if (/givebutter/i.test(url)) return "givebutter";
  return "signup";
}

/** The button text for an event's link. `short` is for the small link on event lists. */
export function eventLinkLabel(url: string, source?: string | null, short = false): string {
  switch (eventLinkKind(url, source)) {
    case "video":
      return short ? "Join the call" : "Join the video call";
    case "council":
      return "Register with the council";
    case "givebutter":
      return short ? "Pay / order on Givebutter" : "Sign up / pay";
    default:
      return short ? "Sign up" : "Sign up / pay";
  }
}

/** The line for calendar apps (the .ics file and the private feed). */
export function eventLinkCalendarLine(url: string): string {
  return `${isVideoCall(url) ? "Video call" : "Sign up"}: ${url}`;
}
