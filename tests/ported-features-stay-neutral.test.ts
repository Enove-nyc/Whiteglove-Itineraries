import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PACKING_BASICS } from "@/data/packing-basics";

/**
 * WHAT A PORT HAD TO CHANGE, PINNED SO A LATER COPY-PASTE CANNOT UNDO IT.
 *
 * These features were written on White Glove Kosher Travel and brought here.
 * Most of each came across untouched — but a straight copy would have put a
 * Shabbos and davening category, a prompt written for a Torah-observant
 * traveller, and an affiliate gear shelf onto a general travel product. The
 * next person to re-sync one of these files will reach for a copy; this is
 * what fails when they do.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const KOSHER = /kosher|shabbos|shabbat|yom tov|tefillin|tallis|talis|siddur|havdalah|blech|netilas|kiddush|tzitzis|davening|zmanim|minyan|hechsher|torah-observant/i;

test("the starter packing list carries nothing kosher-specific", () => {
  for (const item of PACKING_BASICS) {
    assert.doesNotMatch(item.label, KOSHER, `"${item.label}" belongs on the kosher list, not this one`);
    assert.doesNotMatch(item.category, KOSHER, `category "${item.category}" belongs on the kosher list`);
  }
});

test("the starter list is still a real list, not an empty one", () => {
  assert.ok(PACKING_BASICS.length >= 15, `only ${PACKING_BASICS.length} items — stripping went too far`);
  assert.ok(new Set(PACKING_BASICS.map((i) => i.id)).size === PACKING_BASICS.length, "duplicate ids");
  assert.ok(new Set(PACKING_BASICS.map((i) => i.category)).size >= 4, "the list lost its grouping");
});

test("the packing prompt asks for a general traveller, not a Torah-observant one", () => {
  const prompt = read("lib/packing-ai.ts");
  assert.match(prompt, /for a general traveler/);
  assert.doesNotMatch(prompt, KOSHER);
});

test("no gear shelf reaches the packing list here", () => {
  // The gear shelf is a settled decision of the other product, with exactly
  // two homes there and none here. A general planner hanging affiliate links
  // off a packing list is the thing its owner turned down.
  for (const path of ["components/PackingListPanel.tsx", "app/packing/page.tsx"]) {
    const src = read(path);
    assert.ok(!src.includes("packing-gear-match"), `${path} still links the gear shelf`);
    assert.ok(!src.includes("travel-gear-store"), `${path} still reads the gear shelf`);
    assert.ok(!src.includes("sponsored"), `${path} still carries an affiliate link`);
  }
});

test("the ported pages carry no kosher wording of their own", () => {
  for (const path of [
    "app/packing/page.tsx",
    "app/optimize/page.tsx",
    "app/translate/page.tsx",
    "app/activity/page.tsx",
    "components/PackingListPanel.tsx",
    "components/TripUpdates.tsx",
    "components/TripActivityFeed.tsx",
    "lib/trip-updates.ts",
  ]) {
    // Only what a customer can READ is checked. Two things legitimately name
    // the other product and neither reaches a screen: the brand-aware tab
    // title, which exists precisely so the right one is shown; and comments
    // explaining why something was left out of the port — those are the
    // record of a decision and should be encouraged, not linted away.
    const body = read(path)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/^.*White Glove Kosher Travel.*$/gm, "");
    assert.doesNotMatch(body, KOSHER, `${path} carries kosher wording a customer would read`);
  }
});

test("trip updates has two sources here, not the kosher three", () => {
  const src = read("lib/trip-updates.ts");
  assert.match(src, /"flight" \| "advisory"/);
  for (const gone of ["current-updates", "noticesForTrip", "destinationSlugsOnTrip"]) {
    assert.ok(!src.includes(gone), `lib/trip-updates.ts still refers to ${gone}`);
  }
});

test("nothing ported points back at the other product's site", () => {
  // The marketing link is one-directional by settled decision. A port must
  // never quietly bring it across.
  for (const path of ["app/packing/page.tsx", "app/optimize/page.tsx", "app/translate/page.tsx", "components/TripUpdates.tsx"]) {
    assert.ok(!read(path).includes("whiteglovekoshertravel.com"), `${path} links to the other product`);
  }
});
