import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { attractions } from "@/data/attractions";
import { buildDays, formatDateLong, travelersOf } from "@/data/itinerary";
import { buildPrintTimeline } from "@/data/itinerary-print";
import { kosherAreas } from "@/data/kosher-stays";
import { SAMPLE_ITINERARY, SAMPLE_NOTICE, WHAT_IS_IN_IT } from "@/data/sample-itinerary";
import { publicPaths } from "@/lib/site-map";

/**
 * The sample itinerary is the proof the free tools produce something real.
 * What it protects: every place on it is a record this site actually holds,
 * nothing on it claims to be booked, and it says plainly that it is a sample.
 * A made-up stop or an invented confirmation number would be the one false
 * line on the one document meant to demonstrate the site tells the truth.
 *
 * Split out of what was tests/proof-and-pricing.test.ts once the services
 * page — and the pricing panel this file used to test alongside the sample —
 * were removed. This half had nothing to do with either.
 */

const SAMPLE_PAGE = readFileSync("app/sample-itinerary/page.tsx", "utf8");
const VIEWS = readFileSync("components/SampleItineraryViews.tsx", "utf8");
const SAMPLE_DATA = readFileSync("data/sample-itinerary.ts", "utf8");

describe("the sample itinerary", () => {
  it("IS BUILT BY THE PLANNER, not drawn as a mock-up", () => {
    // If the printed itinerary changes, the sample changes with it. That is
    // the only way a sample stays true to what is delivered.
    //
    // The page hands one trip to SampleItineraryViews, which draws it three
    // ways — on the site, in the app, printed. The rule is unchanged and the
    // assertion follows the render rather than the file it used to be in.
    assert.match(SAMPLE_PAGE, /<SampleItineraryViews itin=\{SAMPLE_ITINERARY\}/);
    assert.match(VIEWS, /<PrintableItinerary itin=\{itin\}/);
    // Embedded, so the document's headings nest under the page's rather than
    // giving it a second h1.
    assert.match(VIEWS, /embedded/);
    const days = buildDays(SAMPLE_ITINERARY, undefined);
    assert.equal(days.length, 8);
    assert.ok(days.every((day) => buildPrintTimeline(day, {}).length > 0), "a day in the sample renders empty");
  });

  it("NAMES ONLY PLACES THE SITE ALREADY PUBLISHES", () => {
    // Every place on it is a record with a source behind it. A stop invented
    // for the sample would be the one line on the document that was not true
    // of anywhere.
    const known = new Set<string>([
      ...attractions.filter((entry) => entry.city === "Rome").map((entry) => entry.name),
      ...kosherAreas.filter((entry) => entry.city === "Rome").map((entry) => entry.name),
    ]);
    const placed = SAMPLE_ITINERARY.activities.filter((activity) => activity.coordinates);
    assert.ok(placed.length >= 5);
    for (const activity of placed) {
      const matchesRecord =
        known.has(activity.name) ||
        // The Ghetto quarter, referred to by its street rather than by the
        // full record name. Same coordinate, which is what is checked.
        kosherAreas.some((area) => area.city === "Rome" && area.coordinates === activity.coordinates) ||
        attractions.some((entry) => entry.city === "Rome" && entry.coordinates === activity.coordinates);
      assert.ok(matchesRecord, `${activity.name} is not a record this site holds`);
    }
  });

  it("NAMES NO HOTEL, NO AIRLINE AND NO CONFIRMATION", () => {
    // Each of those would be a claim about something that has not happened.
    for (const flight of SAMPLE_ITINERARY.flights) {
      assert.equal(flight.airline, undefined, "the sample names an airline");
      assert.equal(flight.flightNo, undefined, "the sample invents a flight number");
      assert.equal(flight.confirmation, undefined, "the sample invents a booking reference");
    }
    for (const stay of SAMPLE_ITINERARY.lodging) {
      assert.equal(stay.confirmation, undefined);
      assert.match(stay.name, /^A hotel/, "the sample names a specific property");
    }
    assert.doesNotMatch(SAMPLE_DATA, /[€$£]\s?\d/, "the sample quotes a price");
  });

  it("SAYS IT IS A SAMPLE, on the page and in the data", () => {
    assert.match(SAMPLE_NOTICE, /sample, not a booking/i);
    assert.match(SAMPLE_PAGE, /SAMPLE_NOTICE/);
    assert.match(SAMPLE_PAGE, /as it arrives/i);
  });

  it("shows the parts an ordinary itinerary gets wrong", () => {
    const dates = SAMPLE_ITINERARY.activities.map((activity) => activity.date);
    // A Friday that stops early, a Shabbos with nothing timed on it, and a day
    // with nothing planned. Those three are the reason this sample exists.
    const shabbos = SAMPLE_ITINERARY.activities.find((activity) => activity.date === "2026-10-31");
    assert.ok(shabbos, "the sample has no Shabbos on it");
    assert.equal(shabbos.startTime, undefined, "the Shabbos entry carries a time");
    assert.ok(dates.includes("2026-10-30"), "no erev Shabbos");
    assert.ok(
      SAMPLE_ITINERARY.activities.some((activity) => /unplanned/i.test(activity.name)),
      "every day on the sample is full",
    );
    // The Friday really is a Friday.
    assert.match(formatDateLong("2026-10-30"), /^Friday/);
    assert.match(formatDateLong("2026-10-31"), /^Saturday/);
  });

  it("is a real family rather than one traveler", () => {
    const travelers = travelersOf(SAMPLE_ITINERARY);
    assert.equal(travelers.length, 5);
    assert.equal(travelers.filter((traveler) => traveler.kind === "child").length, 3);
    // No real names on a published document.
    for (const traveler of travelers) assert.match(traveler.name, /^(Adult|Child)$/);
  });

  it("INVENTS NO TESTIMONIAL to go with it", () => {
    const prose = SAMPLE_PAGE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.doesNotMatch(prose, /“[^”]{20,}”\s*—\s*[A-Z]/);
    // The page no longer announces the absence either. Saying "there is no
    // testimonial here" is an argument with an objection the reader has not
    // made, and it is the site talking about itself — see tests/site-voice.
    // What it does instead is name what a real itinerary carries that this
    // sample does not, which is information rather than a defence.
    assert.match(SAMPLE_PAGE, /About this sample/);
    assert.match(SAMPLE_PAGE, /Your itinerary names the hotel/);
  });

  it("says what is in it, and is reachable", () => {
    assert.ok(WHAT_IS_IN_IT.length >= 5);
    const paths = new Set(publicPaths().map((entry) => entry.path));
    assert.ok(paths.has("/sample-itinerary"), "the sample is not in the sitemap");
    // The header dropdowns are five short categories and the footer is five
    // links — neither has room for every page. This one is linked directly
    // from the itinerary planner, where somebody deciding whether to start
    // building a trip would actually look for it.
    const ITINERARY = readFileSync("app/itinerary/page.tsx", "utf8");
    assert.match(ITINERARY, /href="\/sample-itinerary"/, "no way to the sample from the itinerary planner");
  });
});

