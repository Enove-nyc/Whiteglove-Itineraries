import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { buildSearchIndex } from "@/lib/site-search-index";
import { vacationEmptySuggestions } from "@/lib/site-search";
import { isGuidePath } from "@/lib/guide-paths";

/**
 * ONE SHARED SEARCH INDEX, TWO RESULT SETS.
 *
 * The database behind global search is genuinely shared — nothing here
 * prunes it, and it should not: nobody sees the index, only the results a
 * search returns (the owner's own words). What differs per brand is which
 * results are allowed to surface at all, and where they point.
 *
 * On the itineraries brand: kosher food and heritage (kevarim, batei
 * hachaim, tzaddikim) never appear — that content, and the guide pages
 * behind it, are the kosher site's alone. Everything else stays, INCLUDING
 * destinations, stays and things to do that happen to be kosher-relevant
 * (a seasonal programme, a walkable-to-shul neighbourhood) — dropping those
 * too was explicitly not what was asked for. And every kept result's href is
 * rewritten off the guide-only pages this domain 410s on (lib/guide-paths.ts)
 * and onto the one page this product actually has: the planner.
 */
describe("global search on the itineraries brand", () => {
  const original = process.env.NEXT_PUBLIC_SITE_BRAND;
  before(() => {
    process.env.NEXT_PUBLIC_SITE_BRAND = "itineraries";
  });
  after(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_BRAND;
    else process.env.NEXT_PUBLIC_SITE_BRAND = original;
  });

  it("carries no kosher food or heritage results", async () => {
    const docs = await buildSearchIndex();
    assert.ok(docs.length > 0, "the index should not be empty");
    for (const doc of docs) {
      assert.notEqual(doc.section, "Kosher travel", `${doc.id} is Kosher travel`);
      assert.notEqual(doc.section, "Heritage", `${doc.id} is Heritage`);
    }
  });

  it("still carries destinations, stays and things to do", async () => {
    const docs = await buildSearchIndex();
    const sections = new Set(docs.map((d) => d.section));
    assert.ok(sections.has("Vacation"), "Vacation destinations should still be searchable");
    assert.ok(sections.has("Things to do"), "Things to do should still be searchable");
  });

  it("no surviving result points at a page this domain 410s on", async () => {
    const docs = await buildSearchIndex();
    for (const doc of docs) {
      assert.ok(!isGuidePath(doc.href), `${doc.id} still links the guide-only page ${doc.href}`);
    }
  });

  it("a destination whose own guide link was dropped opens the planner instead", async () => {
    const docs = await buildSearchIndex();
    const vacation = docs.filter((d) => d.kind === "Vacation destination");
    assert.ok(vacation.length > 0, "at least one vacation destination should still be indexed");
    for (const doc of vacation) assert.equal(doc.href, "/itinerary");
  });

  it("the empty-focus suggestions get the same href rewrite", () => {
    const hits = vacationEmptySuggestions();
    assert.ok(hits.length > 0);
    for (const hit of hits) assert.equal(hit.href, "/itinerary");
  });
});

describe("global search off the itineraries brand is unchanged", () => {
  const original = process.env.NEXT_PUBLIC_SITE_BRAND;
  before(() => {
    delete process.env.NEXT_PUBLIC_SITE_BRAND;
  });
  after(() => {
    if (original !== undefined) process.env.NEXT_PUBLIC_SITE_BRAND = original;
  });

  it("still carries kosher food and heritage results", async () => {
    const docs = await buildSearchIndex();
    const sections = new Set(docs.map((d) => d.section));
    assert.ok(sections.has("Kosher travel"));
    assert.ok(sections.has("Heritage"));
  });

  it("vacation destinations keep their real guide links", () => {
    const hits = vacationEmptySuggestions();
    assert.ok(hits.length > 0);
    assert.ok(hits.every((h) => h.href.startsWith("/destinations/")));
  });
});
