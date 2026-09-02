import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  type BetaNotice,
  DEFAULT_NOTICE,
  isOwnersOwnScreen,
  noticeFrom,
  noticeProblem,
  readDismissed,
  shouldShow,
} from "@/lib/beta-notice";

/**
 * The site notice is one line and two actions, and it does not open on arrival.
 *
 * The history this file holds in place: the notice has been, in turn, an
 * apology for an unfinished site, an explanation of the editorial labels, a
 * heritage-database caveat on every vacation page, and a three-paragraph
 * dialog with three buttons. Each rewrite cut it down; this one settles it at
 * the single instruction a traveler can act on — confirm the details that
 * change — shown only after the visitor has settled in.
 */

const notice = (over: Partial<BetaNotice> = {}): BetaNotice => ({ ...DEFAULT_NOTICE, ...over });

describe("what it says when nobody has set anything", () => {
  it("is shippable as it stands", () => {
    assert.equal(noticeProblem(DEFAULT_NOTICE), null);
    assert.equal(DEFAULT_NOTICE.on, true);
  });

  it("IS THE ONE LINE, exactly", () => {
    // The whole body. Anything more is a paragraph creeping back.
    assert.equal(
      DEFAULT_NOTICE.body,
      "Travel details change. Confirm opening hours and booking details before you travel.",
    );
  });

  it("SAYS WHAT TO DO, NOT WHAT WE HAVE AND HAVE NOT CHECKED", () => {
    // Version 1 opened "We are still building this" — an apology on every
    // page. Version 2 explained the four checking labels. AGENTS.md: do not
    // expose internal workflows or content status to customers.
    assert.doesNotMatch(DEFAULT_NOTICE.body, /still building|unfinished|beta|coming soon/i);
    assert.doesNotMatch(DEFAULT_NOTICE.body, /\blabel\b|being checked|reconfirm before travel/i);
  });

  it("DOES NOT DESCRIBE THIS SITE AS A KEVARIM DATABASE", () => {
    // The examples were once "towns, kevarim, phone numbers and opening
    // times" — three of the four the heritage section — on every page of a
    // kosher vacation planner.
    const words = `${DEFAULT_NOTICE.heading} ${DEFAULT_NOTICE.body}`;
    for (const heritageOnly of ["kevarim", "kever", "shomer", "cemeter", "beis hachaim"]) {
      assert.doesNotMatch(words, new RegExp(heritageOnly, "i"), `the notice on every page mentions ${heritageOnly}`);
    }
  });

  it("BRINGS THE NOTICE BACK when the wording changes", () => {
    // A dismissal is per version. Somebody who dismissed the three-paragraph
    // version 5 has not seen the one-line version.
    assert.equal(DEFAULT_NOTICE.version, "6");
  });

  it("CARRIES NO EXTRA PARAGRAPHS OR EDITABLE BUTTONS", () => {
    // The caution, the feedback paragraph and the per-button labels were
    // removed with the wording. A field that comes back here is a settings
    // box no page should show again.
    assert.deepEqual(Object.keys(DEFAULT_NOTICE).sort(), ["body", "heading", "on", "version"]);
  });
});

describe("how the dialog behaves", () => {
  const COMPONENT = readFileSync("components/NewSiteNotice.tsx", "utf8");

  it("DOES NOT OPEN ON ARRIVAL — it waits like SitePromotions", () => {
    // Twelve seconds on the page, or the first scroll past the fold,
    // whichever comes first. Nothing else may open it.
    assert.match(COMPONENT, /NOTICE_DELAY_MS = 12_000/);
    assert.match(COMPONENT, /NOTICE_SCROLL_PX = 600/);
    assert.match(COMPONENT, /addEventListener\("scroll", onScroll, \{ passive: true \}\)/);
    assert.match(COMPONENT, /setTimeout\(reveal, NOTICE_DELAY_MS\)/);
    // The gate is a second condition on top of eligibility, not a replacement
    // for it: it stays open once revealed, while it is still eligible here.
    assert.match(COMPONENT, /open = revealed && eligibleHere/);
  });

  it("SHOWS ONCE PER WORDING, NOT ONCE PER PAGE", () => {
    // The fix for "it pops up more than once": it is marked seen the moment it
    // reveals — not only when Close is pressed — so a visitor who read it and
    // moved on does not meet it again on the next page. A bumped version, being
    // a wording nobody has seen, still shows once more.
    assert.match(COMPONENT, /setItem\(SHOWN_KEY, notice\.version\)/);
    assert.match(COMPONENT, /shownVersion !== notice\.version/);
  });

  it("offers the two actions and nothing else", () => {
    assert.match(COMPONENT, /href="\/verification"/);
    assert.match(COMPONENT, />\s*Verification\s*</);
    assert.match(COMPONENT, />\s*Close\s*</);
    assert.doesNotMatch(COMPONENT, /feedbackLabel|dismissLabel|notice\.caution|notice\.feedback/);
  });

  it("is still a real dialog", () => {
    // Same bar as every other modal: labelled, modal, focus-trapped, Escape.
    assert.match(COMPONENT, /role="dialog"/);
    assert.match(COMPONENT, /aria-modal="true"/);
    assert.match(COMPONENT, /useFocusTrap/);
    assert.match(COMPONENT, /aria-labelledby/);
    assert.match(COMPONENT, /body\.style\.overflow/);
  });
});

