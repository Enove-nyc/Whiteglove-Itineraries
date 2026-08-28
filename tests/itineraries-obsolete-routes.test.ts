import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { GUIDE_ONLY_PREFIXES, guideAnswer, isGuidePath } from "@/lib/guide-paths";
import { publicPaths } from "@/lib/site-map";

/**
 * A path that is not this domain's gets one of three answers, and none of them
 * is the other company.
 *
 * IT USED TO 308 EVERY ONE OF THEM TO whiteglovekoshertravel.com. That was
 * right about the mechanism — a real redirect, not a soft 200 — and wrong
 * about the destination. This product must not direct its visitors to the
 * kosher site, and a redirect is the most direct direction there is: somebody
 * who typed whitegloveitineraries.com/cemeteries was handed to a different
 * company without being asked.
 *
 *   • A neutral equivalent here → 308 to it. /travel-insurance is booking and
 *     this site has a booking page, so the redirect is useful rather than a
 *     hand-off.
 *   • Nothing equivalent → 410 Gone. This domain has never served /tzaddikim
 *     and never will, and 410 says exactly that: not "look over there", not
 *     "try later", but "this address is not ours". A crawler drops it.
 *   • Anything else → 404, which is what an unknown path already got.
 */

describe("no guide path hands a visitor to the other site", () => {
  it("answers every one of them locally", () => {
    for (const prefix of GUIDE_ONLY_PREFIXES) {
      const answer = guideAnswer(prefix);
      assert.ok(answer, `${prefix} is not answered at all`);
      if (answer.kind === "redirect") {
        assert.ok(answer.to.startsWith("/"), `${prefix} redirects off-site to ${answer.to}`);
        assert.doesNotMatch(answer.to, /whiteglovekoshertravel/i);
      }
    }
  });

  it("does not send anybody to the kosher origin any more", () => {
    const middleware = readFileSync("middleware.ts", "utf8");
    const block = middleware.slice(middleware.indexOf("const answer = guideAnswer(pathname)"));
    const guard = block.slice(0, block.indexOf("}\n"));
    assert.doesNotMatch(guard, /BRAND_ORIGIN\.kosher/, "the guide redirect still points at the other company");
  });
});

describe("the three answers, by path", () => {
  const REDIRECTS: Array<[string, string]> = [
    // The kevarim-towns directory is a list of places to build a trip around;
    // the planner is where this product builds one.
    ["/stops", "/itinerary"],
    // Booking, all four, and this site has a booking page.
    ["/travel-insurance", "/book"],
    ["/transfers", "/book"],
    ["/esim", "/book"],
    ["/hotels", "/book"],
  ];

  for (const [from, to] of REDIRECTS) {
    it(`${from} redirects to ${to}`, () => {
      assert.deepEqual(guideAnswer(from), { kind: "redirect", to });
      // And so does anything under it, so /hotels/anything is not a 410.
      assert.deepEqual(guideAnswer(`${from}/something`), { kind: "redirect", to });
    });
  }

  const GONE = ["/kosher", "/kosher-travel", "/tzaddikim", "/cemeteries", "/mikvaos", "/shuls", "/hechsherim", "/heritage", "/destinations", "/submit", "/alerts", "/shabbos/rome", "/uman"];
  for (const path of GONE) {
    it(`${path} is gone, not redirected`, () => {
      assert.deepEqual(guideAnswer(path), { kind: "gone" }, `${path} should be 410 on this domain`);
    });
  }

  it("leaves this domain's own paths alone", () => {
    for (const own of ["/", "/itinerary", "/plan", "/book", "/pricing", "/app", "/sample-itinerary", "/login", "/about"]) {
      assert.equal(guideAnswer(own), null, `${own} is being treated as the guide's`);
      assert.equal(isGuidePath(own), false);
    }
  });
});

describe("a real status, never a soft 200", () => {
  const middleware = readFileSync("middleware.ts", "utf8");

  it("returns 410 with a readable body and noindex", () => {
    assert.match(middleware, /status: 410/);
    // A status alone is for the crawler; a person who followed an old link
    // needs a way onward.
    assert.match(middleware, /Build a trip/);
    assert.match(middleware, /"x-robots-tag": "noindex, nofollow"/);
    // The two must agree — a 410 that invites indexing is a contradiction.
    assert.match(middleware, /name="robots" content="noindex,nofollow"/);
  });

  it("uses a permanent redirect, not a rewrite", () => {
    // A rewrite would leave the obsolete address in the bar with a 200 under
    // it, which is the defect this replaces.
    assert.match(middleware, /NextResponse\.redirect\(new URL\(answer\.to \+ request\.nextUrl\.search, request\.url\), 308\)/);
  });

  it("keeps them all out of the sitemap", () => {
    const offered = publicPaths().map(({ path }) => path).filter((path) => !isGuidePath(path));
    assert.deepEqual(offered.filter((path) => guideAnswer(path)), []);
  });
});
