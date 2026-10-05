import { test } from "node:test";
import assert from "node:assert/strict";
import { meetingIsOn } from "./meeting-window";

const m = { starts_at: "2026-10-05T22:30:00Z", ends_at: "2026-10-06T00:00:00Z" }; // 6:30-8 pm Eastern
const at = (iso: string) => Date.parse(iso);

test("a meeting is on from 45 minutes before until 30 minutes after", () => {
  assert.equal(meetingIsOn(m, at("2026-10-05T21:40:00Z")), false);
  assert.equal(meetingIsOn(m, at("2026-10-05T21:45:00Z")), true);
  assert.equal(meetingIsOn(m, at("2026-10-05T23:00:00Z")), true);
  assert.equal(meetingIsOn(m, at("2026-10-06T00:30:00Z")), true);
  assert.equal(meetingIsOn(m, at("2026-10-06T00:31:00Z")), false);
});

test("without an end time it counts as 90 minutes long", () => {
  const open = { starts_at: m.starts_at, ends_at: null };
  assert.equal(meetingIsOn(open, at("2026-10-06T00:30:00Z")), true);
  assert.equal(meetingIsOn(open, at("2026-10-06T00:31:00Z")), false);
});
