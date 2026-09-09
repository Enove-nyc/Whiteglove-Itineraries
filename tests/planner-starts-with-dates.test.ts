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

/**
 * THE EDITOR READS LIKE THE FINISHED ITINERARY.
 *
 * The owner's point was that the public sample is easier to read than the
 * editor that produces it. It was: the sample lays every entry out as a time
 * column, a kind, a title and a detail line, and the editor wrote the same
 * facts as a sentence behind an emoji, with the time buried mid-sentence on a
 * 24-hour clock the printed document never uses.
 *
 * These hold the shape, not the wording — the same grid as SiteView in
 * components/SampleItineraryViews.tsx, and the same clock() the printed
 * document formats with.
 */
describe("a day card is laid out the way the finished itinerary is", () => {
  // `code()` strips comments, so these match the markup and not the notes above it.
  const src = code("components/ItineraryBuilder.tsx");
  const sample = code("components/SampleItineraryViews.tsx");

  it("uses the very grid the finished itinerary uses", () => {
    // Read from the sample rather than written out twice: if that layout
    // changes, this fails instead of quietly letting the two drift.
    const grid = /sm:grid-cols-\[5\.5rem_1fr\]/;
    assert.match(sample, grid, "the finished itinerary should still use this grid");
    assert.match(src, grid, "the editor should lay a day out the same way");
  });

  it("has one row component, shared by every kind of entry", () => {
    assert.match(src, /function DayRow\(/);
  });

  it("formats every time with the printed document's clock, not a raw 24-hour string", () => {
    assert.match(src, /import \{ clock \} from "@\/data\/itinerary-print"/);
    // The three places a time is shown on a day card: the row itself, a stop's
    // leaving time, and the day header's span.
    assert.ok((src.match(/clock\(/g) ?? []).length >= 4, "every time on the card goes through clock()");
    assert.doesNotMatch(src, /\{day\.startTime\}\n/, "the day header must not print a raw 24-hour time");
  });

  it("still gives every row its editing controls", () => {
    // A row that reads beautifully and cannot be changed is not an editor.
    assert.match(src, /actions=\{/);
  });
});

/**
 * THE ITEM FORMS OPEN ASKING WHAT THEY NEED — NOT TWENTY BLANKS.
 *
 * The owner's example was a flight: airline, number, date. Everything else —
 * From/To, times, booking reference, connections for a flight; address,
 * phone, booking reference for a stay; address, coordinates, phone, link,
 * duration for a stop — is folded behind a disclosure that opens itself the
 * moment there is something worth looking at: a successful lookup or pick, a
 * failed submit pointing at what is missing, or the traveller asking for it.
 * Editing something already on the trip starts open; there is nothing to
 * progressively disclose about a flight or a stay already filled in.
 */
describe("the item forms open minimal and expand, rather than showing everything at once", () => {
  const src = code("components/ItineraryBuilder.tsx");

  it("FlightForm starts closed for a new flight, open for editing one", () => {
    assert.match(src, /const \[expanded, setExpanded\] = useState\(Boolean\(initial\)\);/);
  });

  it("a failed submit opens whatever it is complaining about", () => {
    const at = src.indexOf('setError(`Please add the ${missing.join(", ")}.`);');
    assert.ok(at > -1);
    assert.match(src.slice(at, at + 200), /setExpanded\(true\)/);
  });

  it("a successful flight lookup opens the fold, since there is now something to check", () => {
    const at = src.indexOf("Found: ${data.flight.airline");
    assert.ok(at > -1);
    assert.match(src.slice(at - 300, at), /setExpanded\(true\)/);
  });

  it("there is a way in besides a successful lookup or a rejected submit", () => {
    assert.match(src, /or enter the details by hand/);
  });

  it("LodgingForm and ActivityForm fold the same way, and every pick opens them", () => {
    assert.match(src, /\+ Address, phone, booking reference…/);
    assert.match(src, /\+ Address, phone, link, duration, notes…/);
    // pickLodging, pickPlace, pickKever, pickAttraction — four pickers across
    // the two forms, each ending its own function with the same call.
    const setExpandedTrue = (src.match(/setExpanded\(true\);/g) ?? []).length;
    assert.ok(setExpandedTrue >= 6, `expected at least 6 setExpanded(true) call sites (flight error + flight lookup + 4 pickers), found ${setExpandedTrue}`);
  });

  it("required fields stay outside the fold — Name, and the dates a stay or a flight cannot exist without", () => {
    // If a required field were hidden by default, pressing Add on the closed
    // form would look like it did nothing, with no error to explain why.
    const lodging = src.slice(src.indexOf("function LodgingForm"), src.indexOf("function LodgingPicker"));
    const lodgingFold = lodging.indexOf("{expanded && (");
    assert.ok(lodging.indexOf('Field label="Name') < lodgingFold, "Name must render before the fold in LodgingForm");
    assert.ok(lodging.indexOf("Check-in") < lodgingFold, "Check-in must render before the fold in LodgingForm");

    const activity = src.slice(src.indexOf("function ActivityForm"), src.indexOf("function KeverPicker"));
    const activityFold = activity.indexOf("{expanded && (");
    assert.ok(activity.indexOf('Field label="Name') < activityFold, "Name must render before the fold in ActivityForm");
  });
});
