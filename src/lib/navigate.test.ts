import { test } from "node:test";
import assert from "node:assert/strict";
import { appleDirections, googleDirections, navDestination } from "./navigate";

test("navigates to the address, else the place name", () => {
  assert.equal(navDestination({ address: "3500 Centennial Ln, Ellicott City, MD", location_name: "School" }), "3500 Centennial Ln, Ellicott City, MD");
  assert.equal(navDestination({ address: null, location_name: "Broad Creek Memorial Scout Reservation" }), "Broad Creek Memorial Scout Reservation");
  assert.equal(navDestination({ address: " ", location_name: null }), null);
});

test("not for online meetings", () => {
  assert.equal(navDestination({ location_name: "Zoom" }), null);
  assert.equal(navDestination({ location_name: "Google Meet" }), null);
  assert.equal(navDestination({ location_name: "Online" }), null);
  assert.equal(navDestination({ location_name: "https://meet.google.com/abc" }), null);
});

test("direction links", () => {
  assert.equal(googleDirections("A & B"), "https://www.google.com/maps/dir/?api=1&destination=A%20%26%20B");
  assert.equal(appleDirections("A & B"), "https://maps.apple.com/?daddr=A%20%26%20B");
});
