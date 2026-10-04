import { test } from "node:test";
import assert from "node:assert/strict";
import { eventLinkCalendarLine, eventLinkLabel, isVideoCall } from "./event-link";

test("video call links are recognized", () => {
  for (const u of [
    "https://meet.google.com/abc-defg-hij",
    "https://us02web.zoom.us/j/123456789?pwd=x",
    "https://teams.microsoft.com/l/meetup-join/19%3a",
    "https://pack.webex.com/meet/someone",
    " https://meet.google.com/abc-defg-hij ",
  ]) assert.equal(isVideoCall(u), true, u);
  for (const u of [
    "https://givebutter.com/pack361-campout",
    "https://www.signupgenius.com/go/10C0",
    "https://notmeet.google.com.evil.example/x",
    "https://example.com/?u=meet.google.com",
    null,
    "",
  ]) assert.equal(isVideoCall(u), false, String(u));
});

test("button text follows the kind of link", () => {
  assert.equal(eventLinkLabel("https://meet.google.com/abc-defg-hij", "twh"), "Join the video call");
  assert.equal(eventLinkLabel("https://meet.google.com/abc-defg-hij", "twh", true), "Join the call");
  assert.equal(eventLinkLabel("https://events.example.org/reg", "council"), "Register with the council");
  assert.equal(eventLinkLabel("https://givebutter.com/x", "twh"), "Sign up / pay");
  assert.equal(eventLinkLabel("https://givebutter.com/x", "twh", true), "Pay / order on Givebutter");
  assert.equal(eventLinkLabel("https://www.signupgenius.com/go/1", null), "Sign up / pay");
  assert.equal(eventLinkCalendarLine("https://meet.google.com/abc"), "Video call: https://meet.google.com/abc");
  assert.equal(eventLinkCalendarLine("https://givebutter.com/x"), "Sign up: https://givebutter.com/x");
});
