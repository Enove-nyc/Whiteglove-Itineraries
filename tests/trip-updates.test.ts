import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { TripAlert } from "@/data/trip-alerts";
import type { TripAdvisories } from "@/lib/trip-advisories";
import { nextTripFor, tripUpdates } from "@/lib/trip-updates";

const HREF = "/command-center";

function alert(over: Partial<TripAlert> = {}): TripAlert {
  return {
    id: "a1",
    kind: "flight_delay",
    flightId: "f1",
    title: "LY1 delayed",
    note: "Now running about 45 minutes late.",
    createdAt: "2026-09-01T09:00:00.000Z",
    acknowledged: false,
    ...over,
  };
}

function roll(level: number | null, over: Partial<TripAdvisories> = {}): TripAdvisories {
  return {
    countries: [
      {
        country: "Ukraine",
        stops: 2,
        advisory: level === null ? null : { country: "Ukraine", level, levelLabel: `Level ${level}: Do Not Travel`, summary: "Do not travel to Ukraine.", link: "https://example.gov/ua" },
      },
    ],
    stopsWithNoCountry: 0,
    highest: level,
    anyUnknown: false,
    ...over,
  };
}

test("nothing changed means no list at all, not an empty heading", () => {
  assert.deepEqual(tripUpdates({ alerts: [], advisories: null, tripHref: HREF }), []);
});

test("an acknowledged flight alert is not shown again", () => {
  const out = tripUpdates({ alerts: [alert({ acknowledged: true })], advisories: null, tripHref: HREF });
  assert.deepEqual(out, []);
});

test("a live flight alert leads, and points at the trip's own page", () => {
  const out = tripUpdates({ alerts: [alert()], advisories: null, tripHref: HREF });
  assert.equal(out.length, 1);
  assert.equal(out[0].source, "flight");
  assert.equal(out[0].title, "LY1 delayed");
  assert.equal(out[0].href, HREF);
});

test("a cancellation is drawn louder than a delay", () => {
  const cancelled = tripUpdates({ alerts: [alert({ kind: "flight_cancelled" })], advisories: null, tripHref: HREF });
  assert.equal(cancelled[0].tone, "danger");
  assert.equal(tripUpdates({ alerts: [alert()], advisories: null, tripHref: HREF })[0].tone, "caution");
});

test("a level 1 or 2 advisory is not repeated here", () => {
  for (const level of [1, 2]) {
    assert.deepEqual(tripUpdates({ alerts: [], advisories: roll(level), tripHref: HREF }), []);
  }
});

test("a flight change comes before a country advisory", () => {
  const out = tripUpdates({ alerts: [alert()], advisories: roll(4), tripHref: HREF });
  assert.deepEqual(out.map((u) => u.source), ["flight", "advisory"]);
});

test("there is no third source here — this product has no place notices", () => {
  const source = readFileSync(new URL("../lib/trip-updates.ts", import.meta.url), "utf8");
  // The kosher copy hangs the owner's dated notices off destination pages.
  // There are no destination pages here, so the source is absent rather than
  // stubbed — an empty third list would be a heading with nothing behind it.
  for (const gone of ["current-updates", "noticesForTrip", "destinationSlugsOnTrip", '"place"']) {
    assert.ok(!source.includes(gone), `lib/trip-updates.ts still refers to ${gone}`);
  }
});

test("a level 3 or 4 advisory is, in the State Department's own words", () => {
  const out = tripUpdates({ alerts: [], advisories: roll(4), tripHref: HREF });
  assert.equal(out.length, 1);
  assert.equal(out[0].label, "Ukraine");
  assert.equal(out[0].title, "Level 4: Do Not Travel");
  assert.equal(out[0].detail, "Do not travel to Ukraine.");
  assert.equal(out[0].href, "https://example.gov/ua");
  assert.equal(out[0].external, true);
});

test("a country with no advisory in the feed adds no row", () => {
  assert.deepEqual(tripUpdates({ alerts: [], advisories: roll(null), tripHref: HREF }), []);
});







test("the trip chosen is the soonest one that has not finished", () => {
  const trips = [
    { id: "past", startDate: "2026-01-01", endDate: "2026-01-10" },
    { id: "later", startDate: "2026-12-01", endDate: "2026-12-10" },
    { id: "next", startDate: "2026-10-01", endDate: "2026-10-08" },
  ];
  assert.equal(nextTripFor(trips, "2026-09-02")?.id, "next");
});

test("a trip already under way is still the one, until its last day passes", () => {
  const trips = [{ id: "now", startDate: "2026-08-30", endDate: "2026-09-05" }];
  assert.equal(nextTripFor(trips, "2026-09-02")?.id, "now");
  assert.equal(nextTripFor(trips, "2026-09-06"), null);
});

test("a trip with no dates cannot be current about anything", () => {
  assert.equal(nextTripFor([{ id: "x", startDate: "", endDate: "" }], "2026-09-02"), null);
});

test("the rules half reads nothing — no store, no feed, no session", () => {
  const source = readFileSync(new URL("../lib/trip-updates.ts", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("export type TripUpdateSource"));
  for (const forbidden of ["fetch(", "process.env", "cookies(", "redis"]) {
    assert.ok(!code.includes(forbidden), `lib/trip-updates.ts should not contain ${forbidden}`);
  }
});
