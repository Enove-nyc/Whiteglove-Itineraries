import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * The hero asks who is reading it.
 *
 * IT SPOKE TO ONE OF THE TWO AUDIENCES and only one — "The trip you plan, in
 * your client's pocket", "One link per client" — so somebody planning a single
 * trip of their own, which is a plan this product sells at a one-time fee,
 * read a page about running clients and had to work out for themselves that it
 * was also for them. The self-service doors are several screens below.
 */

const AUDIENCE = readFileSync("components/HomeAudience.tsx", "utf8");
const HOME = readFileSync("components/ItinerariesHome.tsx", "utf8");

describe("the two audiences are both addressed", () => {
  it("offers the choice", () => {
    assert.match(AUDIENCE, /Planning trips for clients/);
    assert.match(AUDIENCE, /Planning my own trip/);
    assert.match(HOME, /<HomeAudience \/>/);
  });

  it("asks it as one question with two answers", () => {
    // Radios, not buttons: a screen reader should be told this is a choice and
    // which one is currently made.
    assert.match(AUDIENCE, /<fieldset/);
    assert.match(AUDIENCE, /<legend className="sr-only">Who are you planning for\?<\/legend>/);
    assert.match(AUDIENCE, /type="radio"/);
    assert.match(AUDIENCE, /name="audience"/);
    // The label is the control — no bare styled div pretending to be one.
    assert.match(AUDIENCE, /<label/);
    assert.match(AUDIENCE, /min-h-11/);
  });

  it("changes the headline, the copy and the first button — and nothing else", () => {
    const copy = AUDIENCE.slice(AUDIENCE.indexOf("const COPY"), AUDIENCE.indexOf("const CTA"));
    for (const key of ["heading", "body", "primary"]) {
      assert.ok(copy.includes(`${key}:`), `the switch does not change the ${key}`);
    }
    // The brand, the navigation and everything below the hero stay put. A page
    // that repaints itself is a page somebody stops trusting.
    assert.doesNotMatch(copy, /White Glove Itineraries|Navbar|Footer/);
  });

  it("serves the adviser by default, so that is what a crawler is given", () => {
    // The larger audience, and the one the pricing is built around. The other
    // is one press away rather than behind a guess about who arrived.
    assert.match(AUDIENCE, /useState<Audience>\("clients"\)/);
    assert.match(AUDIENCE, /clients: \{\s*\n\s*heading:\s*\n?\s*"The trip you plan, in your client's pocket\."/);
  });

  it("says something true of the self-planner", () => {
    // One Trip is a one-time fee capped at a single trip — lib/account-plans.ts
    // — so the copy must not promise a subscription's worth of anything.
    const own = AUDIENCE.slice(AUDIENCE.indexOf("own: {"), AUDIENCE.indexOf("const CTA"));
    assert.match(own, /one small fee, no subscription/);
    assert.doesNotMatch(own, /client/i, "the self-planner's copy still talks about clients");
  });
});
