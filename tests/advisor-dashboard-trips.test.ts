import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { tripIsStarted, withTrips, type SavedTrip } from "@/lib/account-store";
import { emptyItinerary } from "@/data/itinerary";

const trip = (over: Partial<SavedTrip> = {}): SavedTrip => ({
  id: "t1",
  name: "My trip",
  itinerary: emptyItinerary(),
  route: [],
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
  ...over,
});

describe("what counts as a trip somebody has started", () => {
  it("an untouched placeholder does not", () => {
    assert.equal(tripIsStarted(trip()), false);
  });

  it("a name somebody chose does", () => {
    assert.equal(tripIsStarted(trip({ name: "Weiss Italy" })), true);
  });

  it("so does a client, a date, a stop, a traveller, a proposal or a balance", () => {
    assert.equal(tripIsStarted(trip({ client: "Weiss family" })), true);
    assert.equal(tripIsStarted(trip({ itinerary: { ...emptyItinerary(), startDate: "2026-09-01" } })), true);
    assert.equal(tripIsStarted(trip({ itinerary: { ...emptyItinerary(), title: "Italy" } })), true);
    assert.equal(
      tripIsStarted(trip({ itinerary: { ...emptyItinerary(), activities: [{ id: "a", name: "The Forum", date: "" }] } })),
      true,
    );
    assert.equal(tripIsStarted(trip({ shareId: "abc123" })), true);
  });
});

describe("the dashboard sees a trip still in the old single-trip slot", () => {
  // The bug the owner reported: the dashboard read data.trips directly, which
  // is empty on an account whose trip has never been migrated, so it showed
  // "Start your first trip" while every other screen showed the trip.
  const legacy = {
    itinerary: { ...emptyItinerary(), title: "Italy family trip", startDate: "2026-09-01" },
    updatedAt: "2026-08-01T00:00:00Z",
  } as Parameters<typeof withTrips>[0];

  it("withTrips finds it, and it counts", () => {
    const found = withTrips(legacy).trips;
    assert.equal(found.length, 1);
    assert.equal(found.filter(tripIsStarted).length, 1, "a real legacy trip was dropped");
  });

  it("an account with nothing at all still counts nothing", () => {
    // The phantom the old code was dodging. Both cases have to hold at once.
    const nothing = { updatedAt: "2026-08-01T00:00:00Z" } as Parameters<typeof withTrips>[0];
    assert.equal(withTrips(nothing).trips.length, 1, "withTrips still synthesizes one");
    assert.equal(withTrips(nothing).trips.filter(tripIsStarted).length, 0, "and it must not be counted");
  });

  it("the dashboard reads it that way", () => {
    const src = readFileSync("app/advisor/page.tsx", "utf8");
    assert.match(src, /withTrips\(account\.data\)\.trips\.filter\(tripIsStarted\)/);
    assert.doesNotMatch(src, /account\.data\.trips\?\.filter/);
  });
});
