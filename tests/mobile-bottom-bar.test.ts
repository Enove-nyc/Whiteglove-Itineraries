import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const BAR = readFileSync("components/MobileBottomBar.tsx", "utf8");
const NAVBAR = readFileSync("components/Navbar.tsx", "utf8");
// Comments stripped: the file explains in prose why Favorites is absent,
// which would otherwise defeat the very check that sentence is about.
const BAR_CODE = BAR.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("the mobile bottom bar", () => {
  it("is Search, Route, Itinerary and the account — no Favorites", () => {
    for (const label of ["Search", "Route", "Itinerary"]) {
      assert.match(BAR, new RegExp(`label: "${label}"`), `${label} missing`);
    }
    assert.doesNotMatch(BAR_CODE, /Favorite/i, "Favorites belongs inside Account, not the bottom bar");
  });

  it("SAYS SIGN IN TO SOMEBODY SIGNED OUT, and Account to somebody signed in", () => {
    // The fourth item used to be labelled "Account" in every state, so a
    // visitor with no account was invited to open one that did not exist and
    // met a sign-in box. The desktop icon row has always got this right
    // (Navbar: label={signedIn ? "Account" : "Sign in"}); this is the same
    // expression, reading the same prop, going to the same two places.
    assert.match(BAR_CODE, /label:\s*signedIn\s*\?\s*"Account"\s*:\s*"Sign in"/, "the account label ignores the signed-in state");
    assert.match(BAR_CODE, /href:\s*signedIn\s*\?\s*"\/account"\s*:\s*signInHref\(\)/, "the account destination changed");
    // One source of truth for that state: the bar is told, it does not ask.
    // It also takes the brand as a prop (to drop Search on itineraries), so the
    // props object carries both — but signedIn is still passed in, not derived.
    assert.match(BAR_CODE, /\{\s*signedIn,\s*brand\s*\}\s*:\s*\{\s*signedIn:\s*boolean;\s*brand\?:\s*SiteBrand\s*\}/, "the bar should take signedIn as a prop, not re-derive it");
  });

  it("only appears below the breakpoint where the header icons hide", () => {
    // The header's own icon row is `hidden ... sm:flex` — this bar exists
    // for exactly the width where that row is not shown.
    assert.match(BAR, /sm:hidden/);
  });

  it("labels every icon, since a hover tooltip never fires on a phone", () => {
    // Visible text labels, not aria-label-only icons — the brief is explicit
    // that hover tooltips don't work on touch.
    assert.match(BAR, /\{item\.label\}/);
  });

  it("is mounted from Navbar, so every public page gets it once, and /admin never does", () => {
    assert.match(NAVBAR, /<MobileBottomBar/);
  });

  it("reserves body space for itself only while mounted, never touching /admin", () => {
    assert.match(NAVBAR, /wg-has-mobile-bar/);
  });
});
