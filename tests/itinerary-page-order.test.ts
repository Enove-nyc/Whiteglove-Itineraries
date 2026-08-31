import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * THE TRIP IS THE DAYS, AND THE DAYS WERE THE TENTH THING ON THE PAGE.
 *
 * Reading the planner top to bottom, this is what sat between somebody and the
 * trip they came to work on:
 *
 *   1. Back to all itineraries      6. Travelers / Share / Rooms drawers
 *   2. The countdown strip          7. Five numbers about the trip
 *   3. What this trip still needs   8. Flights / Lodging / Activities lists
 *   4. The trip header form         9. Day view ↔ Calendar
 *   5. Four add buttons            10. THE DAYS
 *
 * Everything above the days was either setup done once, or a second view of
 * what is below. Add one hotel and three parts of the screen change: its day
 * card, the Lodging list, and the "missing lodging" count. That is why the
 * page read as noise — not a lot of information, a little information shown
 * repeatedly.
 *
 * Four blocks now: what the trip needs, add something, THE DAYS, and the rest
 * in drawers underneath.
 */

const SRC = readFileSync("components/ItineraryBuilder.tsx", "utf8");
const line = (needle: string) => {
  const at = SRC.indexOf(needle);
  assert.ok(at > 0, `gone from the planner: ${needle}`);
  return at;
};

describe("the days come first", () => {
  it("puts the day-by-day above everything that is not setup", () => {
    const days = line("{/* Analysis + day-by-day */}");
    for (const below of [
      ['<div className="grid gap-3 md:grid-cols-2">', "the Travelers / Share / Rooms drawers"],
      ["<BookFlightsPanel", "the flight-booking panel"],
      ["Everything on this trip, as lists", "the booking lists"],
    ] as const) {
      assert.ok(days < line(below[0]), `${below[1]} is above the days again`);
    }
  });

  it("keeps the add buttons above them, because that is the work", () => {
    assert.ok(line("Add to trip") < line("{/* Analysis + day-by-day */}"));
  });

  it("leaves the countdown and what-it-needs above, on purpose", () => {
    // On the third morning of a trip the countdown is the only part of this
    // page anybody needs, and the setup panel is what to do next.
    assert.ok(line("<TripProgressStrip") < line("{/* Analysis + day-by-day */}"));
    assert.ok(line("<TripSetupPanel") < line("{/* Analysis + day-by-day */}"));
  });
});

describe("what is set once does not sit open for ever", () => {
  it("puts the trip's own settings behind a disclosure", () => {
    // Name, dates, who is coming, when a day starts: answered in the first
    // minute and then re-read on every visit for months.
    assert.match(SRC, /Trip details <span aria-hidden="true"/);
    assert.ok(line("Trip details <span") < line("Add to trip"));
  });

  it("still says which trip it is with the disclosure shut", () => {
    // A collapsed header that hides the trip's own name would be worse than
    // the open form it replaced.
    const summary = SRC.slice(line("<details className=\"group -mx-1"), line("Add to trip"));
    assert.match(summary, /itin\.title\?\.trim\(\) \|\| "This trip"/);
    assert.match(summary, /tripBarDates\(\{ startDate: itin\.startDate, endDate: itin\.endDate \}\)/);
  });
});

describe("the same things are not shown three times over", () => {
  it("folds the flight / hotel / stop lists away", () => {
    // Every one of them is already on its own day above. The lists are the
    // second view — useful for "show me every flight", not worth a permanent
    // section.
    assert.match(SRC, /Everything on this trip, as lists/);
    const lists = SRC.slice(line("Everything on this trip, as lists"));
    assert.match(lists.slice(0, 900), /<BookingList/);
  });

  it("KEEPS THE FIVE NUMBERS, which are not the duplicates they looked like", () => {
    /**
     * The first plan was to merge these into the setup panel as a duplicate.
     * Reading both said otherwise: the setup panel answers "is there any
     * lodging on this trip at all", and these answer "three of the eight
     * nights have none". The second is the useful one once a trip is
     * half-built, and it would have been thrown away.
     *
     * They travel with the days, which is what they describe.
     */
    for (const stat of ["Nights", "Missing lodging", "Empty days", "Driving"]) {
      assert.ok(SRC.includes(`label="${stat}"`), `the ${stat} figure went missing`);
    }
    const days = line("{/* Analysis + day-by-day */}");
    assert.ok(days < line('label="Missing lodging"'), "the figures came away from the days they describe");
  });
});
