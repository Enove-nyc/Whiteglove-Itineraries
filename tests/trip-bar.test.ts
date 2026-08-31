import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { TRIP_PLACES, tripPlacesFor } from "@/lib/account-places";
import { tripBar, tripBarDates, tripBarTitle, tripRowMeta } from "@/lib/trip-bar";

/**
 * WHICH TRIP AM I ON.
 *
 * The advisor's work on one trip is six separate top-level pages —
 * /itinerary, /proposal, /addons, /forms, /payments, /group — each a
 * standalone screen operating on whichever trip is open on the account. Not
 * one of them said which trip that was, and getting from Payments to Proposals
 * meant leaving through the global menu and coming back in.
 *
 * The only screen that names a trip is the pipeline, which is the screen an
 * advisor has to leave to do any of this. So somebody with twenty clients
 * carried "the open trip is the Harpers" in their head across every page — and
 * a mistake was invisible, because the screens look identical whichever trip
 * is behind them.
 *
 * THE BAR CANNOT BE OPENED IN THIS CONTAINER. All six pages need a signed-in
 * account and a connected store, and there is neither here. So the half that
 * can be got wrong — the dates, the fallback name, and when the bar should not
 * appear at all — is pure, and this is where it is checked.
 */

const HARPERS = {
  name: "Rome — a week",
  client: "The Harpers",
  itinerary: { title: "Rome", startDate: "2026-10-25", endDate: "2026-11-01" },
};

describe("what the bar says", () => {
  it("leads with the client, because that is what an advisor checks", () => {
    const bar = tripBar(HARPERS, "starter");
    assert.equal(bar?.client, "The Harpers");
    assert.equal(bar?.title, "Rome — a week");
  });

  it("has no client on somebody's own trip, rather than an empty space", () => {
    const bar = tripBar({ ...HARPERS, client: "   " }, "starter");
    assert.equal(bar?.client, null);
  });

  it("falls back to the itinerary's title, then to something rather than nothing", () => {
    // A trip is created before it is named, so both of these happen.
    assert.equal(tripBarTitle({ name: "  ", itinerary: { title: "Rome" } }), "Rome");
    assert.equal(tripBarTitle({}), "This trip");
  });
});

describe("the dates, as short as they can be said", () => {
  it("says the month once when the trip is inside one", () => {
    assert.equal(tripBarDates({ startDate: "2026-10-25", endDate: "2026-10-29" }), "25–29 Oct 2026");
  });

  it("says both months when it crosses one", () => {
    assert.equal(tripBarDates({ startDate: "2026-10-25", endDate: "2026-11-01" }), "25 Oct – 1 Nov 2026");
  });

  it("says both years when it crosses one", () => {
    assert.equal(tripBarDates({ startDate: "2026-12-28", endDate: "2027-01-03" }), "28 Dec 2026 – 3 Jan 2027");
  });

  it("does not print a range for a one-day trip", () => {
    assert.equal(tripBarDates({ startDate: "2026-10-25", endDate: "2026-10-25" }), "25 Oct 2026");
  });

  it("SAYS HALF A RANGE RATHER THAN A DANGLING DASH", () => {
    // A trip half-entered is the normal state of a trip being planned, and
    // "25 Oct – " is not a date.
    assert.equal(tripBarDates({ startDate: "2026-10-25" }), "From 25 Oct 2026");
    assert.equal(tripBarDates({ endDate: "2026-11-01" }), "Until Nov 1, 2026");
  });

  it("says nothing at all when there are no dates yet", () => {
    assert.equal(tripBarDates({}), null);
    assert.equal(tripBarDates(undefined), null);
  });

  it("does not print rubbish for a date that is not one", () => {
    assert.equal(tripBarDates({ startDate: "soon", endDate: "later" }), null);
    assert.equal(tripBarDates({ startDate: "2026-13-40" }), null);
  });
});

describe("when the bar should not be there at all", () => {
  it("is nothing without a trip", () => {
    assert.equal(tripBar(null, "pro"), null);
    assert.equal(tripBar(undefined, "pro"), null);
  });

  it("IS NOTHING FOR A PLAN THAT CAN REACH ONE SCREEN", () => {
    /**
     * One Trip reaches the itinerary and none of the other five. A navigation
     * bar whose only link is the page you are already on is furniture, and it
     * would sit on the one screen a traveller planning their own trip uses.
     */
    assert.equal(tripPlacesFor("one_trip").length, 1);
    assert.equal(tripBar(HARPERS, "one_trip"), null);
  });

  it("is nothing before a plan is chosen", () => {
    assert.equal(tripBar(HARPERS, "free"), null);
    assert.equal(tripBar(HARPERS, undefined), null);
  });

  it("is there for the plans that move between the screens", () => {
    for (const plan of ["starter", "pro"] as const) {
      assert.ok(tripBar(HARPERS, plan), `no bar on ${plan}`);
      assert.equal(tripBar(HARPERS, plan)!.places.length, TRIP_PLACES.length);
    }
  });
});

