import { test } from "node:test";
import assert from "node:assert/strict";
import { eventMonths, involvesHiking, parseSpeciesCounts, scavengerHunt, showNature, speciesUrl } from "./nature";

const base = { category: "Pack", starts_at: "2026-10-24T13:00:00Z", ends_at: "2026-10-24T17:00:00Z", location_name: "Patapsco Valley State Park", address: null };

test("which events get the Trail guide", () => {
  assert.equal(involvesHiking({ ...base, title: "Fall Campout", category: "Campout" }), true);
  assert.equal(involvesHiking({ ...base, title: "Den hike at Patapsco" }), true);
  assert.equal(involvesHiking({ ...base, title: "Outing", details: "We'll walk the Cascade Trail." }), true);
  assert.equal(involvesHiking({ ...base, title: "Outing" }, ["Saturday: nature hike"]), true);
  assert.equal(involvesHiking({ ...base, title: "Pinewood Derby" }), false);
  assert.equal(involvesHiking({ ...base, title: "Hike", location_name: null }), false, "needs a place");
  assert.equal(involvesHiking({ ...base, title: "Hike planning", leaders_only: true }), false);
  assert.equal(involvesHiking({ ...base, title: "Hikers' bake sale" }), false);
});

test("when it shows, and which months", () => {
  const start = Date.parse(base.starts_at);
  assert.equal(showNature(base, start - 31 * 86400000), false);
  assert.equal(showNature(base, start - 29 * 86400000), true);
  assert.equal(showNature(base, Date.parse(base.ends_at) + 1000), false);
  assert.deepEqual(eventMonths({ starts_at: "2026-10-30T22:00:00Z", ends_at: "2026-11-01T16:00:00Z" }), [10, 11]);
  assert.match(speciesUrl({ lat: 39.27, lon: -76.8 }, "Aves", [10, 11]), /iconic_taxa=Aves.*month=10%2C11/);
});

test("reading iNaturalist's species counts", () => {
  const list = parseSpeciesCounts({
    results: [
      { count: 120, taxon: { id: 9083, name: "Cardinalis cardinalis", preferred_common_name: "northern cardinal", default_photo: { square_url: "https://inaturalist-open-data.s3.amazonaws.com/photos/1/square.jpg", attribution: "(c) A, some rights reserved (CC BY-NC)" } } },
      { count: 5, taxon: { id: 2, name: "Quercus alba", default_photo: { square_url: "https://evil.example/x.jpg" } } },
      { count: 1, taxon: { name: "no id" } },
    ],
  });
  assert.equal(list.length, 2);
  assert.equal(list[0].name, "Northern cardinal");
  assert.equal(list[0].url, "https://www.inaturalist.org/taxa/9083");
  assert.equal(list[1].name, "Quercus alba");
  assert.equal(list[1].photo, null, "photos only from iNaturalist");
  assert.deepEqual(parseSpeciesCounts({}), []);
});

test("a heard bird's photo: only an exact name match", async () => {
  const { parseTaxonPhoto, taxonUrl } = await import("./nature");
  assert.match(taxonUrl("Cardinalis cardinalis"), /taxa\?q=Cardinalis\+cardinalis&rank=species/);
  const json = {
    results: [
      { id: 1, name: "Cardinalis sinuatus", default_photo: { medium_url: "https://inaturalist-open-data.s3.amazonaws.com/photos/9/medium.jpg" } },
      { id: 9083, name: "Cardinalis cardinalis", default_photo: { medium_url: "https://inaturalist-open-data.s3.amazonaws.com/photos/1/medium.jpg", attribution: "(c) A (CC BY-NC)" } },
    ],
  };
  assert.deepEqual(parseTaxonPhoto(json, "Cardinalis cardinalis"), {
    photo: "https://inaturalist-open-data.s3.amazonaws.com/photos/1/medium.jpg",
    credit: "(c) A (CC BY-NC)",
    url: "https://www.inaturalist.org/taxa/9083",
  });
  assert.deepEqual(parseTaxonPhoto({ results: [] }, "Nope nope"), { photo: null, credit: null, url: null });
});

test("scavenger hunt: fall events only", () => {
  assert.equal(scavengerHunt({ starts_at: "2026-10-23T22:00:00Z", ends_at: "2026-10-25T14:00:00Z" })?.items.length, 12);
  assert.equal(scavengerHunt({ starts_at: "2026-08-30T14:00:00Z", ends_at: "2026-09-01T14:00:00Z" })?.title, "Fall scavenger hunt");
  assert.equal(scavengerHunt({ starts_at: "2026-06-12T14:00:00Z", ends_at: null }), null);
});
