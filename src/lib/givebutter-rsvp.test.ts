import { test } from "node:test";
import assert from "node:assert/strict";
import { sameName, splitTickets } from "./givebutter-rsvp";

test("names: exact, nicknames and first three letters", () => {
  assert.equal(sameName("Chris", "Christopher"), true);
  assert.equal(sameName("Anne", "annie"), true);
  assert.equal(sameName("Al", "Alex"), false);
  assert.equal(sameName("", "Sam"), false);
});

test("scouts, adults and siblings by name", () => {
  // Parent Pat, scout Sam, and a little brother Leo who isn't a scout.
  assert.deepEqual(splitTickets(["Pat", "Sam", "Leo"], ["Sam"], [["Pat"]]), { scouts: 1, siblings: 1, adults: 1 });
});

test("an exact name wins over a look-alike", () => {
  // Scout Jordan and a sister Jordyn: Jordyn must not take Jordan's place.
  assert.deepEqual(splitTickets(["Jordyn", "Jordan", "Kim"], ["Jordan"], [["Kim"]]), { scouts: 1, siblings: 1, adults: 1 });
});

test("all tickets under the buyer's name: scouts first, then adults", () => {
  assert.deepEqual(splitTickets(["Robin", "Robin", "Robin"], ["Ash"], [["Robin"], ["Lee"]]), { scouts: 1, siblings: 0, adults: 2 });
  assert.deepEqual(splitTickets([null, "", "Robin"], ["Ash", "Bo"], [["Robin"]]), { scouts: 2, siblings: 0, adults: 1 });
});

test("an adult's other name or nickname counts", () => {
  assert.deepEqual(splitTickets(["Liz", "Max"], ["Max"], [["Elizabeth", "Liz"]]), { scouts: 1, siblings: 0, adults: 1 });
});
