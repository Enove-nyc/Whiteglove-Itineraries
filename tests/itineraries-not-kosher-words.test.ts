import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ITINERARIES_ABOUT_BLOCKS } from "@/data/about-itineraries";
import { BUILT_IN_WORDS } from "@/data/site-words";
import { TRIP_KINDS } from "@/lib/trip-plan";
import { wordsFor } from "@/lib/site-words";

/**
 * This site sells general travel, and had the other one's vocabulary on it.
 *
 * WHAT WAS RENDERED, read off the live domain rather than guessed at:
 *
 *   /plan   a Group trip is "Several families, a school, a shul or a simcha"
 *   /book   "Search the travel that fits your destination, dates, and kosher
 *           needs"
 *   /login  "Save kevarim, keep your travel notes together"
 *   /about  the whole kosher About page — how to tell whether you can walk to
 *           a minyan from a hotel on Shabbos, the kosher food finder, and
 *           refusing to give a hechsher among the things the business will not
 *           do
 *
 * None of it was a decision about this brand. Each is a built-in default that
 * shipped on a site that was one site, and stayed put when it became two.
 * White Glove Itineraries is explicitly not a kosher travel product, and an
 * adviser reading any of those pages was learning about a different company.
 *
 * ANYTHING THE OWNER TYPED HIMSELF STILL WINS, on both domains. He has one
 * admin for two deployments, so a sentence he wrote is a sentence he meant;
 * only the value nobody chose moves with the brand.
 */

const FORBIDDEN = /\b(kosher|kashrus|shabbos|shul|shuls|mikvah|mikvaos|kever|kevarim|hechsher|minyan|simcha|bais hachaim|batei hachaim)\b/i;

describe("the built-in wording says what this brand is", () => {
  it("the search box does not announce kosher food and kevarim", () => {
    const words = wordsFor("itineraries");
    assert.doesNotMatch(words.searchPlaceholder, FORBIDDEN);
    // And the kosher site keeps its own.
    assert.match(wordsFor("kosher").searchPlaceholder, FORBIDDEN);
  });

  it("the booking notice does not offer to match kosher needs", () => {
    assert.doesNotMatch(wordsFor("itineraries").bookingNotice, FORBIDDEN);
    assert.match(wordsFor("kosher").bookingNotice, FORBIDDEN);
  });

  it("keeps anything the owner wrote himself, on both sites", () => {
    // The whole point of the seam: only the value that shipped moves.
    const his = { ...BUILT_IN_WORDS, bookingNotice: "Whatever he decided to say about kosher needs." };
    assert.equal(wordsFor("itineraries", his).bookingNotice, his.bookingNotice);
  });
});

describe("a group trip on this site is not a Jewish group trip", () => {
  it("the group blurb has an itineraries wording", () => {
    const group = TRIP_KINDS.find((kind) => kind.value === "group")!;
    assert.ok(group.itinerariesBlurb, "the group blurb still reads 'a school, a shul or a simcha' on both sites");
    assert.doesNotMatch(group.itinerariesBlurb, FORBIDDEN);
    // The kosher wording is not deleted — it is right on the site it is for.
    assert.match(group.blurb, FORBIDDEN);
  });

  it("the flow actually reaches for it", () => {
    const flow = readFileSync("components/TripStartFlow.tsx", "utf8");
    assert.match(flow, /itineraries && kind\.itinerariesBlurb/);
  });

  it("heritage is dropped here rather than reworded", () => {
    // The category itself belongs to the guide; a general-travel product
    // offering "Heritage — kevarim, batei hachaim and the towns they are in"
    // is not a wording problem.
    assert.match(readFileSync("components/TripStartFlow.tsx", "utf8"), /kind\.value !== "heritage"/);
  });
});

describe("the sign-in page does not promise to save kevarim", () => {
  it("says something true of this product instead", () => {
    const login = readFileSync("app/login/page.tsx", "utf8");
    assert.match(login, /itineraries\s*\?\s*"Save the places you like/);
    assert.match(login, /"Save kevarim/, "the kosher site's own line should stay");
  });
});

describe("the About page introduces this company, not the other one", () => {
  it("has its own built-in blocks", () => {
    assert.ok(ITINERARIES_ABOUT_BLOCKS.length >= 4);
    const text = JSON.stringify(ITINERARIES_ABOUT_BLOCKS);
    assert.doesNotMatch(text, FORBIDDEN);
  });

  it("keeps the shape worth keeping", () => {
    // Why it exists, how it works, how the business is paid, what it will not
    // do. The last one is the reason the kosher page is any good.
    const ids = ITINERARIES_ABOUT_BLOCKS.map((block) => block.id);
    for (const id of ["about-why", "about-how", "about-paid", "about-not"]) {
      assert.ok(ids.includes(id), `the itineraries About is missing ${id}`);
    }
  });

  it("names no person, the same as the other one", () => {
    // White Glove is not based anywhere; it is a website. A standing rule.
    const text = JSON.stringify(ITINERARIES_ABOUT_BLOCKS);
    assert.doesNotMatch(text, /years of experience|founded by|based in|our team of/i);
  });

  it("is used only when he has not written the page himself", () => {
    const about = readFileSync("app/about/page.tsx", "utf8");
    assert.match(about, /siteBrand === "itineraries" && !page\?\.edited/);
  });
});

describe("the brand is settled before the HTML is sent, not after it arrives", () => {
  it("/plan hands the flow the brand it read from the request", () => {
    /**
     * THE HOOK IS NOT ENOUGH ON THE SERVER, and this is where that showed.
     * useIsItineraries falls back during SSR to the build's configured brand,
     * and that variable is not set on the itineraries deployment — so the HTML
     * this page was SERVED with said kosher and only corrected itself after
     * hydration. What a crawler and the first paint actually got was a group
     * trip described as "several families, a school, a shul or a simcha", on
     * the general-travel domain. Confirmed by fetching the live page.
     */
    const page = readFileSync("app/plan/page.tsx", "utf8");
    assert.match(page, /const brand = await currentBrand\(\)/);
    assert.match(page, /<TripStartFlow[^>]*brand=\{brand\}/);
  });

  it("the flow prefers the server's answer to the hostname", () => {
    const flow = readFileSync("components/TripStartFlow.tsx", "utf8");
    assert.match(flow, /const itineraries = brand \? brand === "itineraries" : fromHost/);
  });
});
