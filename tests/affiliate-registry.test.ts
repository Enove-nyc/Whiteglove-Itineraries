import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { NO_STAY22 } from "@/lib/stay22";
import {
  allRoutes,
  earningState,
  resolveLink,
  routeFor,
  TRAVEL_PRODUCTS,
  type AffiliateConfig,
} from "@/lib/affiliate/partners";
import { counterKeys, type BookingClick } from "@/lib/affiliate/clicks";
import { goHref, readAffiliateRequest } from "@/lib/affiliate/request";

/**
 * One registry, one redirect, one disclosure.
 *
 * THE FAILURE THIS REPLACES. Every partner URL on this site was built inside
 * the component that showed it — Booking.com in one place, Kayak in two others
 * — so a dropped marker was invisible: the page looked identical whether or
 * not the link earned anything, and car hire went out untagged for months on
 * exactly that basis.
 *
 * So the rules below are about the shape of the system rather than about any
 * one link: nothing builds a partner URL outside the registry, nothing renders
 * a booking button that cannot resolve, and nothing sends somebody to a
 * partner without saying so.
 */

const NOTHING: AffiliateConfig = { travelpayouts: {}, stay22: NO_STAY22 };
const CONNECTED: AffiliateConfig = {
  // A real Travelpayouts link carries the marker AND a u= target, and the
  // target has to be the partner this site's search actually opens — the
  // library refuses a hotels link pointed at Aviasales, and so does the
  // registry. Code defaults are Kayak now; this fixture pins Aviasales /
  // EconomyBookings so the Travelpayouts wrap path stays covered.
  partners: { flights: "aviasales", cars: "economybookings" },
  travelpayouts: {
    hotels: "https://tp.media/r?marker=123456&trs=1&p=4115&u=https%3A%2F%2Fwww.booking.com",
    flights: "https://tp.media/r?marker=123456&trs=1&p=4114&u=https%3A%2F%2Fsearch.aviasales.com",
    cars: "https://tp.media/r?marker=123456&trs=1&p=4113&u=https%3A%2F%2Fwww.economybookings.com",
  },
  stay22: { aid: "whiteglove", provider: "roam" },
};

/** The same account, but with both searches pinned to Kayak instead. */
const ON_KAYAK: AffiliateConfig = {
  partners: { flights: "kayak", cars: "kayak" },
  travelpayouts: {
    flights: "https://tp.media/r?marker=123456&trs=1&p=4114&u=https%3A%2F%2Fwww.kayak.com",
    cars: "https://tp.media/r?marker=123456&trs=1&p=4113&u=https%3A%2F%2Fwww.kayak.com",
  },
  stay22: NO_STAY22,
};

const HOTEL = { product: "hotel" as const, destination: "Rome", checkIn: "2026-07-05", checkOut: "2026-07-12", adults: 2 };

