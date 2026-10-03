// Run with: npm test (tsx --test). Proves calendar feed text can't start new iCalendar lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIcs, esc } from "./ics";

const base = { id: "e1", starts_at: "2026-10-20T22:00:00Z", ends_at: null, location: null, description: null, url: null };

/** Unfold (RFC 5545 3.1) and split on the CRLF line breaks the writer uses. */
const lines = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");

test("a lone CR in the summary stays on one line", () => {
  const ics = buildIcs("Pack 361", [{ ...base, title: "Title\rBEGIN:VALARM" }]);
  assert.ok(lines(ics).includes("SUMMARY:Title\\nBEGIN:VALARM"));
  assert.ok(!lines(ics).includes("BEGIN:VALARM"));
  // No bare CR or LF anywhere: every line break in the feed is a CRLF.
  assert.equal(ics.replace(/\r\n/g, "").search(/[\r\n]/), -1);
});

test("CRLF, lone CR and lone LF all become \\n", () => {
  assert.equal(esc("a\r\nb\rc\nd"), "a\\nb\\nc\\nd");
});

test("other control characters are dropped, tab kept", () => {
  assert.equal(esc("a\u0000b\u0008c\u000Bd\u001Fe\u007Ff\tg"), "abcdef\tg");
});

test("commas, semicolons and backslashes are escaped", () => {
  assert.equal(esc("a,b;c\\d"), "a\\,b\\;c\\\\d");
});

test("leaders-only events are marked and have no description", () => {
  const ics = buildIcs("Pack 361", [{ ...base, title: "Planning", description: "Budget notes", leadersOnly: true }]);
  assert.ok(lines(ics).includes("SUMMARY:[Leaders] Planning"));
  assert.ok(!ics.includes("DESCRIPTION"));
});
