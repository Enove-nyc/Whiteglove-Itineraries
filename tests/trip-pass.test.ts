import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  describePasses,
  passForTrip,
  releaseOrphaned,
  spendPassOn,
  tripHasPass,
  unspentPasses,
  type TripPass,
} from "@/lib/trip-pass";

/**
 * WHAT A TRIP PASS IS, held to.
 *
 * The pass was a plan: buying it set the account to `one_trip`, and every trip
 * on that account opened in the White Glove app forever. One payment, every
 * trip, for a thing sold as one trip. It is a token spent on a single trip
 * now, and most of what follows is the arithmetic that keeps it from drifting
 * back — a pass that can move between trips is a subscription again with a
 * different word on it.
 */

const pass = (id: string, boughtAt: string, tripId: string | null = null): TripPass => ({
  id,
  boughtAt,
  tripId,
  spentAt: tripId ? boughtAt : null,
});

describe("a pass covers one trip", () => {
  it("answers for the trip it is on, and no other", () => {
    const held = [pass("a", "2026-01-01T00:00:00.000Z", "trip-1")];
    assert.equal(tripHasPass(held, "trip-1"), true);
    assert.equal(tripHasPass(held, "trip-2"), false);
    assert.equal(passForTrip(held, "trip-1")?.id, "a");
    assert.equal(passForTrip(held, "trip-2"), null);
  });

  it("an empty account covers nothing", () => {
    assert.equal(tripHasPass([], "trip-1"), false);
    assert.equal(passForTrip([], ""), null);
  });

  it("a blank trip id is never covered by accident", () => {
    // A pass is never stored with a blank tripId, but a caller reading an id
    // off a URL can hand one in, and "" === "" would say yes to everything.
    assert.equal(tripHasPass([pass("a", "2026-01-01T00:00:00.000Z", "trip-1")], ""), false);
  });
});

describe("spending one", () => {
  const NOW = "2026-06-01T00:00:00.000Z";

  it("takes the oldest spare pass, so the same call twice cannot differ", () => {
    const held = [pass("newer", "2026-02-01T00:00:00.000Z"), pass("older", "2026-01-01T00:00:00.000Z")];
    const out = spendPassOn(held, "trip-9", NOW);
    assert.ok(out.ok);
    assert.equal(out.spent.id, "older");
    assert.equal(out.spent.tripId, "trip-9");
    assert.equal(out.spent.spentAt, NOW);
    // The other one is untouched and still spare.
    assert.deepEqual(unspentPasses(out.passes).map((p) => p.id), ["newer"]);
  });

  it("refuses when there is nothing spare, rather than opening the trip anyway", () => {
    const held = [pass("a", "2026-01-01T00:00:00.000Z", "trip-1")];
    const out = spendPassOn(held, "trip-2", NOW);
    assert.equal(out.ok, false);
    assert.equal(out.ok === false && out.reason, "none_left");
    assert.deepEqual(out.passes, held, "a refused spend still changed the account");
  });

  it("does not burn a second pass on a trip that already has one", () => {
    const held = [pass("a", "2026-01-01T00:00:00.000Z", "trip-1"), pass("b", "2026-02-01T00:00:00.000Z")];
    const out = spendPassOn(held, "trip-1", NOW);
    assert.equal(out.ok, false);
    assert.equal(out.ok === false && out.reason, "already");
    assert.equal(unspentPasses(out.passes).length, 1);
  });

  it("NEVER MOVES A SPENT PASS — the whole point of a pass", () => {
    // If a pass could leave the trip it is on, $9 would buy every trip in
    // sequence and this would be a subscription with a different word on it.
    const held = [pass("a", "2026-01-01T00:00:00.000Z", "trip-1")];
    const out = spendPassOn(held, "trip-2", NOW);
    assert.equal(out.ok, false);
    assert.equal(passForTrip(out.passes, "trip-1")?.id, "a", "the pass left its trip");
    assert.equal(tripHasPass(out.passes, "trip-2"), false);
  });
});

describe("a pass on a trip that no longer exists", () => {
  it("comes back, because a purchase should not be deleted with a row", () => {
    const held = [pass("a", "2026-01-01T00:00:00.000Z", "gone"), pass("b", "2026-02-01T00:00:00.000Z", "kept")];
    const out = releaseOrphaned(held, ["kept"]);
    assert.equal(out.find((p) => p.id === "a")?.tripId, null);
    assert.equal(out.find((p) => p.id === "a")?.spentAt, null);
    assert.equal(out.find((p) => p.id === "b")?.tripId, "kept", "a live trip lost its pass");
  });

  it("is not a way to move one — the trip has to be gone", () => {
    const held = [pass("a", "2026-01-01T00:00:00.000Z", "trip-1")];
    assert.deepEqual(releaseOrphaned(held, ["trip-1"]), held);
  });
});

