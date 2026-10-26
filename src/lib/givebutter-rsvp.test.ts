import { test } from "node:test";
import assert from "node:assert/strict";
import { eatersFor, placesInOrder, sameName, siblingAges, siblingGroup, splitTickets, splitTicketsDetail } from "./givebutter-rsvp";

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

test("which scouts were counted: by name, then the rest in roster order", () => {
  assert.deepEqual(splitTicketsDetail(["Bo", "Pat"], ["Ash", "Bo"], [["Pat"]]).scoutIdx, [1]);
  assert.deepEqual(splitTicketsDetail(["Bo", null], ["Ash", "Bo", "Cy"], [["Pat"]]).scoutIdx, [0, 1]);
  assert.deepEqual(splitTicketsDetail([null, null], [], [["Pat"]]).scoutIdx, []);
});

test("siblings' ages from a sign-up answer", () => {
  const q = "Siblings' ages";
  assert.deepEqual(siblingAges([{ question: q, answer: "7 and 4" }]), [7, 4]);
  assert.deepEqual(siblingAges([{ question: q, answer: "Emma (7), Jack 3" }]), [7, 3]);
  assert.deepEqual(siblingAges([{ question: "How old are the brothers or sisters coming?", answer: "18 months" }]), [0]);
  assert.deepEqual(siblingAges([{ question: q, answer: "none" }]), []);
  assert.deepEqual(siblingAges([{ question: "How many siblings?", answer: "2" }]), [], "a count, not ages");
  assert.deepEqual(siblingAges([{ question: "Scout's age", answer: "8" }]), [], "not a sibling question");
  assert.deepEqual(siblingAges([{ question: q, answer: "Mom is 40, Sam 5" }]), [5], "adults' ages are left out");
});

test("sibling age groups", () => {
  assert.equal(siblingGroup(2), "sib_0_3");
  assert.equal(siblingGroup(4), "sib_4_6");
  assert.equal(siblingGroup(9), "sib_7_9");
  assert.equal(siblingGroup(12), "sib_10_12");
  assert.equal(siblingGroup(15), "sib_13_up");
  assert.equal(siblingGroup(null), "sib");
});

test("who a family is bringing, by group", () => {
  assert.deepEqual(eatersFor({ scouts: 2, siblings: 2, adults: 2 }, ["bear", "lion"], [3]), {
    adult: 2,
    bear: 1,
    lion: 1,
    sib_0_3: 1,
    sib: 1,
  });
  assert.deepEqual(eatersFor({ scouts: 1, siblings: 0, adults: 1 }, [], []), { adult: 1, scout: 1 }, "a scout not on the roster");
  assert.deepEqual(eatersFor({ scouts: 1, siblings: 0, adults: 0 }, ["aol"], []), { aol: 1 });
});
