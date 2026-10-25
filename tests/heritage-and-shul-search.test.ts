import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSearchIndex } from "@/lib/site-search-index";
import { searchSite } from "@/lib/site-search";

/**
 * "GIBRALTAR" FOUND NOTHING, AND THE SITE HOLDS THE ANSWER.
 *
 * The two batei hachaim (data/heritage-cemeteries.ts, the Nesiya Tova locator
 * set) and the notable shul (data/notable-shuls.ts) were never read into the
 * search index — the same shape of bug as the mikvaos fix this file already
 * records ("mikvah london" finding nothing). The index itself was fine;
 * these two sources were simply never pushed into it. Three more Gibraltar
 * shuls were added alongside the fix (Nefusot Yehuda, the Little Synagogue,
 * Abudarham — all four of Gibraltar's working shuls now, sourced from
 * Wikipedia), so the count here is six, not the three the bug report named.
 */
describe("the search box covers the Nesiya Tova cemeteries and the notable shuls", () => {
  it("every one of Gibraltar's batei hachaim and shuls is indexed", async () => {
    const docs = await buildSearchIndex();
    const gibraltar = docs.filter((d) => d.country === "Gibraltar");
    assert.equal(gibraltar.length, 6, `expected 6 Gibraltar documents, found ${gibraltar.length}: ${gibraltar.map((d) => d.id).join(", ")}`);
    assert.equal(gibraltar.filter((d) => d.kind === "Beis hachaim").length, 2);
    assert.equal(gibraltar.filter((d) => d.kind === "Practical travel").length, 4);
  });

  it("none of them links out — the map's \"Open page\" and a search result open this site", async () => {
    const docs = await buildSearchIndex();
    for (const doc of docs.filter((d) => d.country === "Gibraltar")) {
      assert.ok(!doc.href.startsWith("http"), `${doc.id} links out: ${doc.href}`);
    }
  });

  it("searching \"gibraltar\" actually returns them", async () => {
    const { results } = await searchSite("gibraltar", 20);
    const gibraltar = results.filter((r) => r.subtitle.includes("Gibraltar"));
    assert.ok(gibraltar.length >= 6, `expected at least 6 Gibraltar results, got ${gibraltar.length}`);
  });
});
