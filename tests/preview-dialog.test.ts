import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (p: string) => readFileSync(p, "utf8");
const DIALOG = read("components/PreviewDialog.tsx");

/**
 * ONE preview control, and the promises it has to keep. These are read out of
 * the source the way the entitlement gates are: what matters is that the
 * behaviour is PRESENT and is the right one, which is a property of the code
 * rather than of one render that would need a session and Redis to produce.
 */

describe("preview never changes anything", () => {
  it("does not save, publish, share, or mint a token", () => {
    // The control it replaces did: "Preview as client" POSTed {action:"share"}
    // and opened a tab, so looking at your own work shared it.
    const code = DIALOG.slice(DIALOG.indexOf("export function PreviewDialog"));
    for (const forbidden of ["fetch(", "POST", "router.push", "window.open"]) {
      assert.ok(!code.includes(forbidden), `the preview dialog does ${forbidden}`);
    }
  });

  it("opens in place rather than in a new tab", () => {
    // Read past the header comment, which quotes the old behaviour it replaced.
    const code = DIALOG.slice(DIALOG.indexOf("export function PreviewDialog"));
    assert.ok(!code.includes('target="_blank"'), "the preview opens a tab");
  });
});

describe("everyone can reach it and leave it", () => {
  it("is a real button with an accessible name, not a hover", () => {
    assert.match(DIALOG, /<IconButton/);
    assert.match(DIALOG, /label=\{label\}/);
    // IconButton is the approved icon-only wrapper: it sets aria-label, title
    // and a 44x44 target, so an icon alone is never unlabelled.
    const action = read("components/icons/IconAction.tsx");
    assert.match(action, /aria-label=\{label\} title=\{label\}/);
    assert.match(action, /min-h-11 min-w-11/);
  });

  it("closes on Escape, and on a visible Close button", () => {
    // Escape alone is not enough: a phone has no Escape key.
    assert.match(DIALOG, /useFocusTrap<HTMLDivElement>\(open, close\)/);
    assert.match(DIALOG, />\s*Close\s*</);
  });

  it("HANDS FOCUS BACK to the eye that opened it", () => {
    assert.match(DIALOG, /triggerRef\.current\?\.focus\(\)/);
    // Which needs the shared icon button to forward a ref — it did not.
    assert.match(read("components/icons/IconAction.tsx"), /ref\?: React\.Ref<HTMLButtonElement>/);
  });

  it("is a real modal to a screen reader", () => {
    assert.match(DIALOG, /role="dialog"/);
    assert.match(DIALOG, /aria-modal="true"/);
    assert.match(DIALOG, /aria-labelledby=\{headingId\}/);
  });

  it("reuses the one focus trap rather than writing a second", () => {
    assert.match(DIALOG, /from "@\/components\/useFocusTrap"/);
  });
});

describe("it is the same control in each place", () => {
  it("attachments, and the whole itinerary, both use it", () => {
    assert.match(read("components/StopAttachments.tsx"), /<PreviewDialog/);
    assert.match(read("components/ItineraryBuilder.tsx"), /<PreviewDialog/);
  });

  it("there is no second preview dialog", () => {
    // The point is one component, not four behaviours wearing one word.
    const builder = read("components/ItineraryBuilder.tsx");
    assert.ok(!/role="dialog"/.test(builder), "the builder grew a dialog of its own");
    assert.ok(!/useFocusTrap/.test(read("components/StopAttachments.tsx")), "attachments grew a trap of their own");
  });

  it("the whole-itinerary preview shows the right brand", () => {
    // PrintableItinerary defaults to the kosher crest. On the itineraries
    // product that would be the one thing this repo must never print.
    assert.match(read("components/ItineraryBuilder.tsx"), /siteBrand=\{itineraries \? "itineraries" : "kosher"\}/);
  });
});
