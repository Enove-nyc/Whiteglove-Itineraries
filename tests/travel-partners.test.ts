import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aviasalesHomeUrl,
  aviasalesResultsUrl,
  carUrl,
  DEFAULT_PARTNERS,
  flightUrl,
  hostBelongsTo,
  isPartnerKey,
  partnerFor,
  partnersFor,
  TRAVEL_PARTNERS,
} from "@/lib/travel-partners";
import { isAviasalesHref } from "@/lib/flight-book-href";

/**
 * Which partner each search opens.
 *
 * WHY THIS MODULE IS WORTH TESTING HARD. Kayak was typed into the site as a
 * fact, and the account was approved for Aviasales, Kiwi and EconomyBookings
 * but not Kayak — so every programme the owner could actually earn from was
 * refused by his own settings screen, and the answer looked like "wait for
 * Kayak" when the real answer was "stop hard-coding Kayak".
 *
 * Everything here fails silently in production. A wrong deep link does not
 * throw: it opens the partner's front page instead of the traveller's search,
 * they search again by hand, and the referral is lost with nothing reporting a
 * fault. So the assertions are about the exact address.
 */

const flights = (key: string) => TRAVEL_PARTNERS.find((p) => p.slot === "flights" && p.key === key)!;
const cars = (key: string) => TRAVEL_PARTNERS.find((p) => p.slot === "cars" && p.key === key)!;

const journey = {
  shape: { trip: "one-way" as const, legs: [{ from: "JFK", to: "KRK", date: "2027-09-01" }] as [{ from: string; to: string; date: string }] },
};
const roundTrip = {
  shape: {
    trip: "round-trip" as const,
    legs: [{ from: "JFK", to: "KRK", date: "2027-09-01" }] as [{ from: string; to: string; date: string }],
    ret: "2027-09-08",
  },
};

describe("the default partner is Kayak, which works and can earn via Stay22", () => {
  it("defaults flights and cars to Kayak", () => {
    // EconomyBookings carries no dates. Kayak via Stay22 was traced live with
    // route and dates intact. A link may still name Aviasales for one press.
    assert.equal(DEFAULT_PARTNERS.flights, "kayak");
    assert.equal(DEFAULT_PARTNERS.cars, "kayak");
  });

  it("falls back rather than throwing on a choice that makes no sense", () => {
    // A stale key from an older release, or hotels somehow set to a flight
    // partner. A settings screen must not be able to take the searches down.
    assert.equal(partnerFor("flights", { flights: "economybookings" }).key, "kayak");
    assert.equal(partnerFor("flights", undefined).key, "kayak");
    assert.equal(partnerFor("cars", {}).key, "kayak");
  });

  it("honours a choice that does make sense", () => {
    assert.equal(partnerFor("flights", { flights: "kiwi" }).key, "kiwi");
    assert.equal(partnerFor("flights", { flights: "kayak" }).key, "kayak");
    assert.equal(partnerFor("cars", { cars: "kayak" }).key, "kayak");
  });

  it("offers Kayak in the list, so switching is a dropdown rather than a deploy", () => {
    assert.ok(partnersFor("flights").some((p) => p.key === "kayak"));
    assert.ok(partnersFor("cars").some((p) => p.key === "kayak"));
  });

  it("knows a real key from a typed one", () => {
    assert.equal(isPartnerKey("aviasales"), true);
    assert.equal(isPartnerKey("expedia"), false);
    assert.equal(isPartnerKey(undefined), false);
  });
});

