import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA_POLICY_MD, TERMS_MD, TERMS_VERSION } from "./policies";

test("the terms carry their version and point to the data policy", () => {
  assert.ok(Number.isInteger(TERMS_VERSION) && TERMS_VERSION >= 1);
  assert.match(TERMS_MD, new RegExp(`version ${TERMS_VERSION}\\.`));
  assert.match(TERMS_MD, /\]\(\/privacy\)/);
  assert.match(DATA_POLICY_MD, /\]\(\/terms\)/);
});
test("both say health forms stay on paper and name the contact address", () => {
  for (const md of [TERMS_MD, DATA_POLICY_MD]) {
    assert.match(md, /app@pack361\.org/);
  }
  assert.match(DATA_POLICY_MD, /health forms stay on paper/);
  assert.match(TERMS_MD, /Health forms stay on paper/);
});
test("links are only https, mailto or app pages (the renderer drops anything else)", () => {
  for (const md of [TERMS_MD, DATA_POLICY_MD]) {
    for (const [, href] of md.matchAll(/\]\(([^)]+)\)/g)) assert.match(href, /^(https:\/\/|mailto:|\/[a-z])/, href);
  }
});