describe("the document a phone is shown is the whole document", () => {
  const PRINTABLE = readFileSync("components/PrintableItinerary.tsx", "utf8");

  /**
   * FOUND LIVE, AND MEASURED. Every sheet in here is 8.5in — 816px — and at a
   * 390px viewport it neither shrank nor scrolled: the right-hand third was
   * simply cut off, taking the corner arc, the right edge of the times column
   * and part of every day's header with it. Confirmed at 390x844 and
   * 768x1024, where the sheets ran to x=849 and x=873 inside content areas of
   * 375 and 753.
   *
   * That is the one public piece of evidence for what this product produces,
   * on the site that sells it, and an advisor deciding on a phone saw two
   * thirds of it.
   *
   * Not solved by scaling: 46% of an 8.5px foot is 4px, which is complete and
   * unreadable. Below 900px the sheet stops being a sheet.
   */
  it("stops laying out a letter-size sheet below 900px", () => {
    assert.match(PRINTABLE, /@media screen and \(max-width: 900px\)/);
    const narrow = PRINTABLE.slice(PRINTABLE.indexOf("@media screen and (max-width: 900px)"));
    assert.match(narrow, /\.wg-page \{[^}]*width: auto/, "the sheet keeps its 8.5in width on a phone");
    assert.match(narrow, /\.wg-frame, \.wg-arc \{ display: none; \}/, "paper decorations still crop");
    assert.match(narrow, /\.wg-timeline li \{ grid-template-columns: 1fr/, "the inch-measured timeline still cannot fit");
  });

  it("leaves the printed page alone", () => {
    // The two never apply together — one is screen, one is print — and the
    // printed PDF is the actual deliverable. If this ever stops restoring the
    // sheet for print, the document being sold stops being letter-size.
    assert.match(PRINTABLE, /@media print \{[\s\S]*?\.wg-page \{ margin: 0; box-shadow: none; width: auto/);
    assert.match(PRINTABLE, /@page \{ size: letter/);
    // And the desktop sheet is still a sheet.
    assert.match(PRINTABLE, /width: 8\.5in; min-height: 11in/);
  });
});

describe("the sample is the trip, not only the printout", () => {
  /**
   * THE PAGE SHOWED ONE OF THE THREE PLACES A TRIP LIVES. A printable document
   * is a real deliverable and it stays — but it was standing in for the
   * planner and the phone as well, so somebody deciding whether to plan a trip
   * here was handed a PDF and asked to imagine the rest of the product.
   *
   * All three are the same SAMPLE_ITINERARY. The days come from buildDays(),
   * which lays out a customer's trip, and the app view goes through
   * buildCompanionFromItinerary() — the conversion a real client link uses.
   * Nothing on this page is a picture of a screen.
   */
  it("offers all three views", () => {
    for (const value of ['value: "site"', 'value: "app"', 'value: "print"']) {
      assert.ok(VIEWS.includes(value), `the sample has no ${value} view`);
    }
    assert.match(VIEWS, /<CompanionApp trip=\{\{ \.\.\.companion, previewAsClient: true \}\}/);
    assert.match(VIEWS, /<PrintableItinerary itin=\{itin\}/);
  });

  it("builds the app view from the same trip, through the real conversion", () => {
    // A hand-written second sample would drift from the first the day either
    // changed, and the page's whole claim is that this is what is produced.
    assert.match(SAMPLE_PAGE, /buildCompanionFromItinerary\(SAMPLE_ITINERARY/);
    assert.doesNotMatch(SAMPLE_PAGE, /COMPANION_DEMO_TRIP/, "the app view is a different trip from the document");
  });

  it("opens the app on the trip's own first day", () => {
    // The sample is a fixed week in the calendar. An app told that today is
    // some month afterwards opens on a trip that has finished, which is the
    // one thing this page must not show.
    assert.match(SAMPLE_PAGE, /today: SAMPLE_ITINERARY\.startDate/);
  });

  it("keeps the kosher layer to the kosher site", () => {
    // Zmanim and a walk to a minyan are the guide's work; the other domain
    // sells a general-travel product.
    assert.match(SAMPLE_PAGE, /kosher: brandNow !== "itineraries"/);
  });

  it("draws the site view for a screen rather than shrinking the sheet", () => {
    // Paper wants a sheet per day and a fixed measure; a page wants to be read
    // down. Same entries, same order, same computed times.
    assert.match(VIEWS, /function SiteView/);
    assert.match(VIEWS, /buildDays\(itin\)/);
    assert.match(VIEWS, /buildPrintTimeline\(day\)/);
  });

  it("asks which view as one question with three answers", () => {
    assert.match(VIEWS, /<fieldset/);
    assert.match(VIEWS, /<legend className="sr-only">How would you like to see the sample\?<\/legend>/);
    assert.match(VIEWS, /type="radio"/);
    assert.match(VIEWS, /min-h-11/);
  });

  it("hides the app tab rather than opening an empty frame", () => {
    // buildCompanionFromItinerary returns null for a trip with no dates.
    assert.match(VIEWS, /tab\.value === "app" && !companion\) return null/);
  });

  it("no longer calls the whole page 'the document'", () => {
    // It is one of three now, and the page saying otherwise was the exact
    // impression this work exists to correct.
    assert.doesNotMatch(SAMPLE_PAGE, />\s*The document\s*</);
    assert.match(SAMPLE_PAGE, /The same week, three ways/);
  });
});
