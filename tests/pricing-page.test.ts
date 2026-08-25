import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ACCOUNT_PLANS } from "@/lib/account-plans";
import { planCards } from "@/data/plan-comparison";

/**
 * What it costs, on the site that sells it.
 *
 * whitegloveitineraries.com answered /pricing with a 404. The page existed
 * only in Enove-nyc/Whiteglove, which serves the other domain — so this site
 * asked people to sign in to a paid product and had nowhere to say what it
 * charged. Ported here, and adapted rather than copied: two things in it
 * described capabilities this repository does not have.
 */

describe("the page describes what this site can actually do", () => {
  const COMPARISON = readFileSync("data/plan-comparison.ts", "utf8");
  const PAGE = readFileSync("app/pricing/page.tsx", "utf8");

  it("promises no extra logins, because this repository has no seats to sell", () => {
    // THE ONE WORTH PINNING. The other repository added agency staff seats and
    // its comparison lists them. PlanLimits here carries no staffSeats at all,
    // so a line copied across for tidiness would be a promise nobody here
    // could keep — and a pricing page is the last place to describe something
    // a person would not receive.
    // The property access, not the word — the comment in that file explains
    // why the line is absent and would otherwise match itself.
    assert.doesNotMatch(COMPARISON, /limits\.staffSeats/);
    assert.doesNotMatch(COMPARISON, /more logins for people who work with you/);
    const limits = readFileSync("lib/account-limits.ts", "utf8");
    assert.doesNotMatch(limits, /\bstaffSeats\b/, "if seats ever land here, revisit this test rather than deleting it");
  });

  it("names the plans this deployment actually has", () => {
    for (const card of planCards()) {
      assert.ok((ACCOUNT_PLANS as readonly string[]).includes(card.plan), `${card.plan} is not a plan here`);
    }
    assert.ok(planCards().length >= 3, "expected the paid plans");
  });

  it("asks its metadata helper only for what that helper takes", () => {
    // This repository's pageMetadata settles the site name from the title and
    // takes no brand; the other one takes one because it serves both domains.
    assert.doesNotMatch(PAGE, /\bbrand,\s*$/m);
    assert.match(PAGE, /BRAND_NAME/);
  });
});

describe("somebody can find it", () => {
  it("is linked from the footer of this site", () => {
    // A page nothing links to is a page nobody reads. It was reachable in the
    // other repository from the footer and the navigation.
    const footer = readFileSync("components/Footer.tsx", "utf8");
    const block = footer.slice(footer.indexOf("const ITINERARIES_LINKS"), footer.indexOf("export default function Footer"));
    assert.match(block, /href: "\/pricing"/);
  });

  it("is in the sitemap", () => {
    assert.match(readFileSync("lib/site-map.ts", "utf8"), /\{ path: "\/pricing"/);
  });
});