describe("the flight address", () => {
  /**
   * THE DOCUMENTED AVIASALES DEEP LINK DOES NOT WORK, which is why none of
   * these assertions is about it. Requested live with a route, dates and a
   * marker, `search.aviasales.com/flights/?origin_iata=…` answers 302 to
   * `aviasales.ru/?refhost=search.aviasales.com` and all three are discarded.
   * What is asserted instead is the `/search/` path Travelpayouts' own Data API
   * hands back for a fare, which answers 200 and keeps the marker.
   */
  it("lands on the Aviasales results list for the route and the date", () => {
    const url = new URL(flightUrl(flights("aviasales"), journey)!);
    assert.equal(url.host, "www.aviasales.com");
    // JFK, 01 September, KRK, one passenger.
    assert.equal(url.pathname, "/search/JFK0109KRK1");
    assert.notEqual(url.host, "search.aviasales.com");
  });

  it("carries the return date, as the second day-and-month pair", () => {
    const url = new URL(flightUrl(flights("aviasales"), roundTrip)!);
    assert.equal(url.pathname, "/search/JFK0109KRK08091");
  });

  it("does not send a return date on a one-way, which would book the wrong trip", () => {
    const url = new URL(flightUrl(flights("aviasales"), journey)!);
    assert.equal(url.pathname, "/search/JFK0109KRK1");
  });

  it("carries the marker it is given, and nothing when it is given nothing", () => {
    // The commission is the marker on this address. Passed in from the config
    // rather than read here, so there is no second place a number could rot.
    const marked = new URL(flightUrl(flights("aviasales"), { ...journey, marker: "761677" })!);
    assert.equal(marked.searchParams.get("marker"), "761677");
    assert.equal(marked.pathname, "/search/JFK0109KRK1");
    assert.equal(new URL(flightUrl(flights("aviasales"), journey)!).searchParams.has("marker"), false);
    // A script tag or a stray word pasted where the number goes is not written
    // on to a traveller's link.
    assert.equal(new URL(flightUrl(flights("aviasales"), { ...journey, marker: "<script>" })!).searchParams.has("marker"), false);
  });

  it("defaults to one passenger rather than inventing a party", () => {
    assert.equal(new URL(flightUrl(flights("aviasales"), journey)!).pathname, "/search/JFK0109KRK1");
    assert.equal(new URL(flightUrl(flights("aviasales"), { ...journey, adults: 3 })!).pathname, "/search/JFK0109KRK3");
    // One digit is all the path holds, so a coach party is capped rather than
    // written as two characters the parser would read as part of a date.
    assert.equal(new URL(flightUrl(flights("aviasales"), { ...journey, adults: 14 })!).pathname, "/search/JFK0109KRK9");
  });

  it("hands out an address the priced-fare allowlist already trusts", () => {
    // One list, in lib/flight-book-href.ts. A search link the browser would
    // refuse to paint a price on is a link built on the wrong host.
    assert.equal(isAviasalesHref(flightUrl(flights("aviasales"), journey)!), true);
    assert.equal(isAviasalesHref(aviasalesHomeUrl("761677")), true);
    assert.equal(new URL(aviasalesHomeUrl("761677")).searchParams.get("marker"), "761677");
  });

  it("refuses to build a results path out of a broken date", () => {
    assert.equal(aviasalesResultsUrl({ from: "JFK", to: "KRK", depart: "soon" }), null);
    assert.equal(aviasalesResultsUrl({ from: "New York", to: "KRK", depart: "2027-09-01" }), null);
  });

  it("builds Kiwi on its own host, with the path joined properly", () => {
    const url = new URL(flightUrl(flights("kiwi"), roundTrip)!);
    assert.equal(url.host, "www.kiwi.com");
    // The bug this caught: filtering a leading "" out of the parts produced
    // "www.kiwi.comsearch/results", a host that does not exist.
    assert.equal(url.pathname, "/search/results/JFK/KRK/2027-09-01/2027-09-08");
  });

  it("sends Aviasales and Kiwi the first leg of a multi-city, which is what they accept", () => {
    const multi = {
      shape: {
        trip: "multi-city" as const,
        legs: [
          { from: "JFK", to: "KRK", date: "2027-09-01" },
          { from: "KRK", to: "FCO", date: "2027-09-05" },
        ],
      },
    };
    const aviasales = new URL(flightUrl(flights("aviasales"), multi)!);
    // The first leg, one-way. Not the first leg with the second leg's date
    // stuck on the end of it, which would be a different journey entirely.
    assert.equal(aviasales.pathname, "/search/JFK0109KRK1");
    const kiwi = new URL(flightUrl(flights("kiwi"), multi)!);
    assert.match(kiwi.pathname, /\/search\/results\/JFK\/KRK\/2027-09-01$/);
    assert.doesNotMatch(kiwi.pathname, /FCO/);
  });

  it("refuses a journey with a piece missing", () => {
    const noDate = { shape: { trip: "one-way" as const, legs: [{ from: "JFK", to: "KRK", date: "" }] as [{ from: string; to: string; date: string }] } };
    assert.equal(flightUrl(flights("aviasales"), noDate), null);
    const noTo = { shape: { trip: "one-way" as const, legs: [{ from: "JFK", to: "", date: "2027-09-01" }] as [{ from: string; to: string; date: string }] } };
    assert.equal(flightUrl(flights("aviasales"), noTo), null);
  });

  it("leaves Kayak to its own builder, which handles multi-city", () => {
    // Null here is not a refusal — lib/kayak-search.ts builds it. The callers
    // check the key before asking.
    assert.equal(flightUrl(flights("kayak"), journey), null);
  });
});

