import { test } from "node:test";
import assert from "node:assert/strict";
import { facebookAnswered, facebookOk, facebookState, photosOk } from "./photo-permission";

test("pack album: OK unless the family opted out", () => {
  assert.equal(photosOk(null), true);
  assert.equal(photosOk("yes"), true);
  assert.equal(photosOk("no"), false);
});

test("Facebook: only a yes, and only while in pack photos", () => {
  assert.equal(facebookOk({ social_ok: true, photo_permission: null }), true);
  assert.equal(facebookOk({ social_ok: null, photo_permission: null }), false);
  assert.equal(facebookOk({ social_ok: false, photo_permission: "yes" }), false);
  assert.equal(facebookOk({ social_ok: true, photo_permission: "no" }), false);
  assert.equal(facebookAnswered({ social_ok: null, photo_permission: null }), false);
  assert.equal(facebookAnswered({ social_ok: false, photo_permission: null }), true);
  assert.equal(facebookAnswered({ social_ok: null, photo_permission: "no" }), true);
});

test("a photo is OK for Facebook once checked with no face missing a yes", () => {
  const base = { photo_id: "p", people: 2, not_ok: 0, not_ok_names: null };
  assert.equal(facebookState(undefined), "unchecked");
  assert.equal(facebookState({ ...base, checked: false }), "unchecked");
  assert.equal(facebookState({ ...base, checked: true }), "ok");
  assert.equal(facebookState({ ...base, checked: true, people: 0 }), "ok");
  assert.equal(facebookState({ ...base, checked: true, not_ok: 1, not_ok_names: "Sky S." }), "not-ok");
});
