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

describe("which of the two buttons needs an account", () => {
  /**
   * THE FIRST THING THIS PRODUCT SHOWED A NEW VISITOR WAS A LOGIN FORM.
   *
   * Both audiences' primary button opens /itinerary, and the planner is
   * signed-in only at the owner's word — measured on the built site,
   * /itinerary answers 307 to /login?next=%2Fitinerary. Somebody who read the
   * headline, agreed with it and pressed the button got a sign-in screen, with
   * nothing on the page having said so.
   *
   * The gate is not what changed here; the sentence is what was missing. It
   * also puts the weight on the right button, because the sample is the one to
   * look at first and it opens straight away.
   */
  it("says the planner wants signing in, and the sample does not", () => {
    const said = AUDIENCE.slice(AUDIENCE.indexOf("See a finished one"));
    assert.match(said, /signed in/);
    assert.match(said, /no account/);
  });

  it("does not call the planner itself paid, because it is not", () => {
    // A first trip is seeded for every account (withTrips in
    // lib/account-store.ts) and saving into it never goes through the plan
    // limit, so the planner is free once somebody has signed in. What a plan
    // buys is a SECOND trip and everything the app does.
    const said = AUDIENCE.slice(AUDIENCE.indexOf("See a finished one"));
    assert.match(said, /free/);
    assert.doesNotMatch(said, /\$|subscription|pay|purchase/i);
  });

  it("gives a reason for the account rather than only asking for one", () => {
    // "Sign in first" with no reason reads as a toll. Keeping the trip and
    // having it on another device is what the account is actually for.
    assert.match(AUDIENCE.slice(AUDIENCE.indexOf("See a finished one")), /keeps a trip|other devices/);
  });

  it("still leads with the planner, not the sample", () => {
    // The sentence is information, not a demotion — the primary button is
    // unchanged and still first.
    const buttons = AUDIENCE.slice(AUDIENCE.indexOf("mt-9 flex flex-wrap"));
    assert.ok(buttons.indexOf("copy.primary.href") < buttons.indexOf("/sample-itinerary"));
  });
});
