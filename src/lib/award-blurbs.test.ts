import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { awardBlurb } from "./award-blurbs";
import type { DenRank } from "./types";

// Every adventure in the catalog (loaded by this migration) has words on the awards night cheat sheet.
const sql = readFileSync(new URL("../../supabase/migrations/20260929000400_pack_features.sql", import.meta.url), "utf8");
const catalog = [...sql.matchAll(/^\s*\('(lion|tiger|wolf|bear|webelos|aol)', '((?:[^']|'')+)', '(?:home|some|den)'/gm)].map((m) => ({
  rank: m[1] as DenRank,
  name: m[2].replace(/''/g, "'"),
}));

test("the catalog is all there", () => {
  assert.equal(catalog.length, 148);
});

test("every adventure has a line for the awards night cheat sheet", () => {
  const missing = catalog.filter((a) => !awardBlurb(a.rank, a.name)).map((a) => `${a.rank} ${a.name}`);
  assert.deepEqual(missing, []);
});

test("names match whatever the capitalization or apostrophe", () => {
  assert.equal(awardBlurb("wolf", "Running With the Pack"), awardBlurb("wolf", "Running with the Pack"));
  assert.equal(awardBlurb("lion", "Lion’s Roar"), awardBlurb("lion", "Lion's Roar"));
  assert.equal(awardBlurb("bear", "Not an adventure"), null);
  assert.equal(awardBlurb("bear", null), null);
});
