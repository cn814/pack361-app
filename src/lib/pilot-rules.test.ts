import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePilot, pilotAllows, pilotEmailAllowed } from "./pilot-rules";
import type { AppRole } from "./types";

const picked = "30000000-0000-0000-0000-00000000000a";
const other = "30000000-0000-0000-0000-00000000000b";
const on = parsePilot("on", `${picked}, not-an-id,`);

test("off: everyone is in", () => {
  const off = parsePilot("", "");
  assert.equal(pilotAllows(off, { id: other, role: "parent" }), true);
});
test("on: leaders of every kind are in", () => {
  for (const role of ["den_leader", "committee", "cubmaster", "admin"] as AppRole[]) {
    assert.equal(pilotAllows(on, { id: other, role }), true, role);
  }
});
test("on: a picked parent is in, any other parent is not", () => {
  assert.equal(pilotAllows(on, { id: picked, role: "parent" }), true);
  assert.equal(pilotAllows(on, { id: picked.toUpperCase(), role: "parent" }), true);
  assert.equal(pilotAllows(on, { id: other, role: "parent" }), false);
  assert.equal(pilotAllows(on, { id: other, role: null }), false);
});
test("only exact ids count as picked", () => {
  assert.equal(on.people.size, 1);
});
test("anything but 'on' means off", () => {
  assert.equal(parsePilot("yes", "").on, false);
  assert.equal(parsePilot(" on ", "").on, true);
});
test("emails: held for parents left out, sent to leaders, picked people and people not on the roster", () => {
  const roster = new Map([
    ["parent@example.com", { id: other, role: "parent" as AppRole }],
    ["picked@example.com", { id: picked, role: "parent" as AppRole }],
    ["leader@example.com", { id: "30000000-0000-0000-0000-00000000000c", role: "den_leader" as AppRole }],
  ]);
  assert.equal(pilotEmailAllowed(on, " Parent@Example.com", roster), false);
  assert.equal(pilotEmailAllowed(on, "picked@example.com", roster), true);
  assert.equal(pilotEmailAllowed(on, "leader@example.com", roster), true);
  assert.equal(pilotEmailAllowed(on, "new.family@example.com", roster), true);
  assert.equal(pilotEmailAllowed(parsePilot("", ""), "parent@example.com", roster), true);
});
