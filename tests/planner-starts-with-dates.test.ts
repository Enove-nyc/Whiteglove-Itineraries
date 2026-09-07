import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * AN EMPTY TRIP IS ONE CARD, NOT ELEVEN SCREENS.
 *
 * Opened on a phone with no trip yet, the planner rendered 4,233px of page:
 * a five-step checklist whose first step said "set the trip dates" and offered
 * no date control (the fields were in a collapsed disclosure further down),
 * three templates, a card about where the trip is saved, a toolbar of seven
 * equal buttons, three collapsed panels, a flight-booking pitch, a SECOND
 * "choose your dates to begin" box, a promo and the hand-off. The owner's
 * customers said "it is very hard to build an itinerary". This is why.
 *
 * Now: the dates are asked for first, in one card, and the rest of the planner
 * appears once they exist. These tests read the source, the way the other
 * planner tests do, and hold the shape rather than the wording.
 */

function code(path: string): string {
  return readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("the setup panel asks for the dates itself", () => {
  const src = code("components/TripSetupPanel.tsx");

  it("renders real date controls in the start card, not a hint about them", () => {
    const card = src.slice(src.indexOf("{!datesDone && ("), src.indexOf("{open && ("));
    assert.ok(card.length > 200, "the start card should sit before the collapsible body");
    assert.equal((card.match(/<DateField/g) ?? []).length, 2, "a first day and a last day");
    assert.match(card, /Trip name/);
    assert.match(card, /Create trip/);
  });

  it("keeps the end date from landing before the start", () => {
    assert.match(src, /correctedEnd\(startDate, d\.endDate\)/);
    assert.match(src, /min=\{earliestEnd\(draft\.startDate\)\}/);
  });

  it("cannot create a trip without both dates, and needs nothing else", () => {
    assert.match(src, /disabled=\{!draft\.startDate \|\| !draft\.endDate\}/);
    assert.match(src, /none of them is required now/);
  });

  it("shows the start card even when the setup help is hidden", () => {
    // The card is outside `{open && (...)}`: hiding the checklist must not
    // hide the only way to begin.
    assert.ok(src.indexOf("{!datesDone && (") < src.indexOf('{open && (\n        <div id="trip-setup-body"'));
  });

  it("does not spend a whole card telling a signed-in person their trip is saved", () => {
    assert.match(src, /signedIn \? \(\s*<p[^>]*>Saved securely to your account as you type\.<\/p>/);
  });
});

describe("the builder waits for the dates before showing the rest", () => {
  const src = code("components/ItineraryBuilder.tsx");
  const at = (needle: string) => { const i = src.indexOf(needle); assert.ok(i >= 0, `missing: ${needle}`); return i; };

  it("gates the countdown strip, the toolbar section, the side panels and the booking pitch on hasDates", () => {
    assert.match(src.slice(at("<TripProgressStrip") - 40, at("<TripProgressStrip")), /\{hasDates && \(/);
    assert.match(src.slice(at("<section className=") - 80, at("<section className=")), /\{hasDates && \(/, "trip header + toolbar");
    assert.match(src.slice(at('<div className="grid gap-3 md:grid-cols-2">') - 40, at('<div className="grid gap-3 md:grid-cols-2">')), /\{hasDates && \(/, "travelers/share/rooms");
    assert.match(src, /\{hasDates && <BookFlightsPanel itin=\{itin\} \/>\}/);
  });

  it("no longer prompts for dates a second time", () => {
    assert.doesNotMatch(src, /Choose your dates to begin\./);
    assert.doesNotMatch(src, /Choose start and end dates to begin\./);
  });

  it("makes one toolbar button lead, chosen by the same rule as the checklist", () => {
    assert.match(src, /const nextSetup = setupProgress\(setupSteps\(itin\)\)\.next\?\.id;/);
    assert.match(src, /className=\{toolbarButton\(nextSetup === "flights"\)\}>Flight</);
    assert.match(src, /className=\{toolbarButton\(nextSetup === "stay"\)\}>Hotel</);
    assert.match(src, /className=\{toolbarButton\(nextSetup === "stops"\)\}>Stop</);
    // Plan my route stops shouting when there is nothing unscheduled to place.
    assert.match(src, /toolbarButton\(unscheduled\.length > 0\)/);
  });

  it("gives every toolbar button a 44px target", () => {
    const helper = src.slice(at("const toolbarButton"), at("const toolbarButton") + 600);
    assert.equal((helper.match(/min-h-11/g) ?? []).length, 2);
  });

  it("still lets the day cards do the day-level adding they already did", () => {
    // Nothing removed: the per-day "Add a stop to this day" and the move
    // arrows are the working area once dates exist.
    assert.match(src, /Add a stop to this day/);
    assert.match(src, /aria-label=\{`Move \$\{a\.name\} earlier`\}/);
  });
});