describe("it offers no door a plan does not open", () => {
  it("gates on the same rule the pages themselves check", () => {
    const places = readFileSync("lib/account-places.ts", "utf8");
    assert.match(places, /export function tripPlacesFor/);
    assert.match(places, /mayServeCompanionClients\(plan\)/);
  });

  for (const place of TRIP_PLACES) {
    it(`${place.href} is a page that exists`, () => {
      // Every link goes somewhere that was already there. The bar adds no
      // screens; it stops the advisor having to remember where they are.
      const page = readFileSync(`app${place.href}/page.tsx`, "utf8");
      assert.ok(page.length > 100, `app${place.href}/page.tsx is not a real page`);
    });
  }

  it("brings /addons into a menu for the first time", () => {
    // It was trip work reachable only by typing the address — in no nav list
    // anywhere, including the advisor tools menu.
    assert.ok(TRIP_PLACES.some((p) => p.href === "/addons"));
  });

  it("leaves the tools that span every trip out of it", () => {
    // Pipeline, Library and Agency are not about one trip and have no business
    // in a bar that is.
    for (const notHere of ["/pipeline", "/library", "/agency"]) {
      assert.ok(!TRIP_PLACES.some((p) => p.href === notHere), `${notHere} is in the trip bar`);
    }
  });

  it("is not a second way to change which trip is open", () => {
    // Switching lives on the pipeline, where the list of trips is. Two ways to
    // change it is how two screens end up disagreeing about which one it is.
    const bar = readFileSync("components/TripContextBar.tsx", "utf8");
    assert.doesNotMatch(bar, /action: "switch"/);
    assert.doesNotMatch(bar, /<select/);
  });
});

describe("it is on every screen that is about a trip", () => {
  for (const place of TRIP_PLACES) {
    it(`${place.href} shows it, and marks itself as the one you are on`, () => {
      const page = readFileSync(`app${place.href}/page.tsx`, "utf8");
      assert.match(page, /<TripContextBar current="/, `app${place.href}/page.tsx has no trip bar`);
      assert.ok(
        page.includes(`<TripContextBar current="${place.href}" />`),
        `app${place.href}/page.tsx passes the wrong current path`,
      );
    });
  }

  it("marks the current one for a screen reader, not only by colour", () => {
    const bar = readFileSync("components/TripContextBar.tsx", "utf8");
    assert.match(bar, /aria-current=\{on \? "page" : undefined\}/);
    assert.match(bar, /aria-label="This trip"/);
  });

  it("scrolls sideways rather than stacking into three rows on a phone", () => {
    // Six links wrapped is three rows of chrome above the content, which is
    // the permanent sticky furniture this was meant to avoid.
    assert.match(readFileSync("components/TripContextBar.tsx", "utf8"), /overflow-x-auto/);
  });
});

describe("the line under a trip's name in the list", () => {
  /**
   * IT DID NOT SAY WHEN THE TRIP WAS.
   *
   * The row read "3 stops · 8 days · in 2 months · 5 saved · client code
   * created" — five facts, and the one an advisor picks a trip out of a list
   * by was not among them. "8 days" is not a date and "in 2 months" is not a
   * date; twenty trips sorted by neither are twenty rows you have to open to
   * tell apart.
   *
   * Two of the five were not worth the room either. "5 saved" is a count of
   * places inside the trip and means nothing from outside it. "client code
   * created" is the name of a database field.
   */
  const HARPER_ROW = { stops: 12, days: 8, startDate: "2026-10-25", endDate: "2026-11-01", shareId: "abc" };

  it("leads with the dates", () => {
    assert.ok(tripRowMeta(HARPER_ROW, "in 2 months").startsWith("25 Oct – 1 Nov 2026"));
  });

  it("says so plainly when a trip has no dates yet", () => {
    // Rather than leaving the row starting with a stop count and no when.
    assert.ok(tripRowMeta({ stops: 3 }, null).startsWith("No dates yet"));
  });

  it("drops the two that were not worth the room", () => {
    const said = tripRowMeta(HARPER_ROW, "in 2 months");
    assert.doesNotMatch(said, /saved/);
    assert.doesNotMatch(said, /code created/);
  });

  it("says what the code MEANS, not what the field is called", () => {
    assert.match(tripRowMeta(HARPER_ROW, null), /client can open it/);
    assert.doesNotMatch(tripRowMeta({ ...HARPER_ROW, shareId: undefined }, null), /client can open/);
  });

  it("leaves out a count that is nought rather than printing it", () => {
    const said = tripRowMeta({ stops: 0, days: 0, startDate: "2026-10-25", endDate: "2026-10-25" }, null);
    assert.equal(said, "25 Oct 2026");
  });

  it("is what the list actually renders", () => {
    const list = readFileSync("components/TripSwitcher.tsx", "utf8");
    assert.match(list, /tripRowMeta\(trip, countdownPhrase\(/);
    // The old hand-built line, with its two dead facts, is gone.
    const code = list.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.doesNotMatch(code, /client code created/);
    assert.doesNotMatch(code, /\$\{trip\.places\} saved/);
  });

  it("makes the trip's name a heading rather than another link", () => {
    // Underlined in gold at rest, above an underlined client line and meta
    // line, every row read as a paragraph of links with nothing standing out.
    const list = readFileSync("components/TripSwitcher.tsx", "utf8");
    assert.match(list, /text-base font-semibold text-\[var\(--navy\)\]/);
    assert.match(list, /decoration-transparent decoration-2 underline-offset-4 transition hover:decoration-\[var\(--gold\)\]/);
  });
});
