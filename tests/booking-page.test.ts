import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { BUILT_IN_WORDS } from "@/data/site-words";

/**
 * The booking page is about a holiday now.
 *
 * WHAT IT USED TO SAY. It compared "airlines and routes to the towns your trip
 * is built around", offered "kosher-friendly stays near the kever or in the
 * city", suggested "a rental for getting between towns and kevarim at your own
 * pace", and explained that a booking sits "alongside the kevarim and
 * destinations the journey is actually built around".
 *
 * Every one of those sentences was written when the site was a heritage
 * database with a travel page attached, and they are all true of a heritage
 * journey. Shown to a family booking a week in Rome — on the page where the
 * business now earns its money — they read as evidence that the page is not
 * for them.
 *
 * The heritage side is not diminished by this. It has its own section, and one
 * line here says these tools serve it too. What changed is that the general
 * booking page is now general.
 */

const PAGE = readFileSync("app/book/page.tsx", "utf8");
const PANEL = readFileSync("components/BookPartners.tsx", "utf8");

/** The page without its comments — those record the history deliberately. */
const PROSE = PAGE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const PANEL_PROSE = PANEL.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("what the page is about", () => {
  it("IS NOT ABOUT KEVARIM ANY MORE", () => {
    for (const word of ["kever", "kevarim", "shomer", "beis hachaim"]) {
      assert.doesNotMatch(PROSE, new RegExp(word, "i"), `the booking page still talks about ${word}`);
      assert.doesNotMatch(PANEL_PROSE, new RegExp(word, "i"), `the search panel still talks about ${word}`);
    }
  });

  it("SAYS SO ONCE, AND POINTS AT THE SECTION", () => {
    // Removing it entirely would be the opposite mistake: somebody planning a
    // heritage journey needs to know these tools work for them.
    assert.match(PROSE, /Planning a heritage journey\?/);
    assert.match(PROSE, /These booking tools work for that too/);
    assert.match(PROSE, /href="\/heritage"/);
    // ONCE, as a sentence and its link. A theme rather than a line is how it
    // got here the first time, so this counts rather than trusting the eye.
    const mentions = (PROSE.match(/heritage/gi) ?? []).length;
    assert.ok(mentions <= 3, `heritage is mentioned ${mentions} times on the general booking page`);
    assert.ok(mentions >= 1, "the heritage line has gone entirely");
  });

  it("opens on the destination, the dates and the kosher needs", () => {
    assert.match(BUILT_IN_WORDS.bookingNotice, /destination/i);
    assert.match(BUILT_IN_WORDS.bookingNotice, /dates/i);
    assert.match(BUILT_IN_WORDS.bookingNotice, /kosher/i);
    // Still the owner's line, or the settings screen has a field nothing reads.
    assert.match(PAGE, /\{words\.bookingNotice\}/);
  });
});

describe("getting to the fields", () => {
  it("PUTS THE SEARCH ABOVE THE PROSE", () => {
    // A headline, the owner's notice and a heritage aside used to sit above
    // the panel: three blocks of reading before anybody could type a city.
    const panel = PAGE.indexOf("<BookPartners");
    const notice = PAGE.indexOf("{words.bookingNotice}");
    const heritage = PAGE.indexOf("Planning a heritage journey?");
    assert.ok(panel > 0 && notice > 0 && heritage > 0);
    assert.ok(panel < notice, "the owner's notice is still above the search");
    assert.ok(panel < heritage, "the heritage line is still above the search");
  });

  it("keeps one short line of heading over it", () => {
    const beforePanel = PAGE.slice(PAGE.indexOf("<h1"), PAGE.indexOf("<BookPartners"));
    const paragraphs = beforePanel.match(/<p[\s>]/g) ?? [];
    assert.equal(paragraphs.length, 0, `${paragraphs.length} paragraphs still sit between the heading and the fields`);
  });
});

