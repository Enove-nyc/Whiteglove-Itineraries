import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  categoriesForBrand,
  ITINERARIES_CATEGORIES,
  itinerariesBookingCategoryFor,
  NAV_CATEGORIES,
} from "@/lib/navigation";
import { brandForHost, brandFromRequestHeaders } from "@/lib/site-brand-core";

/**
 * whitegloveitineraries.com is its own site — STRICTLY the planner, not a guide.
 *
 * This pins the two halves of that. The navigation the itineraries domain shows
 * carries only planning, booking and the app — none of the guide's browsable
 * sections. And the middleware sends any guide page reached on that domain to
 * the kosher site, so the two never blur into one.
 */

function bag(entries: Record<string, string>) {
  const lower = new Map(Object.entries(entries).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name: string) => lower.get(name.toLowerCase()) ?? null };
}

const guideHref = (href: string) =>
  ["/kosher", "/cemeteries", "/tzaddikim", "/shuls", "/mikvaos", "/heritage", "/hotels", "/things-to-do", "/destinations", "/map", "/directory"]
    .some((p) => href === p || href.startsWith(`${p}?`) || href.startsWith(`${p}/`));

describe("the itineraries bar is a planner, not a guide", () => {
  it("carries only Plan, Book and the app", () => {
    assert.deepEqual(
      ITINERARIES_CATEGORIES.map((c) => c.label),
      ["Plan", "Book", "The app"],
    );
  });

  it("names no guide page anywhere in its menus", () => {
    for (const category of ITINERARIES_CATEGORIES) {
      for (const link of category.links) {
        assert.ok(!guideHref(link.href), `itineraries menu should not link the guide page ${link.href}`);
      }
    }
  });

  it("hands the itineraries brand its own bar, and leaves the kosher one alone", () => {
    assert.equal(categoriesForBrand("itineraries"), ITINERARIES_CATEGORIES);
    assert.equal(categoriesForBrand("kosher"), NAV_CATEGORIES);
    // The kosher bar still has its guide category — untouched.
    assert.ok(NAV_CATEGORIES.some((c) => c.label === "Kosher"));
  });

  it("resolves Book to the booking searches, never a browse", () => {
    const open = itinerariesBookingCategoryFor({ searchIsPublic: true, label: "Book", href: "/book", description: "" });
    assert.deepEqual(open.links.map((l) => l.label), ["Flights", "Hotels", "Cars"]);
    // Locked, it collapses to the one public assistance link — still not a browse.
    const locked = itinerariesBookingCategoryFor({ searchIsPublic: false, label: "Ask us to book", href: "/contact", description: "d" });
    assert.equal(locked.links.length, 1);
    assert.equal(locked.links[0].href, "/contact");
  });
});

describe("brand reads the proxy header, then the host", () => {
  it("honours the header when the worker has rewritten the Host", () => {
    assert.equal(brandFromRequestHeaders(bag({ host: "whiteglove-production.up.railway.app", "x-wg-brand": "itineraries" })), "itineraries");
    assert.equal(brandForHost("www.whitegloveitineraries.com"), "itineraries");
    assert.equal(brandForHost("www.whiteglovekoshertravel.com"), "kosher");
  });
});

