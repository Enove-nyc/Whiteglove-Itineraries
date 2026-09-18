import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { SAMPLE_TRIP_CODE } from "@/data/sample-itinerary";

/**
 * THE TEST CODE OPENS THE SAMPLE WEEK AS THE APP.
 *
 * Every other way into the White Glove app needs a real trip behind it — an
 * adviser creating a per-trip code for one client, or a Trip Pass spent — so
 * there was no way to simply see the app work through the code box, the way a
 * client meets it, without first manufacturing somebody's trip.
 */
const ROUTE = readFileSync("app/i/[shareId]/app/page.tsx", "utf8");

describe("the test code", () => {
  it("is 12345678", () => {
    assert.equal(SAMPLE_TRIP_CODE, "12345678");
  });

  it("cannot collide with a real share token", () => {
    // A real token is randomBytes(9).toString("base64url") — twelve url-safe
    // characters, never eight digits. That is what makes it safe for the
    // demo check to run first, before the store is asked anything.
    assert.match(readFileSync("lib/account-store.ts", "utf8"), /function shareToken\(\) \{\s*return randomBytes\(9\)\.toString\("base64url"\);/);
    assert.doesNotMatch(SAMPLE_TRIP_CODE, /[^0-9]/);
  });

  it("is answered before the store is asked, so it needs no trip and no account", () => {
    assert.match(ROUTE, /if \(shareId === SAMPLE_TRIP_CODE\) return sampleApp\(\);\s*\n\s*const shared = await getSharedItineraryByShareId\(shareId\);/);
  });

  it("opens the same itinerary /sample-itinerary prints, pinned to its first day", () => {
    const fn = ROUTE.slice(ROUTE.indexOf("async function sampleApp()"));
    assert.match(fn, /buildCompanionFromItinerary\(SAMPLE_ITINERARY, \{/);
    assert.match(fn, /today: SAMPLE_ITINERARY\.startDate,/);
  });

  it("carries no conversation — there is nobody on the other end", () => {
    // The rule for every code without a second person behind it. CompanionApp
    // draws the Messages tab, its badge and its polling from the chat prop
    // alone, so passing none removes all of them together.
    const fn = ROUTE.slice(ROUTE.indexOf("async function sampleApp()"));
    assert.match(fn, /<CompanionApp trip=\{trip\} \/>/);
    assert.doesNotMatch(fn, /chat=/);
  });

  it("is not remembered, so the app does not keep reopening it", () => {
    // A real code is written to a cookie by ClientCodeMemory so a client's app
    // reopens their trip. A code typed once to look at the app must not become
    // what the app opens for the next six months.
    const fn = ROUTE.slice(ROUTE.indexOf("async function sampleApp()"));
    assert.doesNotMatch(fn, /ClientCodeMemory/);
  });

  it("says it is a sample, above the app rather than over it", () => {
    const fn = ROUTE.slice(ROUTE.indexOf("async function sampleApp()"));
    assert.match(fn, /Sample<\/span> — a made-up/);
    assert.match(fn, /Nothing here is booked\./);
  });
});
