import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { attractions } from "@/data/attractions";
import { emptyItinerary, type Itinerary } from "@/data/itinerary";
import { kosherEateries } from "@/data/kosher-eateries";
import { kosherAreas, kosherStays } from "@/data/kosher-stays";
import { vacationDestinations } from "@/data/vacation-destinations";
import {
  applyTemplate,
  datePlus,
  destinationForTrip,
  setupProgress,
  setupSteps,
  templatesFrom,
  tripIsUntouched,
} from "@/lib/trip-setup";
import type { VacationSources } from "@/lib/vacation-ideas";

/**
 * Getting a trip started.
 *
 * The planner opens with everything available and nothing said about which to
 * do first. These tests cover the part in front of it — and, more importantly,
 * the three ways a "helpful" starting point could quietly destroy somebody's
 * work: renaming a trip they named, moving a date they chose, or replacing
 * stops they added.
 */

const SOURCES: VacationSources = { attractions, stays: kosherStays, eateries: kosherEateries, areas: kosherAreas };
const TEMPLATES = templatesFrom(vacationDestinations, SOURCES);
const BUILDER = readFileSync("components/ItineraryBuilder.tsx", "utf8");
const PANEL = readFileSync("components/TripSetupPanel.tsx", "utf8");
const ASSISTANT = readFileSync("components/TravelAssistantBox.tsx", "utf8");

let counter = 0;
const uid = () => `test-${(counter += 1)}`;

function trip(over: Partial<Itinerary> = {}): Itinerary {
  return { ...emptyItinerary(), ...over };
}

describe("what this trip still needs", () => {
  it("names five basics and says WHY each one matters", () => {
    // "Add your dates" is an instruction. "Without them nothing can be placed
    // on a day" is a reason, and a reason is what makes somebody do it.
    const steps = setupSteps(trip());
    assert.equal(steps.length, 5);
    for (const step of steps) {
      assert.ok(step.hint.length > 20, `${step.id}: hint`);
      assert.ok(step.why.length > 40, `${step.id}: why`);
      assert.equal(step.done, false);
    }
  });

  it("counts what is done and names what is next", () => {
    const started = trip({ startDate: "2026-07-05", endDate: "2026-07-12" });
    const progress = setupProgress(setupSteps(started));
    assert.equal(progress.done, 1);
    assert.equal(progress.total, 5);
    assert.equal(progress.next?.id, "travelers");
  });

  it("has nothing left to say once the planner has what it needs", () => {
    const full = trip({
      startDate: "2026-07-05",
      endDate: "2026-07-12",
      travelers: [{ id: "a", name: "Sarah", kind: "adult" }],
      lodging: [{ id: "l", type: "hotel", name: "A hotel", checkIn: "2026-07-05", checkOut: "2026-07-12" }],
      activities: [{ id: "s", name: "A stop", date: "" }],
      flights: [{ id: "f", from: "JFK", to: "FCO", date: "2026-07-05" }],
    });
    assert.equal(setupProgress(setupSteps(full)).next, null);
  });

  it("knows an untouched trip from one somebody has started", () => {
    assert.equal(tripIsUntouched(emptyItinerary()), true);
    assert.equal(tripIsUntouched(trip({ title: "Our anniversary" })), false);
    assert.equal(tripIsUntouched(trip({ startDate: "2026-07-05" })), false);
    assert.equal(tripIsUntouched(trip({ notes: "anything" })), false);
  });
});

describe("the templates", () => {
  it("is built only from destinations that have an outline", () => {
    assert.ok(TEMPLATES.length > 0, "no templates at all");
    const withOutlines = vacationDestinations.filter((d) => d.outline).length;
    assert.equal(TEMPLATES.length, withOutlines);
  });

  it("INVENTS NO PLACE — every stop is a record the site already holds", () => {
    // THE ONE THAT MATTERS. A template full of plausible-sounding stops would
    // be the site making up an itinerary, which is the thing it must not do.
    const known = new Set(attractions.map((attraction) => attraction.name));
    for (const template of TEMPLATES) {
      for (const stop of template.stops) {
        assert.ok(known.has(stop.name), `${template.slug} carries a stop that is not in the data: ${stop.name}`);
      }
    }
  });

  it("only carries stops the route planner can actually use", () => {
    // A stop with no coordinate is one more line on a list rather than part of
    // a day: nothing can be timed to or from it.
    for (const template of TEMPLATES) {
      for (const stop of template.stops) assert.match(stop.coordinates ?? "", /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/, stop.name);
    }
  });

  it("says how many days and how many places, honestly", () => {
    for (const template of TEMPLATES) {
      assert.equal(template.days, template.outline.length);
      assert.ok(template.days > 0, template.slug);
    }
  });
});

