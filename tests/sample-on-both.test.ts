import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { publicPaths } from "@/lib/site-map";

/**
 * The page that answers "what do I actually get", on the site that charges for it.
 *
 * WHAT IT WAS DOING. /sample-itinerary sat in GUIDE_ONLY_PREFIXES, so on
 * whitegloveitineraries.com it answered 307 and threw the visitor onto
 * whiteglovekoshertravel.com. The planner's own page links to it, and the
 * pricing page's "still deciding?" line sent people looking for the same thing
 * — so the paid product was ejecting its own prospects mid-decision, onto a
 * different company's website.
 *
 * WHY THE PREFIX LIST WAS NOT THE WHOLE FIX. The page made three claims that
 * are false on this domain: it offered itself as "free, either way" on a site
 * that charges; it addressed the reader as the traveller when here the reader
 * is the one building the trip for somebody else; and it linked to
 * /verification, which IS guide-only and would have ejected them anyway, two
 * scrolls further down.
 */

function guideOnlyPrefixes(): string[] {
  const source = readFileSync("middleware.ts", "utf8");
  const block = source.match(/const GUIDE_ONLY_PREFIXES = \[([\s\S]*?)\];/);
  assert.ok(block, "middleware.ts no longer declares GUIDE_ONLY_PREFIXES the way this test reads it");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("the sample is reachable on the domain that sells it", () => {
  it("is not redirected off this domain", () => {
    assert.ok(
      !guideOnlyPrefixes().includes("/sample-itinerary"),
      "/sample-itinerary is guide-only again, so the paid site ejects anybody who asks to see one",
    );
  });

  it("is still a public page the sitemap offers", () => {
    assert.ok(publicPaths().some((entry) => entry.path === "/sample-itinerary"));
  });

  it("does not send the reader anywhere that is guide-only", () => {
    // Every internal link on the page, checked against the same list. A link
    // out to the other brand is the bug this page was moved to stop.
    const source = readFileSync("app/sample-itinerary/page.tsx", "utf8");
    const guideOnly = guideOnlyPrefixes();
    const links = [...source.matchAll(/href=(?:"([^"]+)"|\{[^}]*?"(\/[^"]+)"[^}]*?\})/g)]
      .flatMap((m) => [m[1], m[2]])
      .filter((href): href is string => Boolean(href) && href.startsWith("/"));
    assert.ok(links.length > 0, "no internal links found — the pattern this test reads has changed");
    // Proof the scan can see a guide-only link at all. Without this the loop
    // below passes whenever the regex quietly stops matching.
    assert.ok(links.includes("/verification"), "the scan no longer finds the one guide-only link on this page");
    for (const href of links) {
      const guided = guideOnly.some((prefix) => href === prefix || href.startsWith(`${prefix}/`));
      if (!guided) continue;
      // A guide-only link is allowed ONLY behind the kosher-brand branch.
      const at = source.indexOf(`href="${href}"`);
      const before = source.slice(Math.max(0, at - 700), at);
      assert.ok(
        before.includes("!itineraries &&"),
        `${href} is guide-only and is not behind the kosher-only branch`,
      );
    }
  });
});

describe("the sample says true things on each brand", () => {
  const source = readFileSync("app/sample-itinerary/page.tsx", "utf8");

  it("makes no free-of-charge promise on the paid brand", () => {
    // AGENTS.md: no blanket payment promises. "Free, either way" is true on the
    // kosher site and false here, so it must sit behind the brand.
    const free = source.indexOf('"Free, either way"');
    assert.ok(free > 0, "the kosher wording has gone — check this test still describes the page");
    const around = source.slice(Math.max(0, free - 300), free);
    assert.ok(around.includes("itineraries ?"), "the free claim is not behind a brand check");
  });

  it("prints no price of its own", () => {
    // The amounts are the owner's, read at request time through offerLine().
    // A figure typed here would be a promise the billing code never made.
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    assert.ok(!/\$\s?\d/.test(withoutComments), "a price is hardcoded on this page");
  });

  it("settles the brand per request rather than at build", () => {
    // A static metadata export cannot ask which of two companies is being
    // visited, and the title is the first thing a search result shows.
    assert.ok(source.includes("export async function generateMetadata"));
    assert.ok(source.includes("await currentBrand()") || source.includes("currentBrand()"));
    assert.ok(!/export const metadata = pageMetadata/.test(source));
  });
});

/**
 * The DOCUMENT, not just the page around it.
 *
 * PrintableItinerary defaults siteBrand to kosher, on grounds that were true
 * when /sample-itinerary was guide-only and stopped being true the moment it
 * was not: the cover, the footer and every day's running head printed "White
 * Glove Kosher Travel" on the site that sells this. An advisor was being shown
 * the other company's deliverable as proof of what this one produces.
 */
describe("the printed sample carries the brand of the site showing it", () => {
  const source = readFileSync("app/sample-itinerary/page.tsx", "utf8");

  it("passes the brand rather than taking the default", () => {
    assert.match(source, /<PrintableItinerary[^>]*siteBrand=\{brand\}/s);
  });

  it("every caller that prints a document names its brand", () => {
    // The default is now only an answer for a caller that forgets. None do.
    for (const file of [
      "app/sample-itinerary/page.tsx",
      "app/itinerary/print/page.tsx",
      "app/i/[shareId]/print/page.tsx",
    ]) {
      const caller = readFileSync(file, "utf8");
      assert.ok(caller.includes("siteBrand="), `${file} leaves the document's brand to the default`);
    }
  });
});

describe("the itineraries front door offers it", () => {
  it("puts the finished document beside the empty planner", () => {
    // Both old actions asked somebody to start using the product before they
    // had seen what it produces.
    const home = readFileSync("components/ItinerariesHome.tsx", "utf8");
    assert.ok(home.includes('href="/sample-itinerary"'));
  });

  it("answers the pricing page's own question with it", () => {
    const pricing = readFileSync("app/pricing/page.tsx", "utf8");
    assert.ok(pricing.includes('href="/sample-itinerary"'));
  });
});

/** Nothing on the itineraries side should link to a page that ejects it. */
describe("no itineraries-only page links off the domain", () => {
  const guideOnly = guideOnlyPrefixes();
  const files = ["components/ItinerariesHome.tsx", "app/pricing/page.tsx"];

  for (const file of files) {
    it(`${file} keeps its links on this site`, () => {
      const source = readFileSync(file, "utf8");
      for (const [, href] of source.matchAll(/href="(\/[^"]*)"/g)) {
        const guided = guideOnly.some((prefix) => href === prefix || href.startsWith(`${prefix}/`));
        assert.ok(!guided, `${file} links to ${href}, which redirects to the other brand`);
      }
    });
  }
});
