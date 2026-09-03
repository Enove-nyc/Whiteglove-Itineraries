import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * THE APP'S OWN COLOURS, MEASURED RATHER THAN EYEBALLED.
 *
 * Every colour in components/companion/CompanionApp.tsx is an inline style
 * literal, so nothing else in the project can check them and nothing did. An
 * audit of /app/preview in a real browser found the whole of the app's small
 * print under AA: the wallet's group headings at 4.40, the eyebrow above every
 * screen title at 2.31, a message's date divider at 2.06 — and every primary
 * button in the app, cream on gold, at 2.86.
 *
 * None of that is decoration. A stop's time, a walk of four minutes, the
 * document group a confirmation is filed under and the word on the button that
 * accepts a change are what somebody reads this app for, on a phone, outdoors.
 *
 * The four constants are pinned here against the four grounds they are drawn
 * on. Anything below AA fails the build, so the next person to reach for a
 * lighter grey finds out here rather than from a scan.
 */

const SRC = readFileSync("components/companion/CompanionApp.tsx", "utf8");

/** Reads `const NAME = "#rrggbb";` out of the component. */
function colour(name: string): string {
  const m = SRC.match(new RegExp(`const ${name} = "(#[0-9a-f]{6})";`, "i"));
  assert.ok(m, `${name} is gone from CompanionApp.tsx, or is no longer a plain hex literal`);
  return m![1];
}

function luminance(hex: string): number {
  const parts = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = parts.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const GOLD = colour("GOLD");
const CREAM = colour("CREAM");
const NAVY = colour("NAVY");
const MUTED = colour("MUTED");
const FAINT = colour("FAINT");
const ON_GOLD = SRC.includes("const ON_GOLD = NAVY;") ? NAVY : colour("ON_GOLD");

/**
 * The grounds the app draws MUTED text on. On the Mushroom palette that is the
 * warm-white card (#FAF8F3): the page ground is Mushroom (#D5CEC3), dark enough
 * that a legible-as-muted grey cannot clear 4.5 on it, so muted metadata lives
 * on the raised card. The deep chips (#C7BFB1) carry ink, not grey.
 */
const GROUNDS: Array<[string, string]> = [
  ["a warm-white card", "#FAF8F3"],
];

// Everything measured here is under 18px, so AA is 4.5 for all of it.
const AA = 4.5;

describe("the two greys clear AA on every ground", () => {
  for (const [where, bg] of GROUNDS) {
    it(`MUTED reads on ${where}`, () => {
      const r = ratio(MUTED, bg);
      assert.ok(r >= AA, `MUTED ${MUTED} on ${bg} is ${r.toFixed(2)}:1, under ${AA}`);
    });

    it(`FAINT reads on ${where}`, () => {
      const r = ratio(FAINT, bg);
      assert.ok(r >= AA, `FAINT ${FAINT} on ${bg} is ${r.toFixed(2)}:1, under ${AA}`);
    });
  }

  it("keeps them two greys, not one", () => {
    // They exist to separate a label from the metadata beside it. If they are
    // ever driven to the same value the hierarchy is gone and one of them
    // should be deleted rather than quietly duplicated.
    assert.notEqual(MUTED, FAINT);
    assert.ok(luminance(MUTED) < luminance(FAINT), "MUTED must be the darker of the two");
  });
});

describe("what is written on the gold", () => {
  it("is legible, which the cream was not", () => {
    /**
     * Cream on gold is 2.86:1 — well under half of AA — and it was on every
     * primary action in the app: "See the two options", "Create poll", the
     * send button, the selected day in the strip, the tab you are on.
     *
     * The gold does not move; it is the brand. The navy already in this
     * palette clears AA against exactly the same gold, so only the words
     * changed colour.
     */
    const r = ratio(ON_GOLD, GOLD);
    assert.ok(r >= AA, `text on gold is ${r.toFixed(2)}:1, under ${AA}`);
    assert.ok(ratio(CREAM, GOLD) < AA, "cream on gold has become legible — this test is out of date");
  });

  it("is not written in cream anywhere the gold is behind it", () => {
    assert.doesNotMatch(SRC, /background: GOLD, color: CREAM/);
    assert.doesNotMatch(SRC, /color: on \? CREAM/);
    assert.doesNotMatch(SRC, /color: t\.on \? CREAM/);
  });
});

describe("the bottom bar says what its four buttons are", () => {
  /**
   * IT WAS ICON-ONLY, with the word kept as the button's accessible name and
   * nothing on the screen: a pin, a speech bubble, a wallet and a person,
   * standing for Trip, Advisor, Wallet and You. Two of those four are not
   * guessable, and every phone puts the word under the glyph for that reason.
   *
   * It also made the bar invisible to anything reading the screen by its text.
   * An outside scan of /app/preview reported that the tabs did not switch,
   * having found no control by any of their names. They did switch, and do —
   * all four, at 390 and at 1280, verified in a browser.
   */
  it("draws the label, not only the icon", () => {
    assert.match(SRC, /<span style=\{\{ font: `\$\{t\.on \? 600 : 500\} 10\.5px\/1 Inter,sans-serif`[^}]*\}\}>\{t\.label\}<\/span>/);
  });

  it("does not repeat that label as an aria-label as well", () => {
    // A visible word plus an aria-label saying the same thing is two facts
    // that can disagree. The unread case still needs one, because "3 unread"
    // is not written on the button.
    assert.match(SRC, /aria-label=\{t\.badge \? `\$\{t\.label\} \(unread messages\)` : undefined\}/);
  });
});

