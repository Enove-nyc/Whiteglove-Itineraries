import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { COMPANION_DEMO_TRIP } from "@/data/companion-demo";

/**
 * SOMEBODY DECIDING WHETHER TO PAY FOR THE APP CAN SEE THE APP.
 *
 * /app used to offer two doors — a code field and a login button — and both
 * are for people who already have it. The product three plans are sold on was
 * invisible to every buyer, and two separate audits said so in the same week.
 * A demo trip was already in the repository and already the component's own
 * default, used for nothing.
 */

const PREVIEW = readFileSync("app/app/preview/page.tsx", "utf8");
const FRONT = readFileSync("app/app/page.tsx", "utf8");

describe("the sample client trip", () => {
  it("is offered on the front door, beside the code field", () => {
    assert.match(FRONT, /href="\/app\/preview"/, "nothing on /app points at the preview");
  });

  it("says it is a sample, in words, before the app starts", () => {
    // Every screen below the banner is a picture of somebody's private trip.
    // A demo that does not announce itself invites the reading that these are
    // real people — or that a real client's trip is on a public page.
    const banner = PREVIEW.slice(0, PREVIEW.indexOf("<CompanionApp"));
    assert.match(banner, /Sample/, "the demo does not identify itself above the app");
    assert.match(banner, /made-up/);
  });

  it("shows made-up people, not anybody's trip", () => {
    // Asserted against the data rather than the page, because the page's
    // claim is only true while this stays synthetic.
    assert.equal(COMPANION_DEMO_TRIP.advisorName, "Miriam Feldman");
    assert.match(COMPANION_DEMO_TRIP.family, /Cohen/);
    assert.doesNotMatch(PREVIEW, /getTrips|getCurrentAccountSummary|cookies\(\)/, "the preview reads real account data");
  });

  it("is kept out of search results", () => {
    // /app is the page that should rank for this. A second page on the same
    // subject with none of the explanation would compete with it.
    assert.match(PREVIEW, /noIndex: true/);
  });

  it("shows the client's side, not the advisor's", () => {
    // advisorInbox lists every client's chat. On a public page it would be a
    // demonstration of the wrong half of the product.
    // The prop form, not the word: the page's own comment explains why it is
    // absent, and a bare name match would fail on the explanation.
    assert.doesNotMatch(PREVIEW, /advisorInbox=/);
  });
});
