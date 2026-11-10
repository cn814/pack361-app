import { test } from "node:test";
import assert from "node:assert/strict";

import { LOCK_MS, SIGN_OUT_MS, countsAsUse, idleState, lastActive, openWhileLocked, readActive, safeNext, stampActive } from "./idle";

// The signing key is made on first use, from this.
process.env.SUPABASE_SECRET_KEY = "test-secret-for-the-idle-cookie";

const now = Date.UTC(2026, 10, 9, 20);
const min = 60_000;

test("the signed cookie reads back, and only for its own session", async () => {
  const v = await stampActive("session-a", now);
  assert.equal(await readActive(v, "session-a"), now);
  assert.equal(await readActive(v, "session-b"), null, "copied to another session");
  assert.equal(await readActive(undefined, "session-a"), null);
  assert.equal(await readActive("garbage", "session-a"), null);
});

test("an edited time doesn't read", async () => {
  const v = await stampActive("session-a", now - 20 * min);
  const [, sig] = v.split(".");
  assert.equal(await readActive(`${now}.${sig}`, "session-a"), null);
});

test("a leader's account locks after 15 minutes without use", () => {
  assert.equal(idleState({ last: now - 14 * min, aal2: true, now }), "ok");
  assert.equal(idleState({ last: now - LOCK_MS - 1, aal2: true, now }), "locked");
  // A parent (no authenticator code in this session) doesn't lock.
  assert.equal(idleState({ last: now - 3 * 86_400_000, aal2: false, now }), "ok");
});

test("everyone is signed out after 30 days away", () => {
  assert.equal(idleState({ last: now - SIGN_OUT_MS - 1, aal2: false, now }), "signed-out");
  assert.equal(idleState({ last: now - SIGN_OUT_MS - 1, aal2: true, now }), "signed-out");
  assert.equal(idleState({ last: now - SIGN_OUT_MS + min, aal2: false, now }), "ok");
});

test("entering the code counts as use; deleting the cookie doesn't open a lock", () => {
  // Just entered the code: fresh even with an old cookie.
  assert.equal(lastActive({ stamped: now - 40 * min, codeAt: now - min, aal2: true, now }), now - min);
  // Cookie deleted on a leader's laptop: the code's time still counts, so it stays locked.
  const last = lastActive({ stamped: null, codeAt: now - 40 * min, aal2: true, now });
  assert.equal(idleState({ last, aal2: true, now }), "locked");
  // A leader's session with nothing to go by is locked (the code opens it).
  assert.equal(idleState({ last: lastActive({ stamped: null, codeAt: null, aal2: true, now }), aal2: true, now }), "locked");
  // A parent's first visit after this came in: now.
  assert.equal(lastActive({ stamped: null, codeAt: null, aal2: false, now }), now);
  // A parent's old code time is ignored (not a leader session).
  assert.equal(lastActive({ stamped: now - 5 * min, codeAt: now - min, aal2: false, now }), now - 5 * min);
  // A clock that jumped ahead counts as now.
  assert.equal(lastActive({ stamped: now + 60 * min, codeAt: null, aal2: false, now }), now);
});

test("page loads and posts are use; prefetches, in-app fetches and the lock check aren't", () => {
  const h = (o: Record<string, string> = {}) => new Headers(o);
  assert.equal(countsAsUse("GET", "/events", h({ "sec-fetch-mode": "navigate" })), true);
  assert.equal(countsAsUse("GET", "/events", h()), true, "an old browser: every request counts");
  assert.equal(countsAsUse("POST", "/events", h({ "sec-fetch-mode": "cors" })), true, "a save");
  assert.equal(countsAsUse("POST", "/api/session", h({ "sec-fetch-mode": "cors" })), true);
  assert.equal(countsAsUse("GET", "/api/session", h({ "sec-fetch-mode": "cors" })), false);
  assert.equal(countsAsUse("GET", "/events", h({ "sec-fetch-mode": "cors" })), false, "a link prefetch or in-app fetch");
  assert.equal(countsAsUse("GET", "/events", h({ "sec-fetch-mode": "navigate", "sec-purpose": "prefetch;prerender" })), false);
  assert.equal(countsAsUse("GET", "/events", h({ purpose: "prefetch" })), false);
});

test("only the code page and signing out open while locked", () => {
  assert.equal(openWhileLocked("/two-step"), true);
  assert.equal(openWhileLocked("/auth/signout"), true);
  assert.equal(openWhileLocked("/api/session"), true);
  assert.equal(openWhileLocked("/scouts"), false);
  assert.equal(openWhileLocked("/two-stepper"), false);
});

test("back to the page after the code, on this site only", () => {
  assert.equal(safeNext("/scouts?den=bears"), "/scouts?den=bears");
  assert.equal(safeNext("//evil.example"), "/");
  assert.equal(safeNext("/\\evil.example"), "/");
  assert.equal(safeNext("https://evil.example"), "/");
  assert.equal(safeNext("/two-step"), "/");
  assert.equal(safeNext(undefined), "/");
});
