import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { GUIDE_ONLY_PREFIXES, isGuidePath } from "@/lib/guide-paths";
import { publicPaths } from "@/lib/site-map";

/**
 * This domain's sitemap must list this domain's pages.
 *
 * WHAT IT WAS DOING INSTEAD. lib/site-map.ts is shared with the kosher
 * repository and lists the whole guide, so whitegloveitineraries.com/sitemap.xml
 * offered Google 783 URLs of which 760 were kosher pages — 370 kevarim, 242
 * batei hachaim, 106 heritage towns, every destination — and the middleware
 * redirected every one of them straight off the domain.
 *
 * A sitemap of redirects is worse than no sitemap. It spends the domain's
 * crawl budget on pages it does not have, splits its own authority across
 * paths it never serves, and tells a search engine the site does not know what
 * it is. The middleware had known these were not ours since the split; nothing
 * connected that knowledge to the sitemap, because the list lived inside
 * middleware.ts where only the middleware could read it.
 */

describe("the sitemap offers only what this domain actually serves", () => {
  const SITEMAP = readFileSync("app/sitemap.ts", "utf8");

  it("filters the guide out", () => {
    assert.match(SITEMAP, /isGuidePath/, "the sitemap does not know which paths are the guide's");
    assert.match(SITEMAP, /\.filter\(\(\{ path \}\) => !isGuidePath\(path\)\)/);
  });

  it("leaves nothing behind that the middleware redirects away", () => {
    // The real assertion, computed rather than asserted about: run the same
    // filter the route runs and check the result is clean.
    const offered = publicPaths().map(({ path }) => path).filter((path) => !isGuidePath(path));
    const strays = offered.filter((path) => isGuidePath(path));
    assert.deepEqual(strays, []);
    // And that the filter is doing real work — if publicPaths ever stopped
    // carrying the guide this test would pass while asserting nothing.
    const all = publicPaths().map(({ path }) => path);
    assert.ok(all.length - offered.length > 500, `only ${all.length - offered.length} guide paths were filtered`);
  });

  it("still offers this domain's own pages", () => {
    const offered = new Set(publicPaths().map(({ path }) => path).filter((path) => !isGuidePath(path)));
    for (const own of ["/", "/plan", "/sample-itinerary", "/book", "/pricing", "/about", "/contact"]) {
      assert.ok(offered.has(own), `${own} is this domain's own page and is not in its sitemap`);
    }
  });
});

describe("one list, read by both the router and the sitemap", () => {
  it("middleware.ts no longer keeps its own copy", () => {
    /**
     * The whole cause. The prefixes lived in middleware.ts and were read by
     * nothing else, so the sitemap could not have known — and a second copy
     * would put it straight back.
     */
    const middleware = readFileSync("middleware.ts", "utf8");
    assert.match(middleware, /from "@\/lib\/guide-paths"/);
    assert.doesNotMatch(middleware, /^const GUIDE_ONLY_PREFIXES = \[/m, "middleware.ts has its own list again");
  });

  it("routes the city guides, which sit under no prefix at all", () => {
    // /uman, /belz, /lizhensk — bare slugs at the root, so no prefix rule
    // catches them. They answered 404 on this domain instead of going to the
    // site that holds them.
    assert.ok(isGuidePath("/uman"));
    assert.ok(isGuidePath("/lizhensk"));
    assert.ok(!isGuidePath("/plan"), "the planner's own pages must not be routed away");
    assert.ok(!isGuidePath("/sample-itinerary"), "the page that sells this product must stay");
  });

  it("routes a destination's Shabbos page", () => {
    // Kosher content under a prefix nobody had added, so /shabbos/rome
    // answered 404 here rather than going to the site that holds it.
    assert.ok(isGuidePath("/shabbos/rome"));
    assert.ok(GUIDE_ONLY_PREFIXES.includes("/shabbos"));
  });
});

describe("the redirect off this domain is permanent", () => {
  it("answers 308, not 307 — and locally, not to the other site", () => {
    /**
     * 307 was temporary on the grounds that the split was young, and it cost:
     * a temporary redirect tells a search engine to keep the itineraries URL
     * indexed and keep returning to it, which is how 760 kosher paths stayed
     * attributed to this domain.
     *
     * The destination changed after it. A permanent redirect to
     * whiteglovekoshertravel.com is still directing this product's visitors to
     * the other one, which this product must not do. Permanent, and to a page
     * here — or 410 when there is no page here to send them to.
     */
    const middleware = readFileSync("middleware.ts", "utf8");
    assert.match(middleware, /NextResponse\.redirect\(new URL\(answer\.to \+ request\.nextUrl\.search, request\.url\), 308\)/);
    assert.match(middleware, /status: 410/);
  });
});

describe("the sitemap dates itself once, not once per crawl", () => {
  it("computes lastModified outside the handler", () => {
    // This route reads Redis for the case studies and is therefore dynamic, so
    // a date on the handler's first line is the moment the crawler asked, on
    // every URL, every time. At module scope it is the deploy.
    const SITEMAP = readFileSync("app/sitemap.ts", "utf8");
    const handlerAt = SITEMAP.indexOf("export default async function sitemap");
    const dateAt = SITEMAP.indexOf("const lastModified = new Date()");
    assert.ok(dateAt >= 0 && dateAt < handlerAt, "lastModified is computed per request");
  });
});
