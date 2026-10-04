import { test } from "node:test";
import assert from "node:assert/strict";
import { contactHref } from "./carpool-contact";

test("phone numbers become text-message links with a starter message", () => {
  const l = contactHref("(410) 555-0101", "Fall Campout");
  assert.equal(l?.kind, "text");
  assert.ok(l?.href.startsWith("sms:4105550101?&body="));
  assert.ok(decodeURIComponent(l!.href).includes("Fall Campout"));
  assert.equal(contactHref("+1 410-555-0101")?.href, "sms:+14105550101");
});

test("emails become mailto links; anything else is plain text", () => {
  assert.equal(contactHref("pat@example.com", "Fall Campout")?.kind, "email");
  assert.equal(contactHref("call me after 5"), null);
  assert.equal(contactHref("555-0101"), null);
});
