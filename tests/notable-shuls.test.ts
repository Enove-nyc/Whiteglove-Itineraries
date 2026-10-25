import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { notableShuls } from "../data/notable-shuls";
import { notableShulListings, listPublishedShuls } from "../lib/shuls";
import { coordinatesToPoint } from "../data/route-utils";

// The worldwide shuls are the parallel to the worldwide attractions, and carry
// the same duty of care: a real place, a real source, and nothing promised
// about a minyan running on the day somebody turns up.

describe("the notable shuls are real, sourced places", () => {
  it("gives every shul a source and a navigable coordinate", () => {
    for (const shul of notableShuls) {
      assert.ok(shul.sourceUrl.startsWith("http"), `${shul.slug} has no source`);
      const point = coordinatesToPoint(shul.coordinates);
      assert.ok(point, `${shul.slug}: "${shul.coordinates}" cannot be parsed`);
      assert.ok(point.lat !== 0 || point.lng !== 0, `${shul.slug} points at Null Island`);
      assert.ok(shul.city.trim() && shul.country.trim(), `${shul.slug} has no place`);
      assert.ok(shul.href.trim().length > 0, `${shul.slug} has no link`);
    }
  });

  it("uses unique slugs", () => {
    const slugs = notableShuls.map((s) => s.slug);
    assert.equal(new Set(slugs).size, slugs.length);
  });

  it("stores no opening hours — a shul's zmanim change", () => {
    for (const shul of notableShuls) {
      assert.ok(!("hours" in shul), `${shul.slug} stores hours`);
    }
  });
});

describe("the notable shuls reach the directory", () => {
  it("maps every sourced shul into a listing", () => {
    assert.equal(notableShulListings().length, notableShuls.length);
  });

  it("appears in the published list so the map and the directory can plot it", async () => {
    const published = await listPublishedShuls();
    for (const shul of notableShuls) {
      assert.ok(
        published.some((listing) => listing.name === shul.name && listing.city === shul.city),
        `${shul.slug} did not survive into the published shul list`,
      );
    }
  });

  /**
   * THE CARD'S OWN LINK — and so the map marker's "Open page" — STAYS ON
   * THIS SITE, never the shul's outside site or the source it was listed
   * from. data/notable-shuls.ts still carries its own `href` (the outside
   * site, for checking current hours), but a card's primary link opening a
   * different company's page — the owner's words — is exactly what this
   * guards against. The website, where one exists, is still reachable as its
   * own separate link.
   */
  it("links each listing to its own row on /shuls, never out to its data href", () => {
    for (const listing of notableShulListings()) {
      assert.equal(listing.href, `/shuls#${listing.id}`);
      assert.ok(!listing.href.startsWith("http"), `${listing.id} still links out: ${listing.href}`);
    }
  });
});