describe("the car address", () => {
  it("sends a city as a name and an airport as a code", () => {
    const city = new URL(carUrl(cars("economybookings"), { where: "Krakow" })!);
    assert.equal(city.host, "www.economybookings.com");
    assert.equal(city.searchParams.get("idpick"), "Krakow");
    const airport = new URL(carUrl(cars("economybookings"), { where: "KRK" })!);
    assert.equal(airport.searchParams.get("idpickval"), "KRK");
    assert.equal(airport.searchParams.has("idpick"), false);
  });

  it("INVENTS NO DATE PARAMETERS for a partner whose format has none", () => {
    // The temptation is a date_from= because every other partner has one. It
    // would look right, open, and drop the dates in silence.
    const url = new URL(carUrl(cars("economybookings"), { where: "Krakow", pickup: "2027-09-01", dropoff: "2027-09-05" })!);
    assert.equal(url.searchParams.has("date_from"), false);
    assert.doesNotMatch(url.search, /2027-09-01/);
  });

  it("still needs both dates for Kayak, which puts them in the path", () => {
    assert.equal(carUrl(cars("kayak"), { where: "Krakow" }), null);
    const url = carUrl(cars("kayak"), { where: "Krakow", pickup: "2027-09-01", dropoff: "2027-09-05" })!;
    assert.equal(url, "https://www.kayak.com/cars/Krakow/2027-09-01/2027-09-05");
  });

  it("refuses a pick-up nobody named", () => {
    assert.equal(carUrl(cars("economybookings"), { where: "  " }), null);
  });

  it("encodes a place with a space in it", () => {
    const url = carUrl(cars("kayak"), { where: "Tel Aviv", pickup: "2027-09-01", dropoff: "2027-09-05" })!;
    assert.doesNotMatch(new URL(url).pathname, / /);
  });
});

describe("matching a pasted link's destination to the partner", () => {
  it("accepts the subdomain the search is actually built on", () => {
    // Aviasales searches are built on search.aviasales.com while a generated
    // link may forward to aviasales.com. Same programme, same money — refusing
    // one would be a false alarm the owner cannot act on.
    assert.equal(hostBelongsTo("search.aviasales.com", "aviasales.com"), true);
    assert.equal(hostBelongsTo("aviasales.com", "aviasales.com"), true);
    assert.equal(hostBelongsTo("www.economybookings.com", "economybookings.com"), true);
  });

  it("does not accept a different partner that merely ends the same way", () => {
    assert.equal(hostBelongsTo("www.kayak.com", "aviasales.com"), false);
    assert.equal(hostBelongsTo("notaviasales.com", "aviasales.com"), false);
  });
});

describe("DiscoverCars", () => {
  const partner = TRAVEL_PARTNERS.find((p) => p.key === "discovercars")!;

  it("OPENS THE CITY'S OWN PAGE where one was checked", () => {
    // Every slug in the table was fetched and answered 200. They cannot be
    // derived: Italy is italy-mainland, the Czech Republic is czech-republic
    // (czechia 404s), and Kraków is krakow (cracow 404s).
    assert.equal(carUrl(partner, { where: "Rome" }), "https://www.discovercars.com/italy-mainland/rome");
    assert.equal(carUrl(partner, { where: "Prague" }), "https://www.discovercars.com/czech-republic/prague");
    assert.equal(carUrl(partner, { where: "Kraków" }), "https://www.discovercars.com/poland/krakow");
    // Accents and case are normalised away rather than being separate rows.
    assert.equal(carUrl(partner, { where: "KRAKOW" }), carUrl(partner, { where: "Kraków" }));
    assert.equal(carUrl(partner, { where: "Zell am See" }), "https://www.discovercars.com/austria/zell-am-see");
  });

  it("FALLS BACK TO THE FRONT PAGE rather than guessing a slug", () => {
    // Grindelwald has no DiscoverCars page — checked, 404. A slug invented from
    // the country name would 404 too, and a 404 costs the traveller, not just
    // the commission. Their front page still earns.
    assert.equal(carUrl(partner, { where: "Grindelwald" }), "https://www.discovercars.com/");
    assert.equal(carUrl(partner, { where: "Somewhere We Have Never Heard Of" }), "https://www.discovercars.com/");
  });

  it("is a car partner the owner can actually choose", () => {
    assert.equal(partner.slot, "cars");
    assert.ok(partnersFor("cars").some((p) => p.key === "discovercars"));
    // And a pasted link is checked against it, so a DiscoverCars link on the
    // cars row is accepted only while DiscoverCars is the chosen partner.
    assert.equal(partner.domain, "discovercars.com");
  });
});
