import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Two of the three cards explaining the product opened onto a lock.
 *
 * /app is a DOOR. To a visitor who has not signed in it offers exactly two
 * things — enter a code from your travel adviser, or log in — and both cards
 * pointed at it. So "See the app", on the page selling the app, showed a code
 * field; and "Open your inbox" showed the same client-code door rather than an
 * inbox. A buyer clicking either learned nothing and was asked for a
 * credential they do not have.
 */
describe("the homepage cards open onto the thing they name", () => {
  const HOME = readFileSync("components/ItinerariesHome.tsx", "utf8");

  it("'See the app' opens the public demonstration", () => {
    const card = HOME.slice(HOME.indexOf('title: "Hand it over"'), HOME.indexOf('title: "Stay in touch"'));
    assert.match(card, /href: "\/app\/preview"/, "'See the app' still opens the code-and-login door");
  });

  it("'Open your inbox' goes to sign-in, carrying where it was headed", () => {
    // There is no public inbox and there should not be — it holds real client
    // conversations. Sign-in is the honest door, and it returns them to /app.
    const card = HOME.slice(HOME.indexOf('title: "Stay in touch"'));
    assert.match(card, /href: "\/login\?next=%2Fapp"/);
  });

  it("the demonstration it points at exists and is public", () => {
    const preview = readFileSync("app/app/preview/page.tsx", "utf8");
    assert.match(preview, /COMPANION_DEMO_TRIP/);
    assert.match(preview, /previewAsClient: true/, "the demo would show controls no client has");
  });
});

describe("the preview page says what it is", () => {
  const PREVIEW = readFileSync("app/app/preview/page.tsx", "utf8");

  it("has a heading of its own", () => {
    /**
     * It had none. Everything under the banner is the app's own interface,
     * which opens on a date and a city, so the headings a screen reader was
     * offered were the sample trip's days — nothing saying what the page is.
     */
    assert.match(PREVIEW, /<h1 className=/);
    assert.match(PREVIEW, />\s*A sample client trip\s*</);
  });

  it("says in words what the phone is showing", () => {
    // A buyer looking at a 402px phone on a wide screen would otherwise have
    // to tap through somebody else's week to learn the product has these.
    for (const line of ["Today's schedule", "The map", "travel wallet", "Messages with their advisor", "Flight times", "no signal"]) {
      assert.ok(PREVIEW.includes(line), `the preview does not mention ${line}`);
    }
  });

  it("still announces itself as a sample above the app", () => {
    // Every screen below is a picture of somebody's private trip. A demo that
    // does not say so invites the reading that these are real people.
    assert.match(PREVIEW, /Sample<\/span>/);
    assert.match(PREVIEW, /a made-up family, a made-up advisor/);
  });
});