describe("who pays and where the traveler lands", () => {
  it("KEEPS THEM APART", () => {
    // The mistake this type exists to prevent: reading "we have Travelpayouts
    // and Stay22" as "Kayak and Booking.com are not partners". Kayak is where
    // the traveler ARRIVES; Travelpayouts is paid for sending them, and works
    // by wrapping the Kayak URL. Removing Kayak would remove the thing
    // Travelpayouts is paid to forward to.
    const flights = routeFor("flight", CONNECTED);
    assert.equal(flights.destinationLabel, "Aviasales");
    assert.equal(flights.network, "travelpayouts");
    assert.equal(flights.earns, true);

    // WHERE THEY LAND IS A SETTING; who pays is not. Same network, same
    // marker, different destination — which is the distinction this type
    // exists to hold, and the reason a programme can be swapped at all.
    const onKayak = routeFor("flight", ON_KAYAK);
    assert.equal(onKayak.destinationLabel, "Kayak");
    assert.equal(onKayak.network, "travelpayouts");
    assert.equal(onKayak.earns, true);
  });

  it("treats “works but earns nothing” as a state, not a failure", () => {
    // A link that stops working because the money is not configured costs a
    // customer to save a commission. It keeps working and says so instead.
    const flights = routeFor("flight", NOTHING);
    assert.equal(flights.destinationLabel, "Kayak");
    assert.equal(flights.earns, false);
    assert.match(flights.note, /earn nothing/i);
    const link = resolveLink({ product: "flight", from: "JFK", to: "FCO", checkIn: "2027-09-05" }, NOTHING);
    assert.ok(link, "an unconfigured flight search stopped working entirely");
    assert.match(link.url, /kayak\.com\/flights\//i);
  });

  it("sends Kayak flights through Stay22 from the ID, without a pasted wrap or Travelpayouts", () => {
    const viaAid: AffiliateConfig = {
      travelpayouts: {},
      stay22: { aid: "whiteglove", provider: "roam" },
      partners: { flights: "kayak", cars: "kayak" },
    };
    const route = routeFor("flight", viaAid);
    assert.equal(route.earns, true);
    assert.equal(route.network, "stay22");
    assert.equal(route.destinationLabel, "Kayak");
    const resolved = resolveLink(
      { product: "flight", from: "JFK", to: "FCO", checkIn: "2027-09-01", checkOut: "2027-09-08" },
      viaAid,
    );
    assert.ok(resolved);
    const url = new URL(resolved!.url);
    assert.equal(url.host, "www.stay22.com");
    assert.equal(url.pathname, "/allez/kayak");
    assert.equal(url.searchParams.get("aid"), "whiteglove");
    assert.match(url.searchParams.get("link") ?? "", /kayak\.com\/flights\/JFK-FCO\/2027-09-01\/2027-09-08/);
  });

  it("sends Kayak cars through Stay22 from the ID, without a pasted wrap or Travelpayouts", () => {
    const viaAid: AffiliateConfig = {
      travelpayouts: {},
      stay22: { aid: "whiteglove", provider: "roam" },
      partners: { flights: "kayak", cars: "kayak" },
    };
    const route = routeFor("car", viaAid);
    assert.equal(route.earns, true);
    assert.equal(route.network, "stay22");
    assert.equal(route.destinationLabel, "Kayak");
    const resolved = resolveLink(
      { product: "car", destination: "Rome", checkIn: "2027-09-01", checkOut: "2027-09-08" },
      viaAid,
    );
    assert.ok(resolved);
    const url = new URL(resolved!.url);
    assert.equal(url.host, "www.stay22.com");
    assert.equal(url.pathname, "/allez/kayak");
    assert.equal(url.searchParams.get("aid"), "whiteglove");
    assert.match(url.searchParams.get("link") ?? "", /kayak\.com\/cars\/Rome\/2027-09-01\/2027-09-08/);
  });

  it("prefers Stay22 Kayak over a Travelpayouts wrap when the Stay22 ID is set", () => {
    const both: AffiliateConfig = {
      ...ON_KAYAK,
      stay22: { aid: "whiteglove", provider: "roam" },
    };
    const route = routeFor("flight", both);
    assert.equal(route.network, "stay22");
    assert.equal(route.earns, true);
    const resolved = resolveLink(
      { product: "flight", from: "JFK", to: "KRK", checkIn: "2027-09-01" },
      both,
    );
    assert.match(resolved!.url, /^https:\/\/www\.stay22\.com\/allez\/kayak/);
    assert.doesNotMatch(resolved!.url, /tp\.media/);
  });

  it("prefers Stay22 for hotels when it is on, and Booking.com when it is not", () => {
    assert.equal(routeFor("hotel", CONNECTED).destinationLabel, "Stay22");
    assert.match(resolveLink(HOTEL, CONNECTED)!.url, /^https:\/\/www\.stay22\.com\/allez\//);
    const withoutStay22: AffiliateConfig = { ...CONNECTED, stay22: NO_STAY22 };
    assert.equal(routeFor("hotel", withoutStay22).destinationLabel, "Booking.com");
    assert.match(resolveLink(HOTEL, withoutStay22)!.url, /^https:\/\/tp\.media\//);
  });

  it("WRAPS THE SEARCH RATHER THAN REPLACING IT", () => {
    // Travelpayouts carries the real search in ?u=. A wrapper that dropped it
    // would send everybody to a partner home page.
    const url = new URL(resolveLink(HOTEL, { ...CONNECTED, stay22: NO_STAY22 })!.url);
    assert.equal(url.searchParams.get("marker"), "123456");
    assert.match(url.searchParams.get("u") ?? "", /booking\.com\/searchresults/);
  });

  it("carries the dates and the travelers the partner accepts", () => {
    const url = new URL(resolveLink(HOTEL, CONNECTED)!.url);
    assert.equal(url.searchParams.get("checkin"), "2026-07-05");
    assert.equal(url.searchParams.get("checkout"), "2026-07-12");
    assert.equal(url.searchParams.get("adults"), "2");
  });
});

describe("a link that cannot be built is not offered", () => {
  it("REFUSES A PRODUCT WITH NO PROGRAMME JOINED", () => {
    // Activities, insurance, eSIMs, transfers and seasonal programmes are named
    // in the brief and stay dark until a landing URL is pasted. The slot exists
    // so the admin can say so; inventing a link is the one thing that must not happen.
    for (const product of ["activity", "insurance", "esim", "transfer", "programme"] as const) {
      assert.equal(resolveLink({ product, destination: "Rome" }, CONNECTED), null, product);
      assert.equal(routeFor(product, CONNECTED).earns, false, product);
      assert.equal(earningState(routeFor(product, CONNECTED)), "not-offered", product);
    }
  });

  it("RESOLVES A PASTED PROGRAMME LINK the same way as insurance", () => {
    // This is the test that would have caught programme sitting in
    // TRAVEL_PRODUCTS while routeFor always returned none for it.
    const withProgramme: AffiliateConfig = {
      ...CONNECTED,
      essentialsLandings: {
        programme: [{ url: "https://tp.media/r?marker=123456&u=https%3A%2F%2Fexample-programmes.test", label: "Operator" }],
      },
    };
    const route = routeFor("programme", withProgramme);
    assert.equal(route.earns, true);
    assert.equal(earningState(route), "earns");
    const resolved = resolveLink({ product: "programme", destination: "Catskills" }, withProgramme);
    assert.ok(resolved);
    assert.match(resolved!.url, /^https:\/\/tp\.media\//);
  });

  it("KEEPS AN UNTRACKED LANDING LIVE and reports earns-nothing", () => {
    const direct: AffiliateConfig = {
      ...CONNECTED,
      essentialsLandings: {
        insurance: [{ url: "https://example-insurance.test/compare", label: "Insurer" }],
      },
    };
    const route = routeFor("insurance", direct);
    assert.equal(earningState(route), "earns-nothing");
    assert.match(route.note, /earns nothing/i);
    assert.ok(resolveLink({ product: "insurance" }, direct));
  });

  it("refuses a search that is missing what it needs", () => {
    assert.equal(resolveLink({ product: "hotel" }, CONNECTED), null, "a hotel search with nowhere to search");
    assert.equal(resolveLink({ product: "flight", from: "JFK", to: "FCO" }, CONNECTED), null, "a flight with no date");
    assert.equal(resolveLink({ product: "car" }, CONNECTED), null, "car hire with nowhere to collect from");
  });

  it("asks for exactly what the chosen car partner can carry, and no more", () => {
    // WHAT "MISSING" MEANS DEPENDS ON THE PARTNER. Kayak puts both dates in
    // the path, so a dateless search cannot be built for it and is refused.
    // EconomyBookings' documented link format has no date fields at all — the
    // traveller picks them on arrival — so the same search is complete.
    // Refusing it to match Kayak's rule would drop a referral that works.
    const dateless = { product: "car" as const, destination: "Rome" };
    assert.equal(resolveLink(dateless, ON_KAYAK), null, "Kayak needs both dates");
    const viaEconomy = resolveLink(dateless, CONNECTED);
    assert.ok(viaEconomy, "EconomyBookings does not take dates, so this search is not missing anything");
    assert.match(viaEconomy.url, /economybookings\.com/);
  });

  it("honours a product the owner has paused", () => {
    const paused: AffiliateConfig = { ...CONNECTED, paused: ["car"] };
    assert.equal(resolveLink({ product: "car", destination: "Rome", checkIn: "2026-07-05", checkOut: "2026-07-12" }, paused), null);
    assert.match(routeFor("car", paused).note, /paused/i);
  });

  it("REFUSES TO CALL A BROKEN LINK AN EARNING ONE", () => {
    // A link with no marker, or one built for a different programme, opens a
    // working search and earns nothing. Reporting it as earning is the exact
    // blindness this module exists to end.
    const noMarker: AffiliateConfig = { ...NOTHING, travelpayouts: { flights: "https://tp.media/r?u=https%3A%2F%2Fwww.kayak.com" } };
    assert.equal(routeFor("flight", noMarker).earns, false);
    const wrongPartner: AffiliateConfig = {
      ...NOTHING,
      travelpayouts: { hotels: "https://tp.media/r?marker=123456&u=https%3A%2F%2Fwww.kayak.com" },
    };
    assert.equal(routeFor("hotel", wrongPartner).earns, false);
  });

  it("reports every product's state for the admin", () => {
    const routes = allRoutes(CONNECTED);
    assert.equal(routes.length, TRAVEL_PRODUCTS.length);
    assert.equal(routes.filter((route) => route.earns).length, 3, "hotels, flights and cars earn; the rest are not joined");
  });
});

describe("the /go redirect", () => {
  it("TAKES NO DESTINATION URL — there is no open redirect", () => {
    // /go accepts a product and a place, never an address. Nothing a stranger
    // types into the query string can make this site forward to theirs.
    const source = readFileSync("app/go/route.ts", "utf8");
    assert.doesNotMatch(source, /searchParams\.get\("(url|u|href|redirect|next|to_url)"\)/);
    const parsed = readAffiliateRequest(new URLSearchParams("product=hotel&destination=Rome&url=https://evil.example"));
    assert.ok(parsed);
    assert.equal(Object.values(parsed).some((value) => String(value).includes("evil.example")), false);
  });

  it("records the click before it redirects", () => {
    // A click written after the 302 is a click that is often never written.
    const source = readFileSync("app/go/route.ts", "utf8");
    const recordAt = source.indexOf("await recordClick");
    const redirectAt = source.indexOf("NextResponse.redirect(resolved.url");
    assert.ok(recordAt > 0 && redirectAt > recordAt, "the redirect happens before the click is recorded");
  });

  it("round-trips a request through the query string", () => {
    const request = { ...HOTEL, destinationSlug: "rome", placement: "destination-sticky", page: "/vacation-ideas/rome" };
    const parsed = readAffiliateRequest(new URLSearchParams(goHref(request).split("?")[1]));
    assert.equal(parsed?.product, "hotel");
    assert.equal(parsed?.destination, "Rome");
    assert.equal(parsed?.destinationSlug, "rome");
    assert.equal(parsed?.checkIn, "2026-07-05");
    assert.equal(parsed?.placement, "destination-sticky");
  });

  it("throws away anything that is not the shape it expects", () => {
    assert.equal(readAffiliateRequest(new URLSearchParams("product=nonsense")), null);
    assert.equal(readAffiliateRequest(new URLSearchParams("product=hotel&in=sometime"))?.checkIn, "");
    assert.equal(readAffiliateRequest(new URLSearchParams("product=hotel&adults=-4"))?.adults, undefined);
    assert.equal(readAffiliateRequest(new URLSearchParams("product=hotel&slug=<script>"))?.destinationSlug, "script");
  });
});

describe("what a click records", () => {
  const click: BookingClick = {
    id: "c1",
    at: "2026-08-09T12:00:00.000Z",
    product: "hotel",
    network: "stay22",
    destinationLabel: "Stay22",
    earns: true,
    destinationSlug: "rome",
    page: "/vacation-ideas/rome",
    placement: "destination-sticky",
    campaignId: "",
    checkIn: "2026-07-05",
    checkOut: "2026-07-12",
    adults: 2,
    children: 3,
    rooms: 1,
    session: "abc123",
    device: "mobile",
  };

  it("HAS NOWHERE TO PUT A RELIGIOUS PREFERENCE", () => {
    // Written as a type rather than as a convention, because a field for it
    // would eventually be filled. Kosher standards and Shabbos requirements
    // are collected to do the job the visitor asked for, and they are not an
    // advertising profile.
    const fields = Object.keys(click);
    for (const forbidden of ["kosher", "shabbos", "kashrus", "heritage", "religion", "observance"]) {
      assert.equal(fields.some((field) => field.toLowerCase().includes(forbidden)), false, `the click record carries ${forbidden}`);
    }
    const source = readFileSync("lib/affiliate/clicks.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(source, /kosher|shabbos|kashrus/i);
  });

  it("counts what the reports are built from", () => {
    const keys = counterKeys(click);
    for (const expected of ["product:hotel", "network:stay22", "destination:rome", "placement:destination-sticky", "device:mobile", "earning:yes"]) {
      assert.ok(keys.includes(expected), expected);
    }
    // An unearning click is counted too — "how many trips did we give away"
    // is the number that pays for connecting a partner.
    assert.ok(counterKeys({ ...click, earns: false }).includes("earning:no"));
  });
});

describe("the disclosure", () => {
  it("IS ONE EDITABLE LINE, BESIDE THE ACTION", () => {
    const component = readFileSync("components/BookingLink.tsx", "utf8");
    assert.match(component, /words\.affiliateDisclosure/);
    // Not the footer, and not a hardcoded sentence in nine components.
    assert.doesNotMatch(component, /may earn a commission/i);
  });

  it("warns that the link leaves, without naming who it leaves to", () => {
    // The name came out on the owner's decision; the warning did not go with
    // it. A link that opens a window unannounced is an accessibility failure
    // whoever it points at. See hotelButtonLabel in lib/stay22.ts.
    const component = readFileSync("components/BookingLink.tsx", "utf8");
    assert.match(component, /Opens in a new tab/);
    assert.match(component, /rel="sponsored noopener noreferrer"/);
  });

  it("keeps the partner's name out of what the visitor reads", () => {
    for (const file of ["components/BookingLink.tsx", "components/PartnerSearchForm.tsx"]) {
      const component = readFileSync(file, "utf8");
      // The rendered warning is the risk: `{where}` / `{route.destinationLabel}`
      // is how the brand used to reach the page.
      assert.doesNotMatch(component, /Opens \{where\}/, file);
      assert.doesNotMatch(component, /Opens \{route\.destinationLabel\}/, file);
    }
  });

  it("never renders the partner URL into the page", () => {
    const component = readFileSync("components/BookingLink.tsx", "utf8");
    assert.match(component, /href=\{goHref\(request\)\}/);
    assert.doesNotMatch(component, /resolved\.url/);
  });
});
