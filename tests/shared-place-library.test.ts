import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { attractions } from "@/data/attractions";
import { expandedAttractions } from "@/data/expanded-attractions";
import { searchAttractions } from "@/lib/attraction-search";
describe("shared destination library in the itinerary picker", () => {
  it("ships the same source-backed additional places without duplicate identifiers", () => {
    assert.ok(expandedAttractions.length >= 70);
    assert.equal(new Set(attractions.map(a => a.slug)).size, attractions.length);
    for (const place of expandedAttractions) {
      assert.ok(place.coordinates?.split(",").map(Number).every(Number.isFinite));
      assert.ok(place.sourceUrl.startsWith("https://en.wikipedia.org/"));
    }
  });
  it("finds new cities and common country names in the actual picker", async () => {
    for (const city of ["Seoul", "Valletta", "Taipei", "Luxembourg City"]) {
      const found = await searchAttractions(city, 30);
      assert.ok(found.some(p => p.city === city), city);
    }
    assert.ok((await searchAttractions("USA", 100)).some(p => p.country === "United States"));
  });
  it("keeps Iceland map and itinerary positions west of Greenwich", () => {
    for (const place of attractions.filter(a => a.country === "Iceland")) {
      if (place.coordinates) assert.ok(Number(place.coordinates.split(",")[1]) < 0, place.name);
    }
  });
});
