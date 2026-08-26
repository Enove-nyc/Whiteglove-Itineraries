import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ACCOUNT_PLACES, advisorPlacesFor } from "@/components/AccountMenu";

/**
 * The four places an account has.
 *
 * The icon used to go straight to /account — a page holding itineraries, the
 * route, favorites and the person's own details. Somebody who wanted their
 * trips landed on their own name and address and scrolled.
 */
const MENU = readFileSync("components/AccountMenu.tsx", "utf8");
const NAV = readFileSync("components/Navbar.tsx", "utf8");

describe("what the account icon offers", () => {
  it("NAMES THE FOUR, WITH MY INFO LAST", () => {
    assert.deepEqual(
      ACCOUNT_PLACES.map((place) => place.label),
      ["Itineraries", "Routes", "Favorites", "My info"],
    );
  });

  it("sends each one somewhere that exists", () => {
    assert.equal(ACCOUNT_PLACES[0].href, "/itinerary");
    assert.equal(ACCOUNT_PLACES[1].href, "/my-route");
    assert.equal(ACCOUNT_PLACES[3].href, "/account");
  });

  it("REACHES FAVORITES BY ITS ANCHOR, BECAUSE IT HAS NO PAGE", () => {
    // Favorites is a section of the account page and is deliberately kept off
    // the header icons and the mobile bar. The anchor must be the one the
    // account page actually renders, or this scrolls nowhere.
    const anchor = ACCOUNT_PLACES[2].href;
    assert.equal(anchor, "/account#account-favorites");
    const panel = readFileSync("components/AccountRoutePanel.tsx", "utf8");
    assert.match(panel, /id="account-favorites"/, "the anchor this menu points at does not exist");
  });
});

describe("how the menu behaves", () => {
  it("is a menu to a screen reader, not four links in a box", () => {
    assert.match(MENU, /aria-haspopup="menu"/);
    assert.match(MENU, /role="menu"/);
    assert.match(MENU, /role="menuitem"/);
    assert.match(MENU, /aria-expanded=\{open\}/);
  });

  it("closes on Escape and on a press outside", () => {
    assert.match(MENU, /event\.key === "Escape"/);
    assert.match(MENU, /!box\.current\.contains\(event\.target as Node\)/);
  });

  it("DOES NOT TRAP THE KEYBOARD, BECAUSE IT IS NOT A DIALOG", () => {
    // Four links beside a page. Trapping Tab in them would be a worse answer
    // than letting it carry on into the page.
    assert.doesNotMatch(MENU, /useFocusTrap/);
  });

  it("closes when one of them is followed", () => {
    assert.match(MENU, /onClick=\{\(\) => setOpen\(false\)\}/);
  });
});

describe("signed out, there is a door rather than a menu", () => {
  it("OPENS THE SIGN-IN DIALOG INSTEAD OF OFFERING FOUR CLOSED ROOMS", () => {
    assert.match(NAV, /\{signedIn \? \(\s*\n\s*<AccountMenu plan=\{plan\} \/>/);
    assert.match(NAV, /<IconLink icon="account" label="Sign in"[\s\S]{0,120}onClick=\{\(\) => openSignIn\(\)\}/);
  });

  it("names the same places in the menu that IS the navigation on a phone", () => {
    // Below xl the header collapses, and one "Account" link there would hide
    // the rest — the four personal places and, for an advisor plan, the tool
    // links too.
    assert.match(NAV, /\[\.\.\.ACCOUNT_PLACES, \.\.\.advisorPlacesFor\(plan\)\]\.map\(\(place\) => \(/);
  });
});

describe("the advisor tools have a home in the menu too", () => {
  it("offers nothing for a signed-in account with no plan yet", () => {
    assert.deepEqual(advisorPlacesFor("free"), []);
    assert.deepEqual(advisorPlacesFor(undefined), []);
  });

  it("offers nothing for one trip — it never serves a client", () => {
    assert.deepEqual(advisorPlacesFor("one_trip"), []);
  });

  it("gives Starter the client tools but not Agency, which needs Pro's own brand", () => {
    const labels = advisorPlacesFor("starter").map((place) => place.label);
    assert.ok(labels.includes("Trip pipeline"));
    assert.ok(labels.includes("Proposals"));
    assert.ok(labels.includes("Content library"));
    assert.ok(labels.includes("Client forms"));
    assert.ok(labels.includes("Payments"));
    assert.ok(!labels.includes("Agency"));
  });

  it("gives Pro everything, Agency included", () => {
    const labels = advisorPlacesFor("pro").map((place) => place.label);
    assert.ok(labels.includes("Dashboard"));
    assert.ok(labels.includes("Agency"));
    assert.equal(labels.length, 7);
  });

  it("only shows the extra section, with a caption, once there is something to show", () => {
    assert.match(MENU, /Advisor tools/);
    assert.match(MENU, /advisorPlaces\.length > 0/);
  });
});