describe("saving to the trip", () => {
  it("does not offer Add to my trip before a partner search", () => {
    // At search time the traveller has not chosen a hotel, flight or car yet,
    // so the cash search action row never offers to put one on the trip.
    assert.doesNotMatch(PANEL_PROSE, /\+ Add to my trip/);
  });

  it("no longer asks for a booking code and guesses the flight", () => {
    // The after-partner "did you book it?" prompt is gone at the owner's word.
    // It asked for a booking reference and then added a flight built from the
    // SEARCH — route and dates — which could not know the airline, the time or
    // the flight number, so the entry was a guess with a code on it.
    assert.doesNotMatch(PANEL, /function BookedPrompt/);
    assert.doesNotMatch(PANEL_PROSE, /I booked it — add it to my trip/);
    assert.doesNotMatch(PANEL_PROSE, /Booking reference \(if you have it\)/);
    // What replaced it: a quiet pointer to the planner's Smart Import, which
    // reads the real confirmation and adds the actual details.
    assert.match(PANEL, /function BookedPointer/);
    assert.match(PANEL_PROSE, /Paste or forward the confirmation in the planner/);
    assert.match(PANEL, /href="\/itinerary"/);
  });
});

describe("hotels first", () => {
  it("OPENS ON HOTELS, not on flights", () => {
    // Accommodation is the one product this site knows something a comparison
    // site does not — which quarter makes Shabbos walkable — so it is the tab
    // that earns the visit.
    // The default is the prop's default now, because a link may ask for a
    // particular tab: /cars folded into this page and redirects to
    // ?type=cars, which the page resolves and hands in. Absent that, hotels.
    assert.match(PANEL, /initialKind = "hotels"/);
    assert.match(PANEL, /useState<Kind>\(initialKind\)/);
    const tabs = PANEL.slice(PANEL.indexOf("What are you booking?"));
    // chooseKind, not setKind: the tab is written to the address bar as well
    // as to state, so a reload comes back to the search somebody was in the
    // middle of. See tests/travel-provider-layer.test.ts.
    const order = ["hotels", "flights", "cars"].map((kind) => tabs.indexOf(`chooseKind("${kind}")`));
    assert.ok(order[0] >= 0 && order[0] < order[1] && order[1] < order[2], "the tab order is not hotels, flights, cars");
  });

  it("puts hotels first in the cash-and-points comparison too", () => {
    const comparison = PAGE.slice(PAGE.indexOf("const COMPARISON"), PAGE.indexOf("const NOT_YET"));
    assert.ok(comparison.indexOf('"Where to stay"') < comparison.indexOf('"Flights"'));
    assert.ok(comparison.indexOf('"Flights"') < comparison.indexOf('"Cars"'));
  });
});

describe("the commission disclosure", () => {
  it("LIVES IN THE TERMS, not under the book search", () => {
    // The book panel used to repeat it under every search; it belongs with the
    // booking terms instead. Partner search forms still disclose beside their
    // own actions — see PartnerSearchForm and BookingLink.
    assert.doesNotMatch(PANEL, /\{disclosure\}/);
    assert.doesNotMatch(PAGE, /disclosure=\{words\.affiliateDisclosure\}/);
    const terms = readFileSync("app/terms/page.tsx", "utf8");
    assert.match(terms, /affiliateDisclosure/);
    assert.match(terms, /How this site is paid/);
  });

  it("says what it has to say", () => {
    assert.match(BUILT_IN_WORDS.affiliateDisclosure, /commission/i);
    assert.match(BUILT_IN_WORDS.affiliateDisclosure, /no additional cost/i);
  });

  it("is one editable line rather than a sentence typed into a component", () => {
    assert.doesNotMatch(PANEL_PROSE, /may earn a commission/i);
    assert.doesNotMatch(PROSE, /may earn a commission/i);
  });
});

