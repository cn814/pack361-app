import { test } from "node:test";
import assert from "node:assert/strict";
import { placesInOrder, sameName, splitTickets } from "./givebutter-rsvp";

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

test("places: tickets, or the camping fee items for an event sign-up", () => {
  const fee = (quantity: number) => ({ type: "item", description: "Camping Fee for Kids Ages 4+ and Adults", quantity });
  const processing = { type: "donation", description: "Processing fee", quantity: 1 };
  assert.equal(placesInOrder([{ type: "ticket", description: "Adult", quantity: 2 }, processing], true), 2);
  assert.equal(placesInOrder([fee(3), processing], true), 3);
  assert.equal(placesInOrder([fee(3)], false), 0, "a store order isn't a head count");
  assert.equal(placesInOrder([{ type: "item", description: "Donation", quantity: 1 }], true), 0);
});
