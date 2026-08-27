import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyItinerary, type Itinerary } from "@/data/itinerary";
import { summarizeItineraryChange } from "@/data/trip-changes";

// A trip a traveler was handed, and what it should say back to them when the
// person planning it moves something. The rule under test: report THAT a
// flight, a stay or a day changed — never the bookkeeping (road times, notes,
// attachments) they never see, and never a non-change.

function base(): Itinerary {
  return {
    ...emptyItinerary(),
    title: "Rome",
    startDate: "2026-10-05",
    endDate: "2026-10-08",
    flights: [{ id: "f1", from: "JFK", to: "FCO", date: "2026-10-05", departTime: "16:05" }],
    lodging: [{ id: "h1", type: "hotel", name: "Hotel Aventino", checkIn: "2026-10-05", checkOut: "2026-10-08" }],
    activities: [{ id: "a1", name: "The Colosseum", date: "2026-10-06", startTime: "10:00" }],
  };
}

describe("summarizeItineraryChange", () => {
  it("stays silent when there is no earlier version", () => {
    assert.equal(summarizeItineraryChange(undefined, base()), null);
  });

  it("stays silent when nothing traveler-facing changed", () => {
    const prev = base();
    const next: Itinerary = {
      ...base(),
      // Bookkeeping the traveler never sees.
      roadTimes: { "a>b": 30 },
      updatedAt: "2026-09-01T00:00:00.000Z",
      notes: "internal scratch",
    };
    assert.equal(summarizeItineraryChange(prev, next), null);
  });

  it("reports an added flight", () => {
    const next = base();
    next.flights = [...next.flights, { id: "f2", from: "FCO", to: "JFK", date: "2026-10-08" }];
    const change = summarizeItineraryChange(base(), next);
    assert.ok(change);
    assert.match(change!.note, /Flight FCO → JFK added\./);
  });

  it("reports a removed stay", () => {
    const next = base();
    next.lodging = [];
    const change = summarizeItineraryChange(base(), next);
    assert.ok(change);
    assert.match(change!.note, /Hotel Aventino removed\./);
  });

  it("reports a retimed activity but not a bare reorder", () => {
    const moved = base();
    moved.activities = [{ ...moved.activities[0], startTime: "14:00" }];
    assert.match(summarizeItineraryChange(base(), moved)!.note, /The Colosseum updated\./);

    const reordered = base();
    reordered.activities = [{ ...reordered.activities[0], order: 3 }];
    assert.equal(summarizeItineraryChange(base(), reordered), null);
  });

  it("reports changed trip dates", () => {
    const next = base();
    next.endDate = "2026-10-09";
    assert.match(summarizeItineraryChange(base(), next)!.note, /Trip dates changed\./);
  });

  it("coalesces several changes into one note with a count", () => {
    const next = base();
    next.flights = [...next.flights, { id: "f2", from: "FCO", to: "JFK", date: "2026-10-08" }];
    next.lodging = [];
    next.activities = [{ ...next.activities[0], startTime: "14:00" }];
    next.endDate = "2026-10-09";
    const change = summarizeItineraryChange(base(), next);
    assert.ok(change);
    assert.equal(change!.title, "Trip updated");
    assert.match(change!.note, /and 1 more\.$/);
  });

  it("does not fire on a notes-only edit to a flight", () => {
    const next = base();
    next.flights = [{ ...next.flights[0], notes: "window seats" }];
    assert.equal(summarizeItineraryChange(base(), next), null);
  });
});