describe("applying one", () => {
  const template = TEMPLATES.find((entry) => entry.slug === "rome");
  assert.ok(template, "the Rome template is missing");

  it("fills in an empty trip", () => {
    const result = applyTemplate(emptyItinerary(), template, uid);
    assert.equal(result.title, "Rome trip");
    assert.equal(result.activities.length, template.stops.length);
    assert.match(result.notes ?? "", /Day 1:/);
  });

  it("DOES NOT RENAME A TRIP SOMEBODY NAMED", () => {
    const named = trip({ title: "Our anniversary" });
    assert.equal(applyTemplate(named, template, uid).title, "Our anniversary");
  });

  it("DOES NOT MOVE A DATE SOMEBODY CHOSE", () => {
    const dated = trip({ startDate: "2026-07-05", endDate: "2026-07-20" });
    const result = applyTemplate(dated, template, uid);
    assert.equal(result.startDate, "2026-07-05");
    assert.equal(result.endDate, "2026-07-20");
  });

  it("fills in an end date only when there is a start and no end", () => {
    const result = applyTemplate(trip({ startDate: "2026-07-05" }), template, uid);
    assert.equal(result.endDate, datePlus("2026-07-05", template.days - 1));
    // And never invents a start date out of nothing.
    assert.equal(applyTemplate(emptyItinerary(), template, uid).endDate, "");
  });

  it("ADDS TO THE STOPS RATHER THAN REPLACING THEM", () => {
    const started = trip({ activities: [{ id: "mine", name: "A place I added", date: "2026-07-06" }] });
    const result = applyTemplate(started, template, uid);
    assert.ok(result.activities.some((activity) => activity.id === "mine"));
    assert.equal(result.activities.length, 1 + template.stops.length);
  });

  it("does not double the list when applied twice", () => {
    const once = applyTemplate(emptyItinerary(), template, uid);
    const twice = applyTemplate(once, template, uid);
    assert.equal(twice.activities.length, once.activities.length);
  });

  it("leaves every added stop unscheduled", () => {
    // Dropping six stops onto day one would be a plan nobody asked for.
    for (const activity of applyTemplate(emptyItinerary(), template, uid).activities) {
      assert.equal(activity.date, "");
    }
  });

  it("keeps notes somebody had already written", () => {
    const withNotes = trip({ notes: "Ask the hotel about the urn." });
    assert.match(applyTemplate(withNotes, template, uid).notes ?? "", /Ask the hotel about the urn\./);
  });
});

describe("counting days", () => {
  it("adds days without a timezone moving the answer", () => {
    assert.equal(datePlus("2026-07-05", 3), "2026-07-08");
    assert.equal(datePlus("2026-12-30", 3), "2027-01-02");
    assert.equal(datePlus("2026-07-05", 0), "2026-07-05");
  });

  it("says nothing when there is nothing to count from", () => {
    assert.equal(datePlus("", 3), "");
    assert.equal(datePlus("soon", 3), "");
  });
});

describe("what to suggest", () => {
  it("recognises the destination from the trip's own contents", () => {
    assert.equal(destinationForTrip(trip({ title: "Rome trip" }), vacationDestinations)?.slug, "rome");
    assert.equal(
      destinationForTrip(trip({ activities: [{ id: "a", name: "The Colosseum", date: "" }], title: "Holiday" }), vacationDestinations),
      null,
      "matched on a stop name that does not name the city",
    );
  });

  it("SUGGESTS NOTHING RATHER THAN GUESSING", () => {
    // A suggestion for the wrong city makes every other suggestion on the page
    // less believable.
    assert.equal(destinationForTrip(emptyItinerary(), vacationDestinations), null);
    assert.equal(destinationForTrip(trip({ title: "Somewhere warm" }), vacationDestinations), null);
  });
});

describe("the panel sits in front of the planner, not in its way", () => {
  it("is rendered above the editor and gates nothing", () => {
    assert.match(BUILDER, /<TripSetupPanel/);
    // Everything the planner could do before is still reachable with the panel
    // collapsed: it is a sibling of the editor, not a wrapper round it.
    assert.ok(BUILDER.indexOf("<TripSetupPanel") < BUILDER.indexOf("{/* Trip header */}"));
    assert.match(PANEL, /aria-expanded=\{open\}/);
  });

  it("explains where a guest draft and an account trip are stored", () => {
    assert.match(PANEL, /guest draft stays in this browser/);
    assert.match(PANEL, /Saved securely to your account/);
  });

  it("keeps “have us plan it” visible without interrupting", () => {
    assert.match(PANEL, /Have us plan it/);
    // Not a dialog, not a takeover — a strip inside the panel.
    assert.doesNotMatch(PANEL, /aria-modal/);
  });

  it("marks a finished step with more than a colour", () => {
    assert.match(PANEL, /step\.done \? "✓" : "○"/);
    assert.match(PANEL, /sr-only/);
  });
});

describe("the assistant asks about holidays first", () => {
  it("LEADS WITH VACATION PROMPTS", () => {
    // Whatever the examples say is what people believe the assistant is for.
    // All three used to be about kevarim.
    const examples = ASSISTANT.slice(ASSISTANT.indexOf("const EXAMPLES"), ASSISTANT.indexOf("];", ASSISTANT.indexOf("const EXAMPLES")));
    const first = examples.split("\n").find((line) => line.trim().startsWith('"'));
    assert.match(String(first), /vacation/i);
    for (const prompt of [
      "Find a kosher summer vacation for a family.",
      "Plan four days in Rome for a couple.",
      "Where is kosher food in Paris?",
      "Compare Alpine destinations for kosher travelers.",
      "Help me plan Shabbos in Paris.",
      "Plan a three-day heritage journey in Poland.",
    ]) {
      assert.ok(ASSISTANT.includes(prompt), `missing prompt: ${prompt}`);
    }
  });

  it("keeps a heritage prompt, last", () => {
    const examples = ASSISTANT.slice(ASSISTANT.indexOf("const EXAMPLES"), ASSISTANT.indexOf("];", ASSISTANT.indexOf("const EXAMPLES")));
    assert.ok(examples.indexOf("heritage journey in Poland") > examples.indexOf("kosher summer vacation"));
  });

  it("shows at most three examples until More examples is opened", () => {
    assert.match(ASSISTANT, /VISIBLE_EXAMPLES = 3/);
    assert.match(ASSISTANT, /More examples/);
  });
});
