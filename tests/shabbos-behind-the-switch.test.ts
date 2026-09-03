import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DEFAULT_APP_PREFS } from "@/lib/app-prefs-store";

/**
 * SHABBOS IS OFF ON THIS PRODUCT UNTIL AN ACCOUNT ASKS FOR IT.
 *
 * White Glove Itineraries is a general travel product. Candle-lighting, when
 * Shabbos ends, and "this stop is planned for Shabbos" are a real feature for
 * an agency that plans kosher travel and noise on anybody else's screen — and
 * for a long time every account got them whether they wanted them or not, with
 * nothing to turn them off.
 *
 * There is now one switch (AppPrefs.kosherFeatures, on /account) and it is the
 * ONLY way any of it appears. These hold that: the default, and each surface
 * that used to show Shabbos regardless.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the switch is off until somebody turns it on", () => {
  assert.equal(DEFAULT_APP_PREFS.kosherFeatures, false);
});

test("the command centre drops Shabbos warnings unless the switch is on", () => {
  const page = code("app/command-center/page.tsx");
  assert.match(page, /getAppPrefs/);
  assert.match(page, /kosher \|\| alert\.kind !== "shabbos"/);
});

test("the planner offers zmanim only where the product is kosher travel, or the account asked", () => {
  const builder = code("components/ItineraryBuilder.tsx");
  assert.match(builder, /const showZmanimHere = !itineraries \|\| kosher;/);
  // Every zmanim decision goes through that one name — none is left keyed on
  // the brand alone, which is what made the switch unable to turn them on.
  assert.ok(!/\!itineraries && itin\.showZmanim/.test(builder), "a zmanim gate is still keyed on the brand");
  assert.ok(!/if \(itineraries \|\| !itin\.showZmanim/.test(builder), "the zmanim fetch is still keyed on the brand");
});

test("the planner page reads the account's setting and hands it down", () => {
  const page = code("app/itinerary/page.tsx");
  assert.match(page, /getAppPrefs/);
  assert.match(page, /kosher=\{kosher\}/);
});

test("the trip setup panel does not offer a retired destination page", () => {
  // It read "things to do, where to stay, kosher food and Shabbos" and linked
  // to a page that answers 410 on this brand.
  assert.match(code("components/TripSetupPanel.tsx"), /suggested && !itineraries &&/);
});

test("nothing new shows Shabbos without consulting the switch", () => {
  // The live signed-in trip surfaces. A file here that mentions Shabbos or
  // zmanim must also read the switch, or gate on the brand — not neither.
  const SURFACES = [
    "app/command-center/page.tsx",
    "app/itinerary/page.tsx",
    "components/ItineraryBuilder.tsx",
    "components/TripSetupPanel.tsx",
    "components/TripStartFlow.tsx",
  ];
  const offenders: string[] = [];
  for (const path of SURFACES) {
    const src = code(path);
    if (!/shabbos|zmanim|candle/i.test(src)) continue;
    const gated = /kosherFeatures|getAppPrefs|\bkosher\b|itineraries/.test(src);
    if (!gated) offenders.push(path);
  }
  assert.deepEqual(offenders, [], `these show Shabbos with nothing deciding whether to: ${offenders.join(", ")}`);
});

test("the app never receives Shabbos content it was not asked for", () => {
  // CompanionApp is gated upstream rather than in the component: the trip it
  // renders is BUILT with the setting, so the kosher fields are simply absent
  // when it is off — no zmanim call and no kosher lookup happen at all. That is
  // the stronger shape, and it is where the assertion belongs.
  const builder = code("lib/companion-trip.ts");
  assert.match(builder, /kosher/);
  const app = code("components/companion/CompanionApp.tsx");
  assert.match(app, /trip\.kosherTitle/);
  // The component must not go and fetch any of it on its own.
  assert.ok(!/\/api\/zmanim/.test(app), "the app fetches zmanim directly, bypassing the switch");
});

test("the switch's own words say what it now covers", () => {
  const settings = read("components/companion/CompanionSettings.tsx");
  // It used to promise only the app while the planner and command centre
  // showed Shabbos regardless — a description that was quietly untrue.
  assert.match(settings, /in the planner/);
  assert.match(settings, /Off by default/);
});
