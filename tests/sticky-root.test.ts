import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const CSS = readFileSync("app/globals.css", "utf8");

describe("nothing on the root element stops a sticky thing sticking", () => {
  /**
   * THE SITE HEADER HAS NEVER STUCK.
   *
   * `html` carried `overflow-x: hidden`, which makes the root element a scroll
   * container — and a scroll container between a `position: sticky` element
   * and the viewport is the thing that element sticks to. Every sticky rule
   * here therefore resolved against a box that never scrolls, so Navbar's
   * `sticky top-0` has been decorative since the day it was written.
   *
   * Measured in the other repository, where the same rule sat in the same file
   * and the long directory pages made it visible: scrolled to 6,000px, the
   * header sat at -3,729 with any non-visible overflow-x on html, and at 0
   * without it. `clip` behaves the same as `hidden` — the trap is the root
   * element, not the keyword, which is why swapping the keyword was tried
   * first and changed nothing.
   */
  it("leaves html's overflow alone", () => {
    const html = CSS.match(/^html \{[^}]*\}/m)?.[0] ?? "";
    assert.ok(html, "the html rule went missing");
    assert.doesNotMatch(
      html,
      /overflow/,
      `html must not set overflow — it makes the root a scroll container and every sticky element stops sticking: ${html}`,
    );
  });

  it("still guards against sideways scroll, on body", () => {
    // body is not the scrollport, so the guard costs no sticky behaviour
    // there. The one element the root rule had been hiding was the contact
    // address on /about, set in uppercase at 0.12em tracking and wider than a
    // phone; it was fixed rather than hidden again.
    const fromHtml = CSS.slice(CSS.indexOf("html { scroll-behavior"));
    const body = fromHtml.slice(fromHtml.indexOf("body {"), fromHtml.indexOf("}", fromHtml.indexOf("body {")));
    assert.match(body, /overflow-x: clip/);
    assert.doesNotMatch(
      readFileSync("app/about/page.tsx", "utf8"),
      /uppercase tracking-\[0\.12em\] text-white/,
      "the contact address is set as a label again, and is wider than a phone",
    );
  });

  it("the header still asks to be sticky", () => {
    // The rule above is only worth anything because something wants it.
    assert.match(readFileSync("components/Navbar.tsx", "utf8"), /sticky top-0/);
  });

  it("and the app shell is not a scroll container either", () => {
    /**
     * THE SAME BUG, ONE LEVEL DOWN, AND THIS REPOSITORY HAD BOTH. Fixing html
     * was not enough here: #main-content carried `overflow-y-auto`, which the
     * other repository's identical wrapper does not, and it never scrolled
     * anything — the window is the scrollport on every page of this site. What
     * it did do is make that div a scroll container, which is all it takes.
     *
     * Measured on /about: with it, the header sat at -2,076 after scrolling
     * 2,500px; without it, at 0. A potential scroll container is enough — it
     * does not have to actually scroll.
     */
    const layout = readFileSync("app/layout.tsx", "utf8");
    const shell = layout.slice(layout.indexOf('<div id="main-content"')).split(">")[0];
    assert.doesNotMatch(
      shell,
      /overflow-/,
      `#main-content must not set overflow — it becomes the scrollport and the header stops sticking: ${shell}`,
    );
  });
});
