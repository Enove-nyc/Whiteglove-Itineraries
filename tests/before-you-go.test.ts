import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { beforeYouGo, checkedLine } from "@/lib/before-you-go";

describe("which countries get a card", () => {
  it("gives the three official pages for a country the site holds sources for", () => {
    const [poland] = beforeYouGo(["Poland"]);
    assert.equal(poland.country, "Poland");
    assert.deepEqual(poland.links.map((l) => l.label), ["Entry requirements", "Safety advisory", "Health guidance"]);
    for (const link of poland.links) assert.match(link.href, /^https:\/\//);
  });

  it("SAYS NOTHING for a country it holds no official page for", () => {
    // Guessing an entry-requirements page for somewhere the site knows nothing
    // about is the one wrong answer here.
    assert.deepEqual(beforeYouGo(["Narnia"]), []);
    assert.deepEqual(beforeYouGo([]), []);
    assert.deepEqual(beforeYouGo(["", "   "]), []);
  });

  it("matches however the country was typed on the stop", () => {
    assert.equal(beforeYouGo(["poland"])[0]?.country, "Poland");
    assert.equal(beforeYouGo(["  ISRAEL  "])[0]?.country, "Israel");
  });

  it("lists each country once, in the order the trip reaches them", () => {
    const out = beforeYouGo(["Israel", "Poland", "Israel"]);
    assert.deepEqual(out.map((c) => c.country), ["Israel", "Poland"]);
  });

  it("carries the country's own caveat when there is one", () => {
    assert.match(beforeYouGo(["Ukraine"])[0]?.note ?? "", /change frequently/i);
    assert.equal(beforeYouGo(["Poland"])[0]?.note, undefined);
  });

  it("the health link is derived from the country already on record", () => {
    // A URL pattern, not a second list to keep in step — and never offered for
    // a country that is not in COUNTRY_DOCS.
    const health = beforeYouGo(["Czechia"])[0].links.find((l) => l.label === "Health guidance");
    assert.match(health!.href, /wwwnc\.cdc\.gov\/travel\/destinations\/traveler\/none\/czechia$/);
  });
});

describe("what the card claims", () => {
  it("dates the FEED, not the government pages", () => {
    // White Glove reads the advisory feed. It does not read the entry-rules
    // page, so claiming a check on that would be a claim it cannot support.
    assert.equal(checkedLine("2026-08-31T09:00:00.000Z"), "Checked 31 Aug · Official sources");
  });

  it("goes undated rather than showing a stale date", () => {
    assert.equal(checkedLine(undefined), "Official sources");
    assert.equal(checkedLine("whenever"), "Official sources");
  });

  it("says outright that White Glove has not checked entry rules", () => {
    const card = readFileSync("components/BeforeYouGo.tsx", "utf8");
    assert.match(card, /White Glove does not check entry rules for you/);
    assert.match(card, /depend on your passport and\s*\n?\s*change without notice/);
  });

  it("states no requirement of its own — every line is a link out", () => {
    const card = readFileSync("components/BeforeYouGo.tsx", "utf8");
    for (const phrase of ["visa required", "you must", "you will need", "no visa", "vaccination required"]) {
      assert.ok(!card.toLowerCase().includes(phrase), `the card states a rule of its own: ${phrase}`);
    }
  });

  it("renders nothing when there is nothing to say", () => {
    assert.match(readFileSync("components/BeforeYouGo.tsx", "utf8"), /if \(guidance\.length === 0\) return null;/);
  });
});

describe("it is on the trip overview, in both products", () => {
  it("is rendered on the command centre", () => {
    const page = readFileSync("app/command-center/page.tsx", "utf8");
    assert.match(page, /<BeforeYouGo/);
    assert.match(page, /<TripAdvisories/);
  });

  it("has a country to work from — StopFacts.country is actually populated", () => {
    // Declared for months and never filled, which would have made every trip
    // look like it went nowhere.
    assert.match(readFileSync("lib/command-center-data.ts", "utf8"), /activity\.country\?\.trim\(\)/);
  });
});