describe("whether to show it", () => {
  it("shows it to somebody who has not seen this wording", () => {
    assert.equal(shouldShow(notice(), { dismissedVersion: null, path: "/" }), true);
  });

  it("does not show it twice", () => {
    assert.equal(shouldShow(notice({ version: "1" }), { dismissedVersion: "1", path: "/" }), false);
  });

  it("shows it again when the wording changes", () => {
    // Somebody who dismissed the old words has not agreed to the new ones.
    assert.equal(shouldShow(notice({ version: "2" }), { dismissedVersion: "1", path: "/" }), true);
  });

  it("does not show it when it is switched off", () => {
    assert.equal(shouldShow(notice({ on: false }), { dismissedVersion: null, path: "/" }), false);
  });

  it("does not show it with nothing to say", () => {
    assert.equal(shouldShow(notice({ heading: "  " }), { dismissedVersion: null, path: "/" }), false);
    assert.equal(shouldShow(notice({ body: "" }), { dismissedVersion: null, path: "/" }), false);
  });

  it("does not put it over the owner's own screens", () => {
    // The admin is his workshop. And a modal over a password box is an
    // obstacle rather than a courtesy.
    for (const path of ["/admin", "/admin/destinations", "/login", "/access", "/embed", "/embed/flights"]) {
      assert.equal(shouldShow(notice(), { dismissedVersion: null, path }), false, path);
    }
  });

  it("still shows it on the pages visitors are actually on", () => {
    for (const path of ["/", "/stops", "/cemeteries/lizhensk", "/itinerary", "/account"]) {
      assert.equal(shouldShow(notice(), { dismissedVersion: null, path }), true, path);
    }
  });

  it("does not mistake a page that merely starts with those letters", () => {
    assert.equal(isOwnersOwnScreen("/administration-of-estates"), false);
    assert.equal(isOwnersOwnScreen("/accessories"), false);
    assert.equal(isOwnersOwnScreen("/admin"), true);
    assert.equal(isOwnersOwnScreen("/admin/photos"), true);
    assert.equal(isOwnersOwnScreen("/embed/flights"), true);
    assert.equal(isOwnersOwnScreen("/embedded-tours"), false);
  });
});

describe("reading what was stored", () => {
  it("takes a version back", () => {
    assert.equal(readDismissed("2"), "2");
  });

  it("treats rubbish as not dismissed", () => {
    // The worst a corrupted value can do is show the notice once more.
    for (const bad of [null, undefined, "", "   "]) assert.equal(readDismissed(bad), null, String(bad));
  });
});

describe("filling in what the owner left blank", () => {
  it("KEEPS THIS PRODUCT'S OWN WORDING, whatever the shared store says", () => {
    // Both deployments read one store. A notice written for the kosher guide
    // — "confirm kashrus, hours and Shabbos arrangements" — was arriving here
    // and putting kosher wording on every page of a general travel product.
    // The switch is shared; the words are not.
    const filled = noticeFrom({ heading: "Before you go", body: "Confirm kashrus and Shabbos arrangements." });
    assert.equal(filled.heading, DEFAULT_NOTICE.heading);
    assert.equal(filled.body, DEFAULT_NOTICE.body);
  });

  it("carries no kosher or Jewish wording at all", () => {
    for (const word of ["kosher", "kashrus", "shabbos", "jewish", "shul", "mikvah", "kever"]) {
      assert.ok(!DEFAULT_NOTICE.body.toLowerCase().includes(word), `the notice says "${word}"`);
      assert.ok(!DEFAULT_NOTICE.heading.toLowerCase().includes(word), `the heading says "${word}"`);
    }
  });

  it("keeps off meaning off", () => {
    // The one field where a blank is a real answer rather than a gap.
    assert.equal(noticeFrom({ on: false }).on, false);
    assert.equal(noticeFrom({}).on, DEFAULT_NOTICE.on);
    assert.equal(noticeFrom(null).on, DEFAULT_NOTICE.on);
  });
});

describe("what the owner cannot save", () => {
  it("refuses a body with nothing in it", () => {
    assert.match(String(noticeProblem(notice({ body: "Beta." }))), /what to confirm/i);
  });

  it("refuses a heading with nothing in it", () => {
    assert.equal(noticeProblem(notice({ heading: " " })), "Give it a heading.");
  });

  it("checks nothing once it is switched off", () => {
    // Turning it off is how this ends. It must not be blocked by the wording
    // it is about to stop showing.
    assert.equal(noticeProblem(notice({ on: false, heading: "", body: "" })), null);
  });
});
