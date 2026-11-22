import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { describeFlights, describeHotels, duffelReady, flightsVia, hotelsVia, publicFlightsVia, publicHotelsVia } from "@/lib/booking-partners";
import { inspectDuffelToken } from "@/lib/duffel-token";

/**
 * Who runs a search on /book.
 *
 * HAVING A TOKEN IS NOT A DECISION, and neither is DUFFEL_FLIGHTS=1. Duffel
 * takes a card and issues a ticket. The flow is restricted to admin and invited guests. These tests hold
 * that no configuration can put it on the public site.
 */

describe("Duffel is off the public site", () => {
  it("CANNOT BE ROUTED TO FROM A PUBLIC PAGE, by any configuration", () => {
    assert.equal(publicFlightsVia(), "kayak");
    assert.equal(publicHotelsVia(), "booking");
    assert.equal(publicFlightsVia.length, 0, "the public router reads configuration");
    assert.equal(publicHotelsVia.length, 0, "the public router reads configuration");
  });

  it("still tells the admin whether a real token is connected", () => {
    assert.equal(duffelReady({ DUFFEL_ACCESS_TOKEN: "duffel_test_abc" }), true);
    assert.equal(duffelReady({ DUFFEL_ACCESS_TOKEN: "duffel_live_abc" }), true);
    assert.equal(duffelReady({}), false);
    assert.equal(duffelReady({ DUFFEL_ACCESS_TOKEN: "   " }), false);
    assert.equal(duffelReady({ DUFFEL_ACCESS_TOKEN: "DUFFEL_ACCESS_TOKEN" }), false);
  });

  it("is reachable from the public booking page nowhere at all", () => {
    const book = readFileSync("app/book/page.tsx", "utf8");
    const partners = readFileSync("components/BookPartners.tsx", "utf8");
    assert.doesNotMatch(book, /flightsVia|hotelsVia|BookingSearch|FlightReview|@duffel/);
    assert.doesNotMatch(partners, /BookingSearch|FlightReview|@duffel/);
  });

  it("is listed in the admin Settings nav and uses the admin search tools", () => {
    const nav = readFileSync("lib/admin-nav.ts", "utf8");
    assert.match(nav, /href: "\/admin\/duffel"/);
    const page = readFileSync("app/admin/duffel/page.tsx", "utf8");
    assert.match(page, /AdminDuffelTools/);
    const layout = readFileSync("app/admin/duffel/layout.tsx", "utf8");
    assert.match(layout, /area="money"/);
  });

  it("guards its endpoints rather than only hiding the buttons", () => {
    for (const route of [
      "app/api/flights/search/route.ts",
      "app/api/flights/book/route.ts",
      "app/api/hotels/search/route.ts",
      "app/api/duffel/component-key/route.ts",
    ]) {
      const source = readFileSync(route, "utf8");
      const guard = route.includes("/hotels/") ? /duffelRefusal\(request\)/ : /duffelRefusal\(request, \{ privateBooking: true \}\)/;
      assert.match(source, guard, route);
      assert.match(readFileSync(route, "utf8"), /duffelBearer\(\)/, route);
    }
  });
});

describe("a leftover flag cannot move visitor bookings onto Duffel", () => {
  it("stays on the partner when nothing is set", () => {
    assert.equal(flightsVia({}), "kayak");
    assert.equal(hotelsVia({}), "booking");
  });

  it("stays on the partner when a token is present", () => {
    assert.equal(flightsVia({ DUFFEL_ACCESS_TOKEN: "duffel_test_abc" }), "kayak");
    assert.equal(hotelsVia({ DUFFEL_ACCESS_TOKEN: "duffel_test_abc" }), "booking");
  });

  it("stays on the partner even when both old flags are set", () => {
    assert.equal(flightsVia({ DUFFEL_ACCESS_TOKEN: "duffel_test_abc", DUFFEL_FLIGHTS: "1" }), "kayak");
    assert.equal(hotelsVia({ DUFFEL_ACCESS_TOKEN: "duffel_test_abc", DUFFEL_STAYS: "1" }), "booking");
  });
});

describe("what the admin is told", () => {
  it("says visitors stay on partners and Duffel stays in admin", () => {
    assert.match(describeFlights("kayak"), /\/book/);
    assert.match(describeFlights("kayak"), /admin\/duffel/);
    assert.doesNotMatch(describeFlights("kayak"), /DUFFEL_FLIGHTS=1/);
    assert.match(describeHotels("booking"), /\/book/);
    assert.match(describeHotels("booking"), /admin\/duffel/);
    assert.doesNotMatch(describeHotels("booking"), /DUFFEL_STAYS=1/);
  });
});

describe("placeholder tokens are not treated as connected", () => {
  it("rejects the variable name pasted as the value", () => {
    assert.equal(inspectDuffelToken("DUFFEL_ACCESS_TOKEN").kind, "placeholder");
    assert.equal(inspectDuffelToken("DUFFEL_ACCESS_TOKEN").ready, false);
  });

  it("accepts Duffel's own prefixes", () => {
    assert.equal(inspectDuffelToken("duffel_test_abc123").kind, "test");
    assert.equal(inspectDuffelToken("duffel_live_abc123").kind, "live");
  });
});

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(tsx|ts)$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe("visitor-facing app code does not import Duffel UI", () => {
  it("keeps BookingSearch, FlightReview and @duffel/components off public pages", () => {
    const files = walk("app").filter((file) => !file.includes(`${join("app", "admin")}`) && !file.includes(`${join("app", "api")}`) && !file.startsWith(join("app", "private-booking") + "/"));
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /BookingSearch/, file);
      assert.doesNotMatch(source, /FlightReview/, file);
      assert.doesNotMatch(source, /@duffel/, file);
    }
  });
});