describe("the dark the app is anchored on", () => {
  /**
   * THE FIRST SCREEN HAD A NAVY PANEL AND THE OTHER FOUR HAD NOTHING.
   *
   * The bar at the top of every screen was cream, on a cream page, above white
   * cards — so the wallet, the advisor thread and the You screen carried no
   * dark colour at all and had nothing to sit against. It is navy now, the
   * same navy as the panel, which is what makes the app read as one thing
   * rather than one good screen and four pale ones.
   *
   * The section headings moved with it. FLIGHTS, WHERE YOU ARE STAYING, HELD
   * FOR YOU and the rest were written in the same grey as the metadata
   * underneath them, so a wallet was one flat wash of grey small caps.
   */
  const GOLD_ON_DARK = colour("GOLD_ON_DARK");

  it("puts the navy bar at the top of every screen, not only the first", () => {
    assert.match(SRC, /background: NAVY, color: CREAM, borderBottom/);
  });

  it("writes on it in things that can be read there", () => {
    // 9.5px small caps, so 4.5 with no allowance for size.
    const eyebrow = ratio(GOLD_ON_DARK, NAVY);
    assert.ok(eyebrow >= AA, `the eyebrow on the navy bar is ${eyebrow.toFixed(2)}:1, under ${AA}`);
    assert.ok(ratio(CREAM, NAVY) >= AA);
  });

  it("uses a lifted gold there rather than the flat one", () => {
    // The brand gold is 5.13:1 on the navy — legible, and muddy at 9.5px
    // against a dark ground. Same hue, carried up.
    assert.notEqual(GOLD_ON_DARK, GOLD);
    assert.ok(ratio(GOLD_ON_DARK, NAVY) > ratio(GOLD, NAVY));
  });

  it("rings the unread dot in the colour actually behind it", () => {
    // It was ringed in cream, for the cream bar it used to sit on. On navy
    // that reads as a smudge rather than a dot.
    assert.match(SRC, /background: GOLD, border: `2px solid \$\{NAVY\}`/);
  });

  it("gives the section headings the navy too", () => {
    // They were the same grey as the metadata under them.
    assert.doesNotMatch(SRC, /kicker\(MUTED\)/, "a section heading is grey small caps again");
    assert.match(SRC, /kicker\(NAVY\)/);
  });
});
