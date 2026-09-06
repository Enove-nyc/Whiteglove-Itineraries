import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDays, emptyItinerary, type Itinerary } from "@/data/itinerary";
import { openStatus } from "@/lib/share-opens";
import { tripTimeZone } from "@/lib/trip-timezone";

/**
 * THE TIMEZONE NIGHTMARE TRIP — a permanent fixture, not a one-off check.
 *
 * New York, a red-eye east across midnight, London, the day the clocks change,
 * an overnight train into another zone, and an event just after midnight. The
 * adviser edits it from New York; the traveller reads it from wherever they
 * actually are. Every one of those is a real trip somebody will take, and each
 * is a different way for "which day is this on?" to be answered with the
 * SERVER'S day instead of the trip's.
 *
 * The rule this exists to hold: a trip's day, arrival, departure and "today"
 * are the trip's own, never the machine's. A container in Virginia must not
 * decide that a traveller in Tokyo is a day behind.
 */

const NIGHTMARE: Itinerary = {
  ...emptyItinerary(),
  title: "Timezone nightmare",
  // Runs across the last Sunday in October — when the UK leaves BST and the US
  // has not yet left EDT, so for one week the usual five-hour gap is four.
  startDate: "2026-10-23",
  endDate: "2026-10-29",
  flights: [
    {
      id: "f-redeye",
      airline: "Red-eye",
      flightNo: "100",
      from: "JFK",
      to: "LHR",
      // Leaves New York late on the 23rd, lands in London on the MORNING OF
      // THE 24TH. The arrival is a different calendar day from the departure,
      // and neither is "the day the flight is on" in the other's clock.
      date: "2026-10-23",
      departTime: "22:40",
      arriveDate: "2026-10-24",
      arriveTime: "10:25",
    },
  ],
  lodging: [{ id: "l-london", name: "London hotel", type: "hotel", checkIn: "2026-10-24", checkOut: "2026-10-26" }],
  activities: [
    // First stop with coordinates decides the trip's clock: central London.
    { id: "a-london", name: "Walk the South Bank", date: "2026-10-24", coordinates: "51.5072,-0.1276", startTime: "14:00" },
    // The morning the clocks go back in the UK.
    { id: "a-dst", name: "Morning the clocks change", date: "2026-10-25", coordinates: "51.5072,-0.1276", startTime: "09:00" },
    // Overnight train into central Europe, arriving in a different zone.
    { id: "a-train", name: "Overnight train to Paris", date: "2026-10-26", coordinates: "48.8566,2.3522", startTime: "22:15" },
    // And an event just after midnight, which belongs to the day it is ON —
    // not to the evening it feels like part of.
    { id: "a-after-midnight", name: "Arrival, after midnight", date: "2026-10-27", coordinates: "48.8566,2.3522", startTime: "00:35" },
  ],
};

test("the trip is read in the trip's clock, not the server's", () => {
  // London, from the first stop that has coordinates. Never the container's.
  assert.equal(tripTimeZone(NIGHTMARE), "Europe/London");
});

test("a trip with no coordinates yet falls back to UTC, not to the machine", () => {
  const bare: Itinerary = { ...emptyItinerary(), startDate: "2026-10-23", endDate: "2026-10-24" };
  assert.equal(tripTimeZone(bare), "UTC");
  assert.equal(tripTimeZone(undefined), "UTC");
});

test("every day of the trip is built, DST day included", () => {
  const days = buildDays(NIGHTMARE);
  assert.equal(days.length, 7, "23rd to 29th inclusive");
  assert.deepEqual(days.map((d) => d.date), [
    "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29",
  ]);
});

test("A RED-EYE DEPARTS ON ONE DAY AND ARRIVES ON THE NEXT", () => {
  const days = buildDays(NIGHTMARE);
  const departs = days.find((d) => d.date === "2026-10-23");
  const arrives = days.find((d) => d.date === "2026-10-24");
  assert.equal(departs?.flightsDeparting.length, 1, "the departure is not on the 23rd");
  assert.equal(arrives?.flightsArriving.length, 1, "the arrival is not on the 24th");
  // And it is not counted twice as a departure.
  assert.equal(arrives?.flightsDeparting.length, 0);
});

test("the day the clocks change is one ordinary day, not two and not none", () => {
  const days = buildDays(NIGHTMARE);
  const dst = days.filter((d) => d.date === "2026-10-25");
  assert.equal(dst.length, 1);
  assert.equal(dst[0].activities.length, 1);
  assert.equal(dst[0].activities[0].id, "a-dst");
});

test("an event just after midnight belongs to the day it is on", () => {
  const days = buildDays(NIGHTMARE);
  const after = days.find((d) => d.date === "2026-10-27");
  assert.equal(after?.activities.some((a) => a.id === "a-after-midnight"), true);
  // And not to the evening before, which is where a server rounding to its own
  // day would put it.
  const evening = days.find((d) => d.date === "2026-10-26");
  assert.equal(evening?.activities.some((a) => a.id === "a-after-midnight"), false);
});

test("THE SAME INSTANT IS A DIFFERENT DATE IN TWO PLACES — the real failure", () => {
  // 02:30 UTC on the 27th is 22:30 on the 26th in New York. An adviser in New
  // York and a traveller in London are looking at one open, and the date each
  // is shown must be their own — a server that picked one zone for everybody
  // would tell one of them the wrong day.
  const opened = "2026-10-27T02:30:00.000Z";
  const now = "2026-10-27T09:00:00.000Z";
  const opens = { firstOpenedAt: opened, lastOpenedAt: opened, opens: 1 };

  assert.match(openStatus(opens, now, "Europe/London").text, /27 Oct/);
  assert.match(openStatus(opens, now, "America/New_York").text, /26 Oct/);
});

test("and an instant that is the same day everywhere reads the same everywhere", () => {
  // The control: without this, the test above would pass on a function that
  // simply printed a different string per zone for any input at all.
  const opened = "2026-10-27T07:00:00.000Z";
  const now = "2026-10-27T09:00:00.000Z";
  const opens = { firstOpenedAt: opened, lastOpenedAt: opened, opens: 1 };
  assert.equal(
    openStatus(opens, now, "Europe/London").text,
    openStatus(opens, now, "America/New_York").text,
  );
});

test("the status never silently uses the server's zone", () => {
  // The default is UTC and stated, not "whatever the container is set to".
  const opens = { firstOpenedAt: "2026-10-27T04:30:00.000Z", lastOpenedAt: "2026-10-27T04:30:00.000Z", opens: 1 };
  const explicit = openStatus(opens, "2026-10-27T09:00:00.000Z", "UTC");
  const defaulted = openStatus(opens, "2026-10-27T09:00:00.000Z");
  assert.deepEqual(defaulted, explicit);
});
