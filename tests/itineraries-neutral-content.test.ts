import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { COMPANION_DEMO_TRIP } from "@/data/companion-demo";
import { SAMPLE_ITINERARY, SAMPLE_NOTICE, WHAT_IS_IN_IT } from "@/data/sample-itinerary";

/**
 * NOTHING THIS DOMAIN SHOWS MAY READ AS A KOSHER OR JEWISH PRODUCT.
 *
 * The two products share a lineage, and the sample content came with it. The
 * printed sample was a family of five in the Roman Ghetto built around the
 * Shabbos in the middle of it — shopping on the Friday, a hechsher to confirm
 * at lunch, candle-lighting at 16:52 — and the app demo was the same week. All
 * of that is right on White Glove Kosher Travel. None of it belongs here: this
 * product sells trip-building to advisers with clients of every kind, and the
 * sample is the first thing a buyer opens. An adviser was being shown a
 * different company's deliverable as proof of what this one produces.
 *
 * THE MODEL KEEPS ITS KOSHER FIELDS. kosherTitle, shabbosLabel and the
 * "shabbos" kind stay in the type, because an adviser planning for a Jewish
 * client has real use for them and this product is not forbidden to serve one.
 * What is forbidden is the SAMPLE using them, because the sample is marketing.
 */

const FORBIDDEN =
  /\b(kosher|kashrus|kashrut|hechsher|hechsherim|teudah|cholov|glatt|jewish|shabbos|shabbat|shul|shuls|minyan|minyanim|mikvah|mikvaos|kever|kevarim|tzadik|tzaddik|beis hachaim|batei hachaim|synagogue|menorah|candle-lighting|erev)\b/i;

/** Every string a visitor could be shown, out of a nest of objects and arrays. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, out);
  else if (value && typeof value === "object") for (const item of Object.values(value)) strings(item, out);
  return out;
}

describe("the printed and on-site sample is a neutral trip", () => {
  it("says nothing brand-specific anywhere in it", () => {
    const guilty = strings(SAMPLE_ITINERARY).filter((line) => FORBIDDEN.test(line));
    assert.deepEqual(guilty, [], "the sample itinerary still carries kosher content");
  });

  it("and neither does the notice or the contents panel", () => {
    assert.doesNotMatch(SAMPLE_NOTICE, FORBIDDEN);
    assert.deepEqual(strings(WHAT_IS_IN_IT).filter((line) => FORBIDDEN.test(line)), []);
  });

  it("still shows a real week rather than a placeholder", () => {
    // Neutral must not become empty. The point of the sample is that it is a
    // whole trip, with a shape somebody recognises.
    assert.ok(SAMPLE_ITINERARY.activities.length >= 8, "the sample lost most of its days");
    assert.equal(SAMPLE_ITINERARY.travelers?.length, 5);
    assert.ok(SAMPLE_ITINERARY.flights.length >= 2, "a trip with no way home is not a sample");
  });

  it("still names nothing that would be a claim", () => {
    // No airline, no hotel, no confirmation code, no price — the rule that
    // made this sample honest in the first place, kept through the rewrite.
    const text = strings(SAMPLE_ITINERARY).join(" ");
    assert.doesNotMatch(text, /\b(confirmation|reference)\s*(number|code)\s*:/i);
    assert.doesNotMatch(text, /[$€£]\s?\d/);
    assert.match(SAMPLE_ITINERARY.lodging[0].name, /^A hotel /, "the sample names a property");
  });
});

describe("the client app demo is a neutral trip", () => {
  it("says nothing brand-specific anywhere in it", () => {
    const guilty = strings(COMPANION_DEMO_TRIP).filter((line) => FORBIDDEN.test(line));
    assert.deepEqual(guilty, [], "the app demo still carries kosher content");
  });

  it("populates none of the model's kosher fields", () => {
    // They stay in the type on purpose — an adviser planning for a Jewish
    // client has real use for them. The demo simply must not use them.
    assert.equal(COMPANION_DEMO_TRIP.kosherTitle, undefined);
    assert.equal(COMPANION_DEMO_TRIP.kosherNote, undefined);
    for (const day of COMPANION_DEMO_TRIP.days) {
      assert.equal(day.shabbosLabel, undefined, `${day.name} still carries a Shabbos label`);
      assert.equal(day.shabbosNote, undefined, `${day.name} still carries a Shabbos note`);
      for (const item of day.items) {
        assert.notEqual(item.kind, "shabbos", `${day.name} still has a Shabbos entry`);
      }
    }
  });

  it("keeps the kosher fields available in the model", () => {
    // If these ever disappear, an adviser loses the ability to plan a Jewish
    // client's trip in a product that is meant to serve every kind.
    const model = readFileSync("data/companion-demo.ts", "utf8");
    assert.match(model, /kosherTitle\?: string;/);
    assert.match(model, /shabbosLabel\?: string;/);
    assert.match(model, /"travel" \| "sight" \| "meal" \| "rest" \| "shabbos"/);
  });

  it("is still a full week with everything the app shows", () => {
    assert.ok(COMPANION_DEMO_TRIP.days.length >= 7, "the demo lost days");
    assert.ok((COMPANION_DEMO_TRIP.messages?.length ?? 0) >= 2, "the demo lost its chat");
    assert.ok(COMPANION_DEMO_TRIP.guideSections.length >= 2, "the demo lost its guide");
    assert.ok(COMPANION_DEMO_TRIP.prefs.length >= 4);
  });
});
