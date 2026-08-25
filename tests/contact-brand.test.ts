import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { BUILT_IN_WORDS } from "@/data/site-words";
import { BRAND_REASONS, CONTACT_REASONS, readReasonForBrand, reasonsForBrand } from "@/lib/contact-reasons";
import { CANONICAL_ORIGIN } from "@/lib/canonical-origin";
import { BRAND_CONTACT_EMAIL } from "@/lib/site-brand-core";
import { contactEmailFor } from "@/lib/site-words";

/**
 * Who a visitor is told to write to, and what about.
 *
 * THE COMPLAINT THIS ANSWERS, in the owner's words: "all the email are still
 * @whiteglovekoshertravel". Somebody on whitegloveitineraries.com opened
 * Contact, About, Terms or Privacy and was handed an address at the other
 * company's domain — the one place on a page where a visitor is deciding
 * whether the business is who it says it is.
 *
 * AND WHAT IT WAS OFFERING TO DO. Two of the four errands are about a
 * directory that only exists on the kosher site: correcting a listing's
 * address or hechsher, and buying a place in it. Offering them here invites a
 * message nobody can act on, and names kosher listings to somebody who came
 * for an itinerary tool.
 */

describe("the address a visitor is given belongs to the site they are on", () => {
  it("hands each brand its own", () => {
    assert.equal(contactEmailFor("kosher"), BRAND_CONTACT_EMAIL.kosher);
    assert.equal(contactEmailFor("itineraries"), BRAND_CONTACT_EMAIL.itineraries);
    assert.notEqual(BRAND_CONTACT_EMAIL.kosher, BRAND_CONTACT_EMAIL.itineraries);
  });

  it("never gives one brand the other brand's domain", () => {
    assert.ok(BRAND_CONTACT_EMAIL.itineraries.endsWith("@whitegloveitineraries.com"));
    assert.ok(BRAND_CONTACT_EMAIL.kosher.endsWith("@whiteglovekoshertravel.com"));
  });

  it("keeps an address the owner typed himself, on both sites", () => {
    // His edit is a decision; the built-in one never was. If he sets one
    // address in /admin/settings/words it is the address, everywhere.
    const his = { ...BUILT_IN_WORDS, contactEmail: "hello@example.com" };
    assert.equal(contactEmailFor("kosher", his), "hello@example.com");
    assert.equal(contactEmailFor("itineraries", his), "hello@example.com");
  });

  it("moves the built-in one, which was never a decision about either brand", () => {
    assert.equal(contactEmailFor("itineraries", BUILT_IN_WORDS), BRAND_CONTACT_EMAIL.itineraries);
  });

  it("matches the inbox the form already routes to", () => {
    // lib/email.ts has split the DELIVERY for a while; the page went on
    // printing the kosher address. These are the same two addresses, and a
    // page that shows one while the form posts to another is a broken promise.
    const email = readFileSync("lib/email.ts", "utf8");
    assert.ok(email.includes(BRAND_CONTACT_EMAIL.itineraries));
    assert.ok(email.includes(BRAND_CONTACT_EMAIL.kosher));
  });
});

describe("the errands offered are the ones this site can do", () => {
  it("drops the two that need a directory", () => {
    const offered = reasonsForBrand("itineraries").map((r) => r.value);
    assert.deepEqual(offered, ["fault", "question"]);
    assert.ok(!offered.includes("correction"));
    assert.ok(!offered.includes("advertise"));
  });

  it("leaves the kosher site with all four", () => {
    assert.equal(reasonsForBrand("kosher").length, CONTACT_REASONS.length);
  });

  it("names only reasons that exist", () => {
    for (const list of Object.values(BRAND_REASONS)) {
      for (const value of list) {
        assert.ok(CONTACT_REASONS.some((r) => r.value === value), `${value} is not a reason`);
      }
    }
  });

  it("refuses a reason arriving by link that the page would not offer", () => {
    // /contact?reason=advertise can be sent, bookmarked and indexed. Filtering
    // the buttons alone leaves the form one address away.
    assert.equal(readReasonForBrand("advertise", "itineraries"), "");
    assert.equal(readReasonForBrand("correction", "itineraries"), "");
    assert.equal(readReasonForBrand("fault", "itineraries"), "fault");
    assert.equal(readReasonForBrand("advertise", "kosher"), "advertise");
    assert.equal(readReasonForBrand("nonsense", "itineraries"), "");
  });
});

describe("the pages read the brand rather than the built-in words", () => {
  for (const page of ["app/contact/page.tsx", "app/about/page.tsx", "app/terms/page.tsx", "app/privacy/page.tsx"]) {
    it(`${page} asks contactEmailFor`, () => {
      const source = readFileSync(page, "utf8");
      assert.ok(source.includes("contactEmailFor("), `${page} does not resolve the address by brand`);
      assert.ok(
        !/words\.contactEmail|\{\s*contactEmail\s*\}\s*=\s*(await\s*)?readWords/.test(source),
        `${page} still reads the built-in address straight out of the words`,
      );
    });
  }

  it("does not put the other brand's name in the contact tab title", () => {
    // resolvePage hands back the BUILT-IN page when the owner has not edited
    // it, and that page's seoTitle says White Glove Kosher Travel. Reading it
    // unconditionally put the wrong company in the tab and the link preview.
    const source = readFileSync("app/contact/page.tsx", "utf8");
    assert.ok(!source.includes("page?.seoTitle"), "the unedited built-in title is being used again");
    assert.ok(source.includes("page?.edited"));
  });
});

/**
 * What a phone writes under the icon, and what a page falls back to saying.
 *
 * app/manifest.ts already answered "White Glove Itineraries" on this domain
 * while the root layout's applicationName — three files away, and the one the
 * browser actually reads on the page — said White Glove Kosher Travel. The
 * install named one brand and the page named the other.
 */
describe("the root layout names the brand this build serves", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");

  it("takes its name and description from the brand, not a literal", () => {
    assert.ok(layout.includes("applicationName: BRAND_NAME[BRAND]"));
    assert.ok(layout.includes("title: BRAND_NAME[BRAND]"));
    assert.ok(layout.includes("description: BRAND_DESCRIPTION[BRAND]"));
    assert.ok(!/applicationName: "White Glove/.test(layout));
  });

  it("settles it at build time, because a module constant cannot read a request", () => {
    // The manifest route can and does pay for a request-time read. This object
    // is inherited by every page and has no request to read.
    assert.ok(layout.includes("configuredBrand()"));
    assert.ok(!layout.includes("await currentBrand()"));
  });
});

/**
 * The address this build prints when nothing has told it otherwise.
 *
 * siteOrigin() wins wherever NEXT_PUBLIC_SITE_URL is set, so this reads as a
 * harmless fallback — except two callers use it directly, and both put a URL in
 * front of a person: the admin shell's link back to the site, and the share
 * link beside a flight itinerary, which is an address handed to a traveller.
 * Both were naming the site this one was forked from.
 */
describe("the fallback origin is this deployment's own", () => {
  it("names the domain this service actually serves", () => {
    assert.equal(CANONICAL_ORIGIN, "https://www.whitegloveitineraries.com");
  });

  it("is what the two direct callers print", () => {
    for (const file of ["components/AdminShell.tsx", "app/admin/flight-itineraries/page.tsx"]) {
      const source = readFileSync(file, "utf8");
      assert.ok(source.includes("CANONICAL_ORIGIN"), `${file} no longer reads it`);
      assert.ok(!source.includes("whiteglovekoshertravel"), `${file} names the other domain outright`);
    }
  });
});
