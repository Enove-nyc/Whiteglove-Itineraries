import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { appCoversEveryTrip, featuresFor, mayServeCompanionClients, mayUseCompanionApp, PLAN_FEATURES } from "@/lib/account-limits";
import { whatYouGet } from "@/lib/account-plans";

/**
 * Where the White Glove app's line falls between the plans.
 *
 * IT IS THREE ENTITLEMENTS, NOT ONE, and that is the whole of this file.
 *
 * companionApp — the app for your OWN trip. Trip Pass, Advisor Starter and
 * Advisor Pro; the step up from Personal. What the pricing page advertises.
 *
 * appOnEveryTrip — that app on EVERY trip rather than one at a time. Starter
 * and Pro only. A Trip Pass is spent on the one trip it is for
 * (lib/trip-pass.ts), so without this flag the door has to ask about the trip
 * and not only the plan — which is what mayOpenTripInApp does.
 *
 * companionClients — the app handed to SOMEBODY ELSE: a client link, the chat,
 * the inbox. Starter and Pro, because a Trip Pass is for planning one trip for
 * yourself, not for a client.
 *
 * A change that let a Trip Pass hand a trip to a client, that shut Starter out
 * of its own app, or that quietly made one pass open every trip, trips a test
 * here rather than shipping.
 *
 * The gates are read the way business-trips.test.ts reads them: from the source,
 * because what matters is that the check is PRESENT and is the right one, which
 * is a property of the code and not of one response that would need cookies and
 * Redis to produce.
 */

describe("who gets the app for their own trips", () => {
  it("is every paid plan, never an account with no plan yet", () => {
    assert.equal(mayUseCompanionApp("one_trip"), true);
    assert.equal(mayUseCompanionApp("starter"), true);
    assert.equal(mayUseCompanionApp("pro"), true);
    assert.equal(mayUseCompanionApp("free"), false);
  });
});

describe("who gets it on EVERY trip, and who buys it one at a time", () => {
  it("is the advisor plans, never a pass", () => {
    // The pass used to be a plan, and the plan opened every trip the account
    // would ever have — one payment, unlimited trips, for a thing sold as one
    // trip. This is the flag that stopped that, so it is worth a test of its
    // own rather than only a row in the table above.
    assert.equal(appCoversEveryTrip("starter"), true);
    assert.equal(appCoversEveryTrip("pro"), true);
    assert.equal(appCoversEveryTrip("one_trip"), false);
    assert.equal(appCoversEveryTrip("free"), false);
  });

  it("is a SEPARATE flag from having the app at all", () => {
    // Collapse these two and the Trip Pass either loses the app entirely or
    // silently becomes a subscription sold as a single fee.
    assert.equal(PLAN_FEATURES.one_trip.companionApp, true);
    assert.equal(PLAN_FEATURES.one_trip.appOnEveryTrip, false);
  });
});

describe("who may hand the app to a client", () => {
  it("is Advisor Starter and Advisor Pro, never One Trip", () => {
    // One Trip has the app for the one trip it is; it has no clients to serve.
    // The client link, the chat and the inbox are the "planning on somebody
    // else's behalf" that Advisor Starter is for.
    assert.equal(mayServeCompanionClients("starter"), true);
    assert.equal(mayServeCompanionClients("pro"), true);
    assert.equal(mayServeCompanionClients("one_trip"), false);
    assert.equal(mayServeCompanionClients("free"), false);
  });

  it("KEEPS THE TWO HALVES SEPARATE IN THE TABLE", () => {
    // If these ever collapse back into one flag, One Trip either loses its own
    // app or gains a client inbox it was never meant to have.
    assert.equal(PLAN_FEATURES.one_trip.companionApp, true);
    assert.equal(PLAN_FEATURES.one_trip.companionClients, false);
    assert.equal(PLAN_FEATURES.starter.companionApp, true);
    assert.equal(PLAN_FEATURES.starter.companionClients, true);
    assert.equal(PLAN_FEATURES.free.companionApp, false);
    assert.equal(PLAN_FEATURES.free.companionClients, false);
    assert.equal(featuresFor("one_trip").companionClients, false);
  });
});

