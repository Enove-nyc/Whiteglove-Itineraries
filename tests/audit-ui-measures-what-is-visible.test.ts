import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * THE UI AUDIT HAS TO MEASURE ONLY WHAT IS ON THE SCREEN.
 *
 * It was doing neither of the two things this file now pins, and between them
 * they were the whole of its remaining output: nineteen findings, none real, on
 * a report meant to be read. An audit that always reports the same false
 * findings is an audit nobody opens — which is the same reasoning that took the
 * partner CORS noise out of the flows audit.
 *
 * ONE: a closed `<details>` does not use `display: none`. It hides its contents
 * with `content-visibility`, so every control inside every collapsed fold kept
 * an offsetParent and a bounding box. On /destinations/rome that was 55 of the
 * 95 controls the audit thought were visible — their tap targets, their
 * contrast and their place in the tab order all measured from geometry nobody
 * can see. An outside scanner made exactly this mistake against this site in
 * the same week, reporting empty headings inside collapsed sections; ours was
 * making it too.
 *
 * TWO: the tab-order check compared each stop against a RUNNING MAXIMUM, so no
 * grid could ever pass. One card taller than its neighbours meant every link in
 * the next card counted as a jump backwards — two cards in the same visual row,
 * tabbed in the order somebody reads them.
 *
 * The check still works: with a footer link deliberately shrunk to 20px it
 * reported 104 findings, and reported none once it was restored.
 */

const AUDIT = readFileSync("scripts/audit-ui.mjs", "utf8");

describe("the UI audit ignores what nobody can see", () => {
  it("asks the browser whether an element is visible, not whether it has a parent", () => {
    // offsetParent is the check that let closed folds through.
    assert.match(AUDIT, /checkVisibility\(\{ contentVisibilityAuto: true/);
  });

  it("uses it in every check that measures geometry", () => {
    // Touch targets, tab order, heading outline, contrast. Four, because a
    // fifth check added later without it would go back to measuring folds.
    const uses = AUDIT.match(/const visible = \(el\) =>/g) ?? [];
    assert.ok(uses.length >= 4, `only ${uses.length} checks establish visibility`);
  });
});

describe("the UI audit's tab-order check can be passed by a grid", () => {
  it("compares consecutive stops, not a running maximum", () => {
    assert.doesNotMatch(AUDIT, /prevTop = Math\.max/, "a rising high-water mark fails every grid");
    assert.match(AUDIT, /previous !== null && top < previous - 200/);
  });

  it("ignores anything floating, whose document position means nothing", () => {
    // The mobile bottom bar and the assistant button are position:fixed, so
    // their top is wherever the viewport happened to be.
    assert.match(AUDIT, /getComputedStyle\(node\)\.position === "fixed"/);
  });

  it("reports a single genuine jump rather than tolerating two", () => {
    // The tolerance existed to absorb the noise the high-water mark generated.
    assert.match(AUDIT, /order\.backwards > 0/);
  });
});
