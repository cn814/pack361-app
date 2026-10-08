import { test } from "node:test";
import assert from "node:assert/strict";
import { HEARD_MIN, NOW_MIN, addHeard, hearingNow, isSpecies, pool, type Detection } from "./bird-id";

const d = (index: number, confidence: number, name = `Bird ${index}`, geoscore = 0.5): Detection => ({
  index,
  scientificName: `Avis ${index}`,
  commonName: name,
  confidence,
  geoscore,
});

test("non-species labels are left out", () => {
  assert.equal(isSpecies({ scientificName: "Dog", commonName: "Dog" }), false);
  assert.equal(isSpecies({ scientificName: "Human vocal", commonName: "Human vocal" }), false);
  assert.equal(isSpecies({ scientificName: "Cardinalis cardinalis", commonName: "Northern Cardinal" }), true);
});

test("smoothing: one loud blip isn't a bird, a steady song is", () => {
  const blip = pool([[d(1, 0.9)], [], [], [], []]);
  assert.ok(blip[0].confidence < 0.25, `blip ${blip[0].confidence}`);
  const song = pool([[d(2, 0.7)], [d(2, 0.8)], [d(2, 0.75)], [d(2, 0.6)], [d(2, 0.7)]]);
  assert.ok(song[0].confidence > 0.6, `song ${song[0].confidence}`);
});

test("smoothing: a bird singing in short bursts with gaps still shows", () => {
  const bursts = pool([[d(3, 0.6)], [], [], [d(3, 0.5)], []]);
  assert.ok(bursts[0].confidence >= HEARD_MIN, `bursts ${bursts[0].confidence}`);
  const faint = pool([[d(4, 0.05)], [d(4, 0.06)], [], [], []]);
  assert.ok(faint[0].confidence < NOW_MIN, `faint ${faint[0].confidence}`);
});

test("hearing now: likely here, confident, top three", () => {
  const now = hearingNow([d(1, 0.9), { ...d(2, 0.9), scientificName: "Dog", commonName: "Dog" }, d(3, 0.8, "Rare", 0.001), d(4, 0.5), d(5, 0.4), d(6, 0.3), d(7, 0.1)]);
  assert.deepEqual(now.map((x) => x.index), [1, 4, 5]);
});

test("the heard list keeps the best score and counts", () => {
  let list = addHeard([], [d(1, 0.6), d(2, 0.3)], 1000);
  list = addHeard(list, [d(1, 0.8)], 2000);
  assert.equal(list.length, 1);
  assert.deepEqual({ best: list[0].best, times: list[0].times, first: list[0].first }, { best: 80, times: 2, first: 1000 });
});
