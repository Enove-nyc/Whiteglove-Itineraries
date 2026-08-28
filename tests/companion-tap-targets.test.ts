import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const APP = readFileSync("components/companion/CompanionApp.tsx", "utf8");

/**
 * The controls a traveller taps with a thumb, in a street, in a hurry.
 *
 * An outside audit of the client app named this one specifically: "several
 * inline underlined buttons with zero padding and 11–12.5-pixel text,
 * including document-sharing and note actions. On a phone these are difficult
 * touch targets." It was right, and it had missed the worst two — Call and
 * Directions on a booking row, which are the only controls in the whole app
 * somebody uses while standing outside the hotel rather than sitting down.
 *
 * TAP_INLINE is the answer already in this file: padding out to a real target,
 * pulled back with an equal negative margin, so the control grows and the
 * layout around it does not move.
 */
describe("every underlined control in the client app is big enough to hit", () => {
  it("no underlined control is left without a tap target", () => {
    /**
     * Read per style object rather than per line: some of these are one-line
     * inline styles and some are multi-line blocks, and what matters is that
     * the object carrying `textDecoration: "underline"` also carries the
     * padding. Anything underlined here is a control — this file uses the
     * underline for nothing else.
     */
    const objects = APP.split(/style=\{\{/).slice(1).map((chunk) => chunk.split("}}")[0]);
    const underlined = objects.filter((o) => /textDecoration: "underline"/.test(o));
    assert.ok(underlined.length >= 6, `expected the underlined controls to still be here, found ${underlined.length}`);
    const bare = underlined.filter((o) => !o.includes("TAP_INLINE"));
    assert.deepEqual(bare, [], `underlined controls with no tap target: ${bare.map((o) => o.slice(0, 70)).join(" | ")}`);
  });

  it("TAP_INLINE is still a real target that costs no layout", () => {
    // 13px above and below a 12.5px line is a 38px box, and the negative
    // margin has to match the padding exactly or every row it sits in shifts.
    assert.match(APP, /const TAP_INLINE = \{ padding: "13px 8px", margin: "-13px -8px" \}/);
  });

  it("Call and Directions cannot be mistaken for each other", () => {
    /**
     * They sit side by side, and TAP_INLINE widens each by 8px on both sides.
     * At the original gap of 14 the two tap zones would have overlapped, so a
     * thumb aiming at Directions could have placed a phone call. 36 leaves the
     * zones 4px apart and the text 20px apart.
     */
    const row = APP.slice(APP.indexOf("{r.phone && ("));
    const gap = Number(APP.slice(0, APP.indexOf("{r.phone && (")).match(/gap: (\d+), marginTop: 2 \}\}>\s*$/m)?.[1]);
    assert.ok(gap > 32, `gap of ${gap} lets the Call and Directions tap zones touch`);
    assert.match(row.slice(0, 900), /tel:\$\{r\.phone/);
  });
});
