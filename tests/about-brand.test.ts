import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ABOUT_HEADING, ABOUT_INTRO, ABOUT_INTRO_ITINERARIES, aboutIntroFor } from "@/data/about-profile";

/**
 * The About page, on the site the visitor is actually on.
 *
 * On whitegloveitineraries.com it opened "White Glove Kosher Travel is built
 * around the questions that decide a Jewish family's trip. Where the kosher
 * food is..." — to somebody who came for an itinerary tool, has quite possibly
 * never heard of the other site, and is now reading about a business they did
 * not come to.
 *
 * SWAPPING THE NAME WOULD NOT HAVE FIXED IT, which is the thing worth pinning
 * here. The sentences underneath describe a kosher travel guide; they are not
 * true of a planner, and a page that said "White Glove Itineraries is built
 * around where the kosher food is" would be a different wrong answer rather
 * than a right one.
 */

describe("each site's About says what that site is", () => {
  it("gives the itineraries brand its own opening", () => {
    assert.notDeepEqual(aboutIntroFor("itineraries"), aboutIntroFor("kosher"));
    assert.deepEqual(aboutIntroFor("itineraries"), ABOUT_INTRO_ITINERARIES);
    assert.deepEqual(aboutIntroFor("kosher"), ABOUT_INTRO);
  });

  it("never mentions the other site by name", () => {
    // The whole complaint. A visitor to one brand should not be told there is
    // another business behind it.
    const said = ABOUT_INTRO_ITINERARIES.join(" ");
    assert.doesNotMatch(said, /Kosher Travel/i);
    assert.match(said, /White Glove Itineraries/);
  });

  it("does not claim the kosher guide's job", () => {
    // Not a stylistic point: these are claims. A planner does not know where
    // the kosher food is or which quarter is walkable on Shabbos, and saying
    // so would be false rather than merely off-brand.
    const said = ABOUT_INTRO_ITINERARIES.join(" ");
    for (const claim of [/kosher food/i, /Shabbos/i, /minyan/i, /kever|kevarim/i, /hechsher/i]) {
      assert.doesNotMatch(said, claim);
    }
  });

  it("makes no offer to plan anybody's trip for them", () => {
    // A settled decision on this site: there is no done-for-you planning
    // anywhere, discreet or otherwise.
    const said = ABOUT_INTRO_ITINERARIES.join(" ");
    assert.doesNotMatch(said, /we (will )?(plan|build|arrange) (your|the) trip/i);
    assert.doesNotMatch(said, /let us plan|have us plan|plan it for you/i);
  });

  it("carries no personal facts, and does not say where anybody is", () => {
    // The About page carries no name, no background, no photograph, no years
    // of experience and no location. White Glove is not based anywhere.
    const said = ABOUT_INTRO_ITINERARIES.join(" ");
    assert.doesNotMatch(said, /\bI\b|\bmy\b|founded by|years of experience|based in/i);
  });

  it("opens each site with its own promise", () => {
    assert.notEqual(ABOUT_HEADING.itineraries, ABOUT_HEADING.kosher);
    assert.doesNotMatch(ABOUT_HEADING.itineraries, /kosher/i);
  });
});

describe("the page renders the brand's version", () => {
  const SECTION = readFileSync("components/AboutProfileSection.tsx", "utf8");

  it("reads the heading and the intro from the brand, not from a constant", () => {
    assert.match(SECTION, /\{ABOUT_HEADING\[siteBrand\]\}/);
    assert.match(SECTION, /aboutIntroFor\(siteBrand\)/);
    assert.doesNotMatch(SECTION, /Travel information you can plan around\./);
  });

  it("keeps the listing standard on the site that has listings", () => {
    // It describes how places are chosen for the directory. The itineraries
    // site holds somebody's own trip, not a curated list of anywhere, so
    // printing it there would explain an editorial standard applied to
    // nothing.
    assert.match(SECTION, /siteBrand === "kosher" && <p[^>]*>\{LISTING_AUDIENCE_ABOUT\}<\/p>/);
  });
});
