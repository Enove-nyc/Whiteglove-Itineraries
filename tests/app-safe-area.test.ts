import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * THE HEADER STOPS BELOW THE CLOCK INSIDE THE APP.
 *
 * Android 15 forces an app edge to edge: the web view draws behind the status
 * bar, and the site header sat under the time and the battery. The owner's
 * words were "the top header bumps into the top of the phone in the app" — reported on the kosher app, and the same header and the same worker run here.
 *
 * The fix is one line of plumbing that had never been laid. `env(safe-area-inset-*)`
 * reads ZERO unless the viewport is declared `viewport-fit=cover` — so the phone
 * bottom bar's own `pb-[env(safe-area-inset-bottom)]`, written long ago, had
 * never once applied either. AppShellFlag declares it, and only inside the app:
 * on the open website `cover` would also push a page under an iPhone's notch in
 * landscape, where the gutter is 20px and the inset is 44.
 */
const FLAG = readFileSync("components/AppShellFlag.tsx", "utf8");
const CSS = readFileSync("app/globals.css", "utf8");
const BAR = readFileSync("components/MobileBottomBar.tsx", "utf8");

describe("the safe areas are real numbers inside the app, and nowhere else", () => {
  it("viewport-fit=cover is added by AppShellFlag, not declared site-wide", () => {
    assert.match(FLAG, /viewport-fit=cover/);
    assert.match(FLAG, /if \(!inApp\) return;/);
    // The viewport export must stay clean, or the website gets it too.
    assert.doesNotMatch(readFileSync("app/layout.tsx", "utf8"), /viewportFit/);
  });

  it("it is added rather than replacing whatever the viewport already said", () => {
    assert.match(FLAG, /!\/viewport-fit\/\.test\(content\)/);
    assert.match(FLAG, /`\$\{content\}, viewport-fit=cover`/);
  });
});

describe("the header is pushed below the status bar, and the strip it leaves is navy", () => {
  it("the inset has a name, so it can be set to something other than zero", () => {
    // An env() fallback does not help: a browser that HAS the inset and reads
    // it as zero never reaches the fallback, so nothing could exercise these
    // rules without a variable in the middle.
    assert.match(CSS, /html\[data-app-shell\] \{\s*--wg-safe-top: env\(safe-area-inset-top\);\s*\}/);
  });

  it("the header takes the inset as padding", () => {
    assert.match(CSS, /html\[data-app-shell\] nav\[aria-label="Main"\] \{\s*padding-top: var\(--wg-safe-top\);\s*\}/);
  });

  it("the strip behind the clock is painted navy — the site's own theme-color", () => {
    // Cream there would be the phone's white clock on cream. Navy is what
    // app/layout.tsx declares as themeColor, which is what the phone picks the
    // white against.
    const strip = CSS.slice(CSS.indexOf('nav[aria-label="Main"]::before'));
    assert.match(strip, /height: var\(--wg-safe-top\);/);
    assert.match(strip, /background: var\(--navy\);/);
    assert.match(readFileSync("app/layout.tsx", "utf8"), /themeColor: "#102F35"/);
  });

  it("the phone bottom bar's inset, written long before this, is left as it was", () => {
    assert.match(BAR, /pb-\[env\(safe-area-inset-bottom\)\]/);
    assert.match(CSS, /padding-bottom: calc\(3\.5rem \+ env\(safe-area-inset-bottom\)\);/);
  });
});
