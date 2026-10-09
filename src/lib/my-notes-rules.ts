import { isVideoCall } from "./event-link";

// Which meetings get a "Take notes" box for everyone (each person's own notes, nobody else sees
// them): committee meetings, and any meeting held on a video call. Shared with the browser.

export function takesMyNotes(e: { category: string; signup_url?: string | null }): boolean {
  return e.category === "Committee" || (e.category !== "Den Meeting" && isVideoCall(e.signup_url));
}
