import { test } from "node:test";
import assert from "node:assert/strict";

import { homeSuggestions, type AdventureProgress, type CatalogAdventure, type RankProgress } from "./advancement";

const adv = (name: string, required: boolean, o: Partial<AdventureProgress> = {}): AdventureProgress => ({
  name, required, special: false, home: "home", idea: `Try ${name} at home`, url: null,
  reqCount: 4, reqsDone: 0, done: false, approved: false, completedOn: null, ...o,
});
const cat = (name: string, required: boolean, home: CatalogAdventure["home"] = "home"): CatalogAdventure => ({
  rank: "wolf", name, required, req_count: 4, special: false, sort_order: 0, home, home_idea: `Try ${name} at home`,
});
const progress = (o: Partial<RankProgress>): RankProgress => ({
  rank: "wolf", earned: null, required: [], electives: [], requiredDone: 0, electivesDone: 0, percent: 0, ...o,
});
const catalog = [cat("Running With the Pack", true), cat("Paws on the Path", true), cat("Germs Alive!", false), cat("Spirit of the Water", false, "den")];

test("try at home suggests electives only, never required adventures", () => {
  const p = progress({ required: [adv("Running With the Pack", true), adv("Paws on the Path", true)] });
  const names = homeSuggestions(p, catalog).map((a) => a.name);
  assert.deepEqual(names, ["Germs Alive!"]);
  assert.ok(homeSuggestions(p, catalog).every((a) => !a.required));
});

test("a started elective comes first; den-only electives aren't suggested", () => {
  const p = progress({ electives: [adv("Spirit of the Water", false, { home: "den", reqsDone: 1 }), adv("Code of the Wolf", false, { reqsDone: 2 })] });
  assert.deepEqual(homeSuggestions(p, catalog).map((a) => a.name), ["Code of the Wolf", "Germs Alive!"]);
});

test("nothing to try at home once the electives are done", () => {
  const p = progress({ required: [adv("Paws on the Path", true)], electivesDone: 2 });
  assert.deepEqual(homeSuggestions(p, catalog), []);
});