describe("a page body never hands out a bare guide link on the itineraries domain", () => {
  // The nav bar and the middleware are not the only way a visitor reaches a
  // guide page. These three components each had a plain, unconditional
  // <a>/<Link> straight to a GUIDE_ONLY_PREFIXES path, reachable from pages
  // the itineraries domain serves itself (the itinerary builder, /plan): a
  // tap there silently bounced the visitor to the kosher domain — which,
  // inside an installed itineraries app, is not a same-site navigation but a
  // Trusted Web Activity losing its verified domain and falling back to an
  // ordinary browser tab, address bar and all. Each must now read the brand
  // before it ever renders that href.

  it("ItineraryFooter only signs the kosher brand, and only links kevarim, once it knows this is the kosher domain", () => {
    const src = readFileSync("components/ItineraryFooter.tsx", "utf8");
    assert.match(src, /useIsItineraries\(\)/);
    assert.match(src, /itineraries \? "White Glove Itineraries" : "White Glove Kosher Travel"/);
    // Both branches exist — the itineraries one links the app, the kosher
    // one still links kevarim — and the choice happens before either href is
    // ever chosen, not after an unconditional render.
    const branch = src.slice(src.indexOf("itineraries ? ("), src.indexOf("</div>\n      </div>\n    </div>"));
    assert.match(branch, /href="\/app"/);
    assert.match(branch, /href="\/cemeteries"/);
  });

  it("KosherNearby only sends a visitor to /kosher on the domain that has one", () => {
    const src = readFileSync("components/KosherNearby.tsx", "utf8");
    assert.match(src, /useIsItineraries\(\)/);
    assert.match(src, /itineraries \? `\$\{BRAND_ORIGIN\.kosher\}\/kosher` : "\/kosher"/);
  });

  it("TripStartFlow only sends a visitor to /heritage on the domain that has one", () => {
    const src = readFileSync("components/TripStartFlow.tsx", "utf8");
    assert.match(src, /useIsItineraries\(\)/);
    assert.match(src, /\$\{BRAND_ORIGIN\.kosher\}\/heritage/);
  });

  it("TripStartFlow does not offer to browse destinations on a site with no directory", () => {
    // The owner found this one on the live site: "Browse destinations first"
    // pushed /destinations, which is guide-only, so the last step of the
    // planning flow threw the visitor onto the kosher domain.
    const src = readFileSync("components/TripStartFlow.tsx", "utf8");
    const card = src.slice(src.indexOf("Not decided") - 400, src.indexOf("Browse destinations first") + 60);
    assert.match(card, /\{!itineraries && \(/, "the card is offered on both brands");
    // And the handler itself refuses, so re-adding the card cannot reopen it.
    assert.match(src, /if \(method === "myself" \|\| itineraries\) router\.push\("\/itinerary\?from=plan"\)/);
  });

  it("SearchResults offers the planner, not the directory, when nothing is typed", () => {
    const src = readFileSync("components/SearchResults.tsx", "utf8");
    assert.match(src, /useIsItineraries\(\)/);
    const empty = src.slice(src.indexOf("if (!query)"), src.indexOf("if (!query)") + 1200);
    assert.match(empty, /itineraries \? \(/);
    assert.match(empty, /href="\/itinerary"/);
  });

  it("TravelAssistantBox names the food finder as the other site rather than bouncing there", () => {
    const src = readFileSync("components/TravelAssistantBox.tsx", "utf8");
    assert.match(src, /useIsItineraries\(\)/);
    assert.match(src, /\$\{BRAND_ORIGIN\.kosher\}\/kosher/);
  });

  it("CaseStudiesSection does not link a page that only the guide has", () => {
    // /about is served on both domains and carries the strip; /case-studies
    // is guide-only, so the link off the strip is a bounce on this one.
    const src = readFileSync("components/CaseStudiesSection.tsx", "utf8");
    assert.match(src, /siteBrand !== "itineraries" && caseStudiesPageShouldExist/);
    assert.match(readFileSync("app/about/page.tsx", "utf8"), /<CaseStudiesSection studies=\{studies\} siteBrand=\{siteBrand\} \/>/);
  });
});

describe("one place decides which site this is", () => {
  it("reads the host without correcting itself after the first paint", () => {
    // The five components above each hand-rolled a useState(false) plus an
    // effect that fixed it on mount — a synchronous setState inside an effect,
    // which React 19 refuses, and an extra render to learn something that
    // cannot change. useSyncExternalStore is what that is for.
    const hook = readFileSync("components/useSiteBrand.ts", "utf8");
    assert.match(hook, /useSyncExternalStore\(subscribe, onThisHost, onThisBuild\)/);
    // The CALL, not the word — the note above it explains what it replaced.
    assert.doesNotMatch(hook, /useEffect\(/);
    // The server snapshot is the build's own brand, so the itineraries
    // deployment paints the right thing first rather than starting kosher.
    assert.match(hook, /configuredBrand\(\) \?\? "kosher"/);
  });
});

describe("the itineraries domain's own pages never title themselves 'Kosher Travel'", () => {
  // /login and /account both had a static, unconditional
  // `title: "... | White Glove Kosher Travel"` — visible in the browser tab
  // on every domain, including whitegloveitineraries.com. Signing in and
  // landing on the account page is the most common path through the site;
  // reading "Kosher Travel" in the tab the whole way is what read as "logging
  // in takes me to the kosher site" even though no navigation ever left the
  // itineraries domain. The same static-title bug was present on every other
  // page the itineraries domain calls its own (/plan, /itinerary and its
  // print view, /my-route, /book, /f, /i) — each must now read the brand
  // before choosing a title, the same way app/page.tsx already does.
  const pages = [
    "app/login/page.tsx",
    "app/account/page.tsx",
    "app/plan/page.tsx",
    "app/itinerary/page.tsx",
    "app/itinerary/print/layout.tsx",
    "app/my-route/page.tsx",
    "app/book/page.tsx",
    "app/f/[shareId]/page.tsx",
    "app/i/[shareId]/page.tsx",
    "app/proposal/page.tsx",
    "app/p/[shareId]/page.tsx",
    "app/library/page.tsx",
    "app/forms/page.tsx",
    "app/form/[shareId]/page.tsx",
    "app/pipeline/page.tsx",
    "app/payments/page.tsx",
  ];

  for (const path of pages) {
    it(`${path} reads the brand before choosing its title`, () => {
      const src = readFileSync(path, "utf8");
      assert.match(src, /export async function generateMetadata/, `${path} must compute its title, not export it statically`);
      assert.match(src, /currentBrand\(\)/, `${path} must read the real brand`);
      assert.match(src, /White Glove Itineraries/, `${path} must have an itineraries-branded title`);
    });
  }
});

describe("the guide is redirected off the itineraries domain", () => {
  const MW = readFileSync("middleware.ts", "utf8");

  it("redirects a guide path to the kosher origin, on the itineraries brand", () => {
    assert.match(MW, /isGuidePath\(pathname\) && brandFromRequestHeaders\(request\.headers\) === "itineraries"/);
    assert.match(MW, /BRAND_ORIGIN\.kosher/);
  });

  it("lists the guide's sections and NOT the planner's own paths", () => {
    const list = MW.slice(MW.indexOf("GUIDE_ONLY_PREFIXES"), MW.indexOf("function isGuidePath"));
    for (const guide of ["/kosher", "/cemeteries", "/heritage", "/destinations", "/hotels", "/things-to-do", "/directory"]) {
      assert.ok(list.includes(`"${guide}"`), `guide prefix ${guide} should be redirected`);
    }
    for (const planner of ["/plan", "/itinerary", "/app", "/account", "/i", "/f", "/book", "/proposal", "/p", "/library", "/forms", "/form", "/pipeline", "/t", "/payments", "/pay"]) {
      assert.ok(!list.includes(`"${planner}"`), `planner path ${planner} must stay on the itineraries domain`);
    }
  });
});