describe("what the account is told it holds", () => {
  it("counts the spare ones, and never names an amount", () => {
    // AGENTS.md: offerLine() is the only thing on the site allowed to print a
    // price. A sentence about what somebody holds must not sneak one in.
    const lines = [
      describePasses([]),
      describePasses([pass("a", "2026-01-01T00:00:00.000Z", "trip-1")]),
      describePasses([pass("a", "2026-01-01T00:00:00.000Z")]),
      describePasses([pass("a", "2026-01-01T00:00:00.000Z"), pass("b", "2026-02-01T00:00:00.000Z")]),
    ];
    assert.equal(lines[0], "");
    assert.match(lines[1], /on a trip/);
    assert.match(lines[2], /one Trip Pass/);
    assert.match(lines[3], /2 Trip Passes/);
    for (const line of lines) assert.doesNotMatch(line, /\$\s?\d/);
  });
});

describe("messages are off a code somebody made for themselves", () => {
  /**
   * The block is deliberately not a plan check and not a hidden tab. It is the
   * one thing that is actually true: a self code has one person on it, so
   * there is no thread. Which means an advisor carrying her own family's trip
   * gets the same silence, with no special case for the Trip Pass.
   */
  const store = readFileSync("lib/account-store.ts", "utf8");

  it("the chat resolver refuses a self code outright", () => {
    // Server-side, and in ONE place: the chat route and the report route both
    // go through resolveCompanionShare, so refusing here closes every messaging
    // route at once — including any added later, which is the point.
    const fn = store.slice(store.indexOf("export async function resolveCompanionShare"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    assert.match(body, /getShareKind\(shareId\)\) === "self"/);
    assert.match(body, /return null/);
  });

  it("both messaging routes go through it, so neither needs its own check", () => {
    for (const route of ["app/api/companion/chat/route.ts", "app/api/companion/report/route.ts"]) {
      assert.match(readFileSync(route, "utf8"), /resolveCompanionShare/, route);
    }
  });

  it("a code written before kinds existed still carries its conversation", () => {
    // Every code that exists today was made by an advisor to send to somebody.
    // Defaulting a missing kind to "self" would have closed live threads.
    const fn = store.slice(store.indexOf("export async function getShareKind"));
    assert.match(fn.slice(0, fn.indexOf("\n}")), /isShareKind\(rec\.kind\) \? rec\.kind : "client"/);
  });

  it("re-issuing a code never downgrades a client one to a self one", () => {
    const fn = store.slice(store.indexOf("export async function ensureTripShare"));
    assert.match(fn.slice(0, 1400), /isShareKind\(existing\?\.kind\) \? existing\.kind : "client"/);
  });
});

describe("the pass is granted where the money actually lands", () => {
  it("the webhook writes a pass, not only a plan", () => {
    const hook = readFileSync("app/api/billing/webhook/route.ts", "utf8");
    assert.match(hook, /await grantTripPass\(account, trip\)/);
    // And it carries the trip the buyer was looking at, so a pass bought from
    // a trip does not have to be placed by hand afterwards.
    assert.match(hook, /grantOneTimePurchase\(account, plan, tripFrom\(object\)\)/);
  });

  it("a second pass is a purchase, not a duplicate to refuse", () => {
    const checkout = readFileSync("app/api/account/billing/checkout/route.ts", "utf8");
    assert.match(checkout, /if \(current === plan && !oneTime\)/);
  });

  it("spending a pass and getting the code are one action", () => {
    // Two actions could leave a pass spent on a trip with no way into it.
    const trips = readFileSync("app/api/account/trips/route.ts", "utf8");
    const branch = trips.slice(trips.indexOf('case "app-code"'), trips.indexOf('case "share"'));
    assert.match(branch, /spendTripPass\(email, body\.id\)/);
    assert.match(branch, /ensureTripShare\(email, body\.id, "self"\)/);
    assert.ok(branch.indexOf("spendTripPass") < branch.indexOf("ensureTripShare"));
  });

  it("deleting a trip hands its pass back", () => {
    const trips = readFileSync("app/api/account/trips/route.ts", "utf8");
    assert.match(trips.slice(trips.indexOf('case "delete"')), /releaseDeletedTripPasses/);
  });
});
