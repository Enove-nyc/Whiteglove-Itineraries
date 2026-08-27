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

describe("the introduction does not promise what the table takes back", () => {
  const PAGE = readFileSync("app/pricing/page.tsx", "utf8");

  /**
   * FOUND BY AN OUTSIDE AUDIT, and it was right. The paragraph above the three
   * cards said everything on the site — "the planner and sharing a trip with
   * anybody you like" — is the same on every plan. Four rows down, the feature
   * table says handing a client their own app is an advisor plan.
   *
   * Both were describing something real: a share link, which every plan has,
   * and companionClients, which One Trip does not. One word covered both, so a
   * buyer read a promise and then found it withdrawn — the worst place on a
   * site for a sentence to be loosely true, because it is the sentence they
   * are deciding on.
   */
  it("does not say sharing a trip is the same on every plan", () => {
    assert.doesNotMatch(
      PAGE,
      /sharing a trip[^.]*same on every plan/,
      "One Trip cannot hand a client an app; companionClients is false for it",
    );
  });

  it("still says what genuinely is the same on every plan", () => {
    // The claim is worth making — it is true of the planner, and it is why
    // One Trip is not a crippled tier. It just has to be the true version.
    assert.match(PAGE, /same on every plan/);
    const limits = readFileSync("lib/account-limits.ts", "utf8");
    assert.match(limits, /one_trip: \{[^}]*companionClients: false/);
    assert.match(limits, /starter: \{[^}]*companionClients: true/);
  });
});
