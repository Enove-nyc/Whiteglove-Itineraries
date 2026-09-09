import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * A LARGE VALUE GOES IN THE REQUEST BODY, NEVER IN THE URL.
 *
 * lib/account-store.ts's writeJson used to fold the whole serialized value —
 * an account's stored data, a trip's itinerary above all, the one thing here
 * with no natural size cap — into the Upstash REST URL. Once that URL got
 * long enough it was refused outright, and the refusal had no symptom
 * anywhere a caller could see: redis() returns undefined the same way for
 * every kind of failure, so the page went on to tell the traveller "Saved"
 * while the write never happened. Confirmed against a real build: a trip
 * that grew past roughly 16KB of stored account data silently lost a hotel
 * and its activities, then permanently lost a third city's hotel and all of
 * its planned stops, with nothing on screen ever saying so.
 *
 * lib/expenses.ts had the identical shape for the owner's own expense list,
 * missed when the same reasoning was applied to receipts a few lines below
 * it in the same file.
 *
 * Both now POST the value as the request body, the way every other *-store.ts
 * file in this codebase already does, and the way this same expenses.ts file
 * already did for receipts.
 */
describe("large values are written as a request body, not folded into the URL", () => {
  it("account-store's writeJson sends the value as a body, not appended to the set/ URL", () => {
    const src = readFileSync("lib/account-store.ts", "utf8");
    const at = src.indexOf("async function writeJson");
    assert.ok(at > -1);
    const body = src.slice(at, at + 400);
    assert.match(body, /redis\(`set\/\$\{encodeURIComponent\(key\)\}`, JSON\.stringify\(value\)\)/);
    // The old shape must not still be there: value encoded into the path.
    assert.doesNotMatch(body, /set\/\$\{encodeURIComponent\(key\)\}\/\$\{payload\}/);
  });

  it("redis() actually issues a POST with a body when one is given", () => {
    const src = readFileSync("lib/account-store.ts", "utf8");
    const at = src.indexOf("async function redis<T>(command: string, body?: string)");
    assert.ok(at > -1, "redis() must accept an optional body parameter");
    const fn = src.slice(at, at + 500);
    assert.match(fn, /method: body === undefined \? "GET" : "POST"/);
  });

  it("expenses.ts writes its list the same way, matching how it already writes receipts", () => {
    const src = readFileSync("lib/expenses.ts", "utf8");
    const at = src.indexOf("async function writeExpenses");
    assert.ok(at > -1);
    const body = src.slice(at, at + 500);
    assert.match(body, /method: "POST"/);
    assert.match(body, /body: JSON\.stringify\(items\.slice\(0, 10000\)\)/);
  });
});

/**
 * THE STOP-EDITOR "LINK" FIELD TAKES A SAME-SITE PATH, NOT ONLY A FULL URL.
 *
 * Picking a kever, a shul or a mikvah with no outside website (pickKever,
 * pickAttraction in components/ItineraryBuilder.tsx) fills the stop's Link
 * field from our own site — a relative path like /shuls/some-slug — and an
 * <input type="url"> refuses that under the browser's own validation with no
 * app-level error: "Add" or "Save changes" looked like it did nothing.
 */
describe("a stop's Link field accepts a same-site path, not only an absolute URL", () => {
  const src = readFileSync("components/ItineraryBuilder.tsx", "utf8");

  it("neither Link field on a stop is type=\"url\" any more", () => {
    assert.doesNotMatch(src, /label="Link"><input type="url"/);
  });

  it("both are still there, just as a plain text field", () => {
    const matches = src.match(/label="Link"><input type="text"/g) ?? [];
    assert.ok(matches.length >= 2, `expected the Link field in both ActivityForm and EditStopForm, found ${matches.length}`);
  });
});
