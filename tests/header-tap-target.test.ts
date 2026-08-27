import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * THE SITE'S OWN NAME IN THE HEADER IS A 44-PIXEL TARGET.
 *
 * It is on every page, it is the way back to the front, and it is one of the
 * most-pressed things on the site. Without a minimum it measured 40px at every
 * phone width and 36px at 320, because its height came from whatever the mark
 * and the wordmark happened to add up to.
 *
 * FOUND BY A MISTAKE, which is worth recording. A UI audit was pointed at the
 * wrong local server and reported 52 undersized targets for this one link. The
 * findings were against this repository rather than the one being audited —
 * and they were real: the kosher repository has carried the minimum since its
 * own tap-target sweep, and this copy never received it.
 */
describe("the header's home link is thumb-sized", () => {
  const NAVBAR = readFileSync("components/Navbar.tsx", "utf8");

  it("sets a minimum height on the logo link", () => {
    const link = NAVBAR.slice(NAVBAR.indexOf("<Link href={logoHref}"));
    const opening = link.slice(0, link.indexOf(">") + 1);
    assert.match(opening, /min-h-11/, "the header home link has no minimum height");
  });

  it("still names itself for a screen reader", () => {
    // The wordmark is two spans and the mark is aria-hidden, so the link's own
    // name is the only thing announcing where it goes.
    const link = NAVBAR.slice(NAVBAR.indexOf("<Link href={logoHref}"));
    assert.match(link.slice(0, 400), /aria-label=/);
  });
});
