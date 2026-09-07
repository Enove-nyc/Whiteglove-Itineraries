import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { SITE_SEARCH_PLACEHOLDER, siteSearchPlaceholder } from "@/lib/site-search-labels";

/**
 * THE ITINERARIES PRODUCT DOES NOT DESCRIBE ITSELF AS A KOSHER ONE.
 *
 * AGENTS.md has said since the two products were separated that White Glove
 * Itineraries is general travel and "must not be described as one". The guide
 * paths are redirected off that domain and every kosher page answers 410
 * there, so the routes were right — but three strings the two sites SHARE
 * carried the guide's language onto the itineraries domain unchanged, and two
 * of them were live and indexable:
 *
 *   • /search's box said "Search destinations, places to stay, kosher food".
 *   • /assistant said "a kever, kosher food" in its heading paragraph and in
 *     the meta description a search engine quotes.
 *   • the advisor's content library said "a shul, a kosher eatery".
 *
 * A path test cannot catch these — the pages are the itineraries product's
 * own and must stay — so this is a copy test, and it reads the source rather
 * than rendering, the same way the other brand tests in this repository do.
 *
 * WHAT IT DOES NOT FORBID. The kosher wording is still correct on the kosher
 * brand and must survive there, so every case below checks BOTH halves: the
 * itineraries branch says nothing kosher, and the kosher branch still does.
 * A "fix" that simply deleted the words would fail this test, which is the
 * point — one codebase serves both, and neutering it serves neither.
 */

const KOSHER_WORDS = /kosher|kashrus|shabbos|shabbat|mikva|kever|kevarim|shul|hechsher|glatt|cholov|minyan/i;

/** Comments explain the split and are allowed to name what they are about. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("the search box asks in the language of the site asking", () => {
  it("names no kosher subject on the itineraries brand", () => {
    assert.doesNotMatch(siteSearchPlaceholder(true), KOSHER_WORDS);
  });

  it("still names kosher food on the guide, where it is the point", () => {
    assert.match(siteSearchPlaceholder(false), /kosher food/i);
    assert.equal(siteSearchPlaceholder(false), SITE_SEARCH_PLACEHOLDER);
  });

  it("invites the visitor either way rather than going blank", () => {
    for (const itineraries of [true, false]) {
      const text = siteSearchPlaceholder(itineraries);
      assert.match(text, /^Search /, "the box still says what it searches");
      assert.ok(text.length > 30);
    }
  });

  it("is chosen where the brand is known, not baked into a prop default", () => {
    // The default parameter was the bug: it froze the guide's wording into
    // every mount of the box, on both domains.
    const src = code("components/DestinationSearch.tsx");
    assert.match(src, /siteSearchPlaceholder\(itineraries\)/);
    assert.doesNotMatch(src, /placeholder = SITE_SEARCH_PLACEHOLDER/);
  });
});

describe("the assistant page describes the product it is on", () => {
  const src = code("app/assistant/page.tsx");

  it("has an itineraries description with no kosher subject in it", () => {
    const itin = src.match(/"Ask about a destination, somewhere to stay[^"]*"/);
    assert.ok(itin, "the itineraries description should exist");
    assert.doesNotMatch(itin[0], KOSHER_WORDS);
  });

  it("keeps the guide's own description, kever and all", () => {
    assert.match(src, /"Ask about a destination, a kever, kosher food[^"]*"/);
  });

  it("chooses by brand rather than showing one to both", () => {
    assert.match(src, /brand === "itineraries"/);
    assert.match(src, /itineraries\s*\n?\s*\?\s*"Ideas for a destination, somewhere to stay/);
  });
});

describe("the advisor's content library searches in neutral words", () => {
  const src = code("components/LibraryManager.tsx");

  it("offers a hotel and an attraction on the itineraries brand", () => {
    const itin = src.match(/"Search White Glove's own listings — a hotel[^"]*"/);
    assert.ok(itin, "the itineraries placeholder should exist");
    assert.doesNotMatch(itin[0], KOSHER_WORDS);
  });

  it("still offers a shul and a kosher eatery on the guide", () => {
    assert.match(src, /"Search White Glove's own listings — a shul, a kosher eatery[^"]*"/);
  });

  it("reads the brand rather than guessing from the page it is on", () => {
    assert.match(src, /useIsItineraries\(\)/);
  });
});
