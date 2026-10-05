import { test } from "node:test";
import assert from "node:assert/strict";
import { identifyUrl, parsePlantResults } from "./plant-id";

test("the identify request", () => {
  const u = new URL(identifyUrl("k3y"));
  assert.equal(u.origin + u.pathname, "https://my-api.plantnet.org/v2/identify/all");
  assert.equal(u.searchParams.get("api-key"), "k3y");
  assert.equal(u.searchParams.get("include-related-images"), "true");
});

test("reading Pl@ntNet's matches", () => {
  const list = parsePlantResults({
    results: [
      {
        score: 0.81,
        species: { scientificNameWithoutAuthor: "Toxicodendron radicans", commonNames: ["eastern poison ivy", "poison ivy"], family: { scientificNameWithoutAuthor: "Anacardiaceae" } },
        gbif: { id: "2928778" },
        images: [{ url: { m: "https://bs.plantnet.org/image/m/abc", s: "https://bs.plantnet.org/image/s/abc" }, citation: "Jane Doe / Pl@ntNet, cc-by-sa" }],
      },
      { score: 0.09, species: { scientificNameWithoutAuthor: "Parthenocissus quinquefolia" }, images: [{ url: { m: "https://evil.example/x.jpg" } }] },
      { score: 0.01, species: { scientificNameWithoutAuthor: "Too unlikely" } },
      { score: 0.5, species: {} },
    ],
  });
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], {
    name: "Eastern poison ivy",
    scientific: "Toxicodendron radicans",
    family: "Anacardiaceae",
    percent: 81,
    photo: "https://bs.plantnet.org/image/m/abc",
    credit: "Jane Doe / Pl@ntNet, cc-by-sa",
    url: "https://www.gbif.org/species/2928778",
  });
  assert.equal(list[1].name, "Parthenocissus quinquefolia");
  assert.equal(list[1].photo, null, "photos only from Pl@ntNet");
  assert.deepEqual(parsePlantResults({ statusCode: 404 }), []);
});