describe("the words on the account page line up with the gates", () => {
  it("promises One Trip the app for its own trip, and never a client one", () => {
    // The line a One Trip member reads is about their OWN trip on their OWN
    // phone. It must not promise anything client-facing, because the gate
    // refuses it.
    const oneTrip = whatYouGet("one_trip");
    assert.ok(oneTrip.some((line) => /White Glove app/i.test(line)), "One Trip is not promised its own app");
    assert.ok(!oneTrip.some((line) => /client|travellers you plan for/i.test(line)), "One Trip is promised a client feature it cannot use");
  });

  it("promises Advisor Starter the app it hands to the people it plans for", () => {
    const starter = whatYouGet("starter");
    assert.ok(
      starter.some((line) => /client|opens their trip|chat with each/i.test(line)),
      "Advisor Starter is not promised the client app",
    );
  });
});

describe("the gates in the pages and routes are the right ones", () => {
  it("asks about the TRIP at /app, not only about the plan", () => {
    const page = readFileSync("app/app/page.tsx", "utf8");
    // The outer door: is there an app on this account at all.
    assert.match(page, /mayReachTheApp\(who, plan\)/);
    // The one that matters: may THIS trip open. Reading only the plan is what
    // let one purchase open every trip.
    assert.match(page, /mayOpenTripInApp\(who, plan, selected\.id\)/);
    assert.ok(!/mayUseCompanionApp\(plan\)/.test(page), "/app is back to gating on the plan alone");
    // The inbox tab is only handed on to somebody who serves clients.
    assert.match(page, /mayServeCompanionClients\(plan\)/);
    assert.match(page, /advisorInbox=\{servesClients\}/);
  });

  it("does not offer a trip as ready to open when it would not open", () => {
    // The list under the empty state was every dated trip, which was true when
    // the app came with the account and is a list of locked doors now.
    const page = readFileSync("app/app/page.tsx", "utf8");
    assert.match(page, /const openable = appCoversEveryTrip\(plan\) \? dated : dated\.filter/);
    assert.match(page, /\{openable\.map\(/);
  });

  it("opens a client's shared link only for an advisor who serves clients", () => {
    const shared = readFileSync("app/i/[shareId]/app/page.tsx", "utf8");
    assert.match(shared, /mayServeCompanionClients\(plan\)/);
    assert.doesNotMatch(shared, /mayUseCompanionApp/);
  });

  it("opens somebody's OWN code on the trip's pass, and hands it no chat", () => {
    const shared = readFileSync("app/i/[shareId]/app/page.tsx", "utf8");
    // A self code is gated on the trip, not on serving clients — that is the
    // whole point of it: a Trip Pass holder has no clients.
    assert.match(shared, /kind === "self"/);
    assert.match(shared, /mayOpenTripInApp\(shared\.ownerEmail, plan, shared\.tripId\)/);
    // AND IT IS HANDED NO CHAT. CompanionApp draws the Messages tab, the
    // badge, the polling and the home-screen card from this one prop, so
    // passing nothing removes all of them; a `chat` object built
    // unconditionally would put a thread on a trip with nobody on the other
    // end of it.
    assert.match(shared, /kind === "self"\s*\?\s*undefined/);
  });

  it("gates the advisor inbox on serving clients, before it reads any thread", () => {
    const route = readFileSync("app/api/companion/chats/route.ts", "utf8");
    assert.match(route, /mayServeCompanionClients\(await getPlan/);
    const body = route.slice(route.indexOf("export async function GET"));
    assert.ok(body.indexOf("mayServeCompanionClients") < body.indexOf("readChat"), "the inbox is read before the plan is checked");
  });

  it("gates the client link on serving clients, before it is created", () => {
    const trips = readFileSync("app/api/account/trips/route.ts", "utf8");
    const branch = trips.slice(trips.indexOf('case "share"'), trips.indexOf('case "duplicate"'));
    assert.match(branch, /mayServeCompanionClients/);
    assert.match(branch, /403/);
    assert.ok(branch.indexOf("mayServeCompanionClients") < branch.indexOf("ensureTripShare"));
  });
});
