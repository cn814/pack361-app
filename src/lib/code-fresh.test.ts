import { test } from "node:test";
import assert from "node:assert/strict";
import { codeIsFresh } from "./code-fresh";

const now = Date.UTC(2026, 9, 9, 12);
const secs = (daysAgo: number) => Math.floor((now - daysAgo * 86_400_000) / 1000);

test("a code entered in the last 30 days counts", () => {
  assert.equal(codeIsFresh({ aal: "aal2", amr: [{ method: "otp", timestamp: secs(0) }, { method: "totp", timestamp: secs(29) }] }, now), true);
});
test("after 30 days the code is asked for again", () => {
  assert.equal(codeIsFresh({ aal: "aal2", amr: [{ method: "totp", timestamp: secs(31) }] }, now), false);
});
test("aal2 without an authenticator entry does not count", () => {
  assert.equal(codeIsFresh({ aal: "aal2", amr: [{ method: "otp", timestamp: secs(0) }] }, now), false);
});
test("aal1 never counts", () => {
  assert.equal(codeIsFresh({ aal: "aal1", amr: [{ method: "totp", timestamp: secs(0) }] }, now), false);
});
test("no amr list: aal2 alone, like the database", () => {
  assert.equal(codeIsFresh({ aal: "aal2" }, now), true);
});