describe("a date is called what that product calls it", () => {
  const FORM = readFileSync("components/PartnerSearchForm.tsx", "utf8");

  it("DOES NOT CHECK A CAR IN AND OUT", () => {
    // The labels used to be keyed off the field set rather than the product,
    // and cars share the "stay" fields because they also ask where and when —
    // so /cars asked a visitor to "check in" a hire car and "check out" of it.
    // A room is checked into; a car is picked up and dropped off.
    //
    // The car search has since moved into the booking panel, which names those
    // dates correctly on its own — so the row below guards the component
    // rather than a page today. It is kept because the component still accepts
    // a car product, and the failure it prevents is silent: a car search
    // rendered through here again would read as a hotel stay and nothing would
    // look broken.
    assert.match(FORM, /car:\s*\["Pick-up",\s*"Drop-off"\]/);
    assert.match(FORM, /hotel:\s*\["Check in",\s*"Check out"\]/);
    assert.match(FORM, /flight:\s*\["Leaving",\s*"Coming back"\]/);
    // And the wording is no longer decided by the field set anywhere.
    assert.doesNotMatch(FORM, /fields === "stay" \? "Check in"/);
    assert.doesNotMatch(FORM, /fields === "stay" \? "Check out"/);
  });

  it("GIVES A TRANSFER NO TWO-DATE FORM AT ALL", () => {
    // A transfer is one journey on one date, not a period with two ends.
    // There is no transfer row in the table, and there must not be one: the
    // hand-off is a landing link and the partner asks for the date. A row here
    // would build a form nothing renders and assert that a transfer spans two
    // dates while doing it.
    assert.doesNotMatch(FORM, /transfer:\s*\[/);
    const TRANSFERS = readFileSync("app/transfers/page.tsx", "utf8");
    assert.doesNotMatch(TRANSFERS, /PartnerSearchForm/);
    assert.doesNotMatch(TRANSFERS, /Check in|Check out/);
  });
});

describe("what is not bookable is named", () => {
  it("SAYS SO RATHER THAN OFFERING A TAB THAT CANNOT WORK", () => {
    // The brief names transfers and activities alongside hotels, flights and
    // cars. Where no programme is joined the registry refuses to build a link,
    // so it is a sentence with what to do instead rather than a form that takes
    // somebody's dates and gives them nothing.
    assert.match(PROSE, /Things to do/);
    assert.match(PROSE, /We do not sell tickets yet/);
    // Drivers joined them when /cars folded into this page: that page named
    // three ways of getting around and only car hire was ever bookable.
    assert.match(PROSE, /Drivers on a heritage route/);
    // And each points somewhere that does help. There is no /cars button here
    // any more — the car search is a tab at the top of this same page, so a
    // link to it was a link back up the page you were already on.
    assert.doesNotMatch(PROSE, /["'`]\/cars/);
    // The link now travels with the card it belongs to rather than sitting in
    // a row of buttons underneath, so it is declared beside its own sentence.
    assert.match(PROSE, /href: "\/directory"/);
    assert.match(PROSE, /href: "\/things-to-do"/);
    assert.match(PROSE, /href=\{link\.href\}/);
  });

  it("DROPS AN ENTRY BY READING THE SETTINGS, NOT BY BEING EDITED", () => {
    // The transfers apology was hardcoded, so it survived the launch of the
    // thing it apologised for: /book told visitors transfers were not on offer
    // on the same screen as a working transfer card. Nothing failed and nothing
    // looked broken — a person found it by clicking.
    //
    // The list is filtered against the hand-off settings now, so it cannot fall
    // out of step again. These assertions are the mechanism, not the wording:
    // an entry names the hand-off that replaces it, and the page asks whether
    // that hand-off is live.
    assert.match(PAGE, /essentialIsBookable/);
    assert.match(PAGE, /NOT_YET\.filter/);
    assert.match(PAGE, /notYet\.map/);
    assert.doesNotMatch(PAGE, /NOT_YET\.map/, "the page still renders the unfiltered list");
    // Things to do names the tours hand-off, so it goes when tours go live.
    assert.match(PAGE, /"activity",/);
    // The counting sentence went in the wording pass, and no typed count may
    // replace it — "Two things" was written when there were two and stayed
    // while the list changed underneath it.
    assert.doesNotMatch(PROSE, /things people ask us for/i);
  });

  it("STOPS SAYING IT ONCE THE PRODUCT IS BOOKABLE", () => {
    // Airport transfers were on the not-bookable list while there was no
    // programme behind them. There is one now, and it has its own page — so
    // the booking page must not still be telling visitors the opposite on the
    // same screen as the transfer card. This is the assertion that fails if a
    // product is ever launched and its apology left behind.
    assert.doesNotMatch(PROSE, /We do not book transfers yet/);
    assert.doesNotMatch(PROSE, /Airport transfers/);
    // The hand-off itself is the Travel Essentials transfer card, which this
    // page already renders — so there is no separate button to assert here,
    // and adding one would be a second front door to the same product.
    assert.match(PROSE, /TravelEssentials/);
    // "Cars and transfers" was one label over two products that are chosen
    // instead of each other. It must not come back.
    assert.doesNotMatch(PROSE, /Cars and transfers/);
  });
});
