import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { describePasses, releaseOrphaned, tripHasPass, unspentPasses, type TripPass } from "@/lib/trip-pass";

/**
 * A $9 PASS MUST NEVER LAND ON A TRIP THE BUYER HAS NOT GOT.
 *
 * The trip id travels in the checkout request body and comes back through
 * Stripe's metadata, so it is whatever the browser sent. Sending somebody
 * else's id never unlocked their trip — a pass is only read back against the
 * account holding it, and opening a trip needs the trip to be yours as well —
 * but it DID bind the purchase to a trip this account has not got, where
 * nothing released it and the account page said "every Trip Pass you have
 * bought is on a trip". The buyer paid and got nothing.
 *
 * Three things stop it now, and all three are here: the id is checked at
 * checkout, checked again when the pass is granted (the trip can be deleted in
 * between), and an already-orphaned pass is handed back on the next trips read.
 */

const NOW = "2026-09-06T10:00:00.000Z";

/** Exactly what grantTripPass builds, so the fixture cannot drift from it. */
function granted(passes: TripPass[], tripId?: string): TripPass[] {
  const bind = tripId && !tripHasPass(passes, tripId);
  return [...passes, { id: `p${passes.length}`, boughtAt: NOW, tripId: bind ? tripId : null, spentAt: bind ? NOW : null }];
}

test("THE BUG: a pass bound to a trip the account has not got is worth nothing", () => {
  const passes = granted([], "trip-belonging-to-someone-else");
  assert.equal(unspentPasses(passes).length, 0, "it is spent");
  assert.equal(tripHasPass(passes, "trip-A"), false, "and covers none of their own trips");
  assert.match(describePasses(passes), /on a trip/);
});

test("granted spare instead, it is worth exactly what was paid for it", () => {
  const passes = granted([], undefined);
  assert.equal(unspentPasses(passes).length, 1);
  assert.match(describePasses(passes), /to use/);
});

test("releasing an orphan hands it back, and leaves a live one alone", () => {
  const passes = granted(granted([], "trip-A"), "trip-GONE");
  const healed = releaseOrphaned(passes, ["trip-A"]);
  assert.equal(tripHasPass(healed, "trip-A"), true, "the live trip keeps its pass");
  assert.equal(unspentPasses(healed).length, 1, "the orphan came back as spare");
});

test("releasing is not a way to MOVE a pass off a trip that still exists", () => {
  const passes = granted([], "trip-A");
  assert.deepEqual(releaseOrphaned(passes, ["trip-A"]), passes);
});

/* ------------------------------------------------- where the checks live */

const CHECKOUT = readFileSync(new URL("../app/api/account/billing/checkout/route.ts", import.meta.url), "utf8");
const WEBHOOK = readFileSync(new URL("../app/api/billing/webhook/route.ts", import.meta.url), "utf8");
const TRIPS = readFileSync(new URL("../app/api/account/trips/route.ts", import.meta.url), "utf8");

test("checkout never passes a trip id straight from the request body", () => {
  assert.ok(
    !/trip: oneTime && typeof body\?\.trip === "string"/.test(CHECKOUT),
    "the body's trip id is being trusted again",
  );
  assert.match(CHECKOUT, /trip: oneTime \? await ownTrip\(account\.email, body\?\.trip\) : undefined/);
  assert.match(CHECKOUT, /trips\.some\(\(trip\) => trip\.id === wanted\)/);
});

test("checkout takes the account from the session, never from the body", () => {
  assert.match(CHECKOUT, /getCurrentAccountData\(cookieStore\.get\(accountCookieName\(\)\)\?\.value\)/);
  assert.ok(!/body\?\.account|body\.email/.test(CHECKOUT), "the account is being read off the request");
});

test("the webhook re-checks ownership, because the trip can be deleted in between", () => {
  assert.match(WEBHOOK, /const stillTheirs = trip \?/);
  assert.match(WEBHOOK, /grantTripPass\(account, stillTheirs \? trip : undefined\)/);
});

test("an orphan is handed back on an ordinary trips read, not only on a delete", () => {
  const get = TRIPS.slice(TRIPS.indexOf("export async function GET"), TRIPS.indexOf("export async function POST"));
  assert.match(get, /releaseDeletedTripPasses\(email, trips\.map\(\(trip\) => trip\.id\)\)/);
});

test("the grant is still idempotent, so a redelivered webhook cannot mint a second pass", () => {
  assert.match(WEBHOOK, /grantAlreadyHandled/);
  assert.match(WEBHOOK, /NX=true/);
});

test("the webhook still verifies the signature before it parses anything", () => {
  const post = WEBHOOK.slice(WEBHOOK.indexOf("export async function POST"));
  assert.ok(post.indexOf("verifyWebhook") < post.indexOf("event.data.object"));
  assert.match(post, /if \(!secret\)/);
});
