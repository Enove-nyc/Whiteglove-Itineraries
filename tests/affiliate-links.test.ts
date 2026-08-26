import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resolveLink } from "@/lib/affiliate/partners";
import { goHref, readAffiliateRequest } from "@/lib/affiliate/request";
import { airportCode } from "@/lib/kayak-search";
import { isAviasalesHref } from "@/lib/flight-book-href";
import { NO_STAY22 } from "@/lib/stay22";

/**
 * Every link that leaves this site for a booking partner is built on the
 * server, from one registry, and carries whatever the owner has configured.
 *
 * THIS EXISTS BECAUSE CAR HIRE NEVER DID. Flights and hotels each tagged their
 * outgoing link; the cars form was not even passed the keys, so every car
 * search opened on Kayak untagged and earned nothing — no matter what was
 * configured, and with the page looking identical either way. The connections
 * screen meanwhile promised KAYAK_AFFILIATE_PARAMS covered "the flight AND CAR
 * searches", which was a promise the code did not keep.
 *
 * An untagged partner link is the one kind of bug that costs money on every
 * single use and can never be seen.
 *
 * WHAT THESE ASSERTIONS NOW GUARD, AND WHY IT CHANGED. They used to check that
 * each openPartner() call in the booking page was handed the marker. That was
 * the right check for a page that built partner URLs in the browser — and
 * building them in the browser was itself the problem: the page had to be
 * given the Stay22 ID, the Travelpayouts marker and the Booking.com affiliate
 * ID in order to do it, and a client component's props are serialised into the
 * page. All of it was readable in view-source.
 *
 * So the booking page no longer knows any of it. It sends what the traveller
 * typed to /go, which resolves the partner on the server. The guarantee is
 * stronger than the one it replaces — there is no longer a way to write an
 * untagged link here, because there is no longer a way to write a partner link
 * here at all — and these hold it in place.
 */

const SOURCE = readFileSync("components/BookPartners.tsx", "utf8");
const PAGE = readFileSync("app/book/page.tsx", "utf8");

/**
 * The component without its imports or its comments.
 *
 * `import { hotelButtonLabel } from "@/lib/stay22"` is a piece of wording, not
 * an account number, and the comments below explain at length what used to be
 * here — both would trip a search for the names of the things that leaked.
 * What matters is whether the VALUES are in the component's own code.
 */
const CODE = SOURCE.replace(/^import .*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("the booking page cannot leak an account number", () => {
  it("is not handed one", () => {
    // THE ONE THAT MATTERS NOW. Each of these was measured in the built page's
    // source before this changed — the marker, the Booking.com ID and the
    // Kayak params were all there in plain text.
    for (const secret of ["bookingAid", "kayakParams", "travelpayoutsMarker", "stay22Settings", "travelpayouts"]) {
      assert.doesNotMatch(CODE, new RegExp(`\\b${secret}\\b`),
        `${secret} is back in the booking component, and so back in the page source`);
    }
  });

  it("the page does not read the stores in order to pass them down", () => {
    assert.doesNotMatch(PAGE, /readStay22|readTravelpayouts/, "the booking page is reading affiliate config again");
    assert.doesNotMatch(PAGE, /BOOKING_AFFILIATE_ID|KAYAK_AFFILIATE_PARAMS|TRAVELPAYOUTS_MARKER/);
    assert.doesNotMatch(PAGE, /<BookPartners[^>]*affiliate=/);
  });

  it("names no partner address at all", () => {
    // The searches used to be typed into this component as kayak.com and
    // booking.com URLs, which is what made the partner unchangeable AND what
    // required the keys to be here. Button labels may name a partner; hosts
    // in the page source may not.
    for (const host of ["kayak.com", "booking.com", "stay22.com", "aviasales.com", "tp.media"]) {
      assert.doesNotMatch(CODE, new RegExp(host.replace(".", "\\.")), `${host} is being built by hand again`);
    }
  });
});

describe("no hand-off goes out unnamed", () => {
  it("every one says which product it is, so /go can route it", () => {
    // A hand-off with no product is one /go refuses outright — the same
    // silence as the untagged car link, one layer along.
    const unnamed: string[] = [];
    for (const match of SOURCE.matchAll(/(\w*\s*)openPartner\(([\s\S]{0,400}?)\);/g)) {
      // The helper's own definition is not a call.
      if (match[1].trim() === "function") continue;
      const call = match[2];
      if (/product: "(flight|hotel|car)"/.test(call)) continue;
      unnamed.push(call.replace(/\s+/g, " ").slice(0, 70));
    }
    assert.deepEqual(unnamed, [], `a hand-off /go cannot route: ${unnamed.join(" | ")}`);
  });

  it("hotels hand off on-site; both cash flight buttons go through /go; cars show our own prices", () => {
    // Hotels show Stay22 results on this site, then /go. Flights keep one White
    // Glove form and BOTH of its buttons name their partner to /go, which is
    // the only way two peer buttons can open two different partners without a
    // partner address being written here.
    // THE CARS TAB NO LONGER EMBEDS A PARTNER. Its Localrent panel carried a
    // thin, fixed set of cars and sat under White Glove's own live prices,
    // which are wider and real — a second, worse answer under the first one.
    // The embed route and its helper still exist; this panel does not use them.
    assert.match(SOURCE, /product: "hotel"/);
    assert.match(SOURCE, /product: "flight"/);
    assert.doesNotMatch(SOURCE, /carsEmbedPath/);
    assert.doesNotMatch(SOURCE, /PartnerSearchWidget/);
    const flights = SOURCE.slice(SOURCE.indexOf("function FlightsForm"), SOURCE.indexOf("function HotelsForm"));
    const cars = SOURCE.slice(SOURCE.indexOf("function CarsForm"), SOURCE.indexOf("function BookedPrompt"));
    assert.doesNotMatch(flights, /PartnerSearchWidget/);
    // No second search form: the hand-off is a named partner, not an embed.
    assert.doesNotMatch(flights, /flightsEmbedPath/);
    assert.match(flights, /flightHandoff\("aviasales"\)/);
    assert.match(flights, /flightHandoff\("kayak"\)/);
    assert.match(flights, /Open Aviasales/);
    assert.match(flights, /Compare on Kayak/);
    assert.match(cars, /<CarPrices/);
  });

  it("goes out through /go or a live tracked link, and nothing else", () => {
    assert.match(SOURCE, /goHref\(/);
    for (const call of SOURCE.match(/window\.open\([^;]*?\);/g) ?? []) {
      const ok =
        /goHref/.test(call) ||
        /bookUrl/.test(call) ||
        /bookHref/.test(call) ||
        /\bhref\b/.test(call);
      assert.ok(ok, `a window opened on something other than /go, a live tracked link, or the Aviasales hand-off: ${call}`);
    }
  });
});

describe("the whole journey survives the hand-off", () => {
  const config = { travelpayouts: {}, stay22: NO_STAY22, partners: { flights: "kayak" } as never };

  it("carries every leg of a multi-city trip, not just the first", () => {
    // MOVING THIS PAGE ONTO /go WOULD OTHERWISE HAVE DROPPED THEM. A five-leg
    // trip arriving as one leg opens a working search for the wrong journey,
    // and nobody reports that as a bug — they just book somewhere else.
    const legs = [
      { from: "JFK", to: "FCO", date: "2026-09-01" },
      { from: "FCO", to: "ATH", date: "2026-09-05" },
      { from: "ATH", to: "JFK", date: "2026-09-12" },
    ];
    const href = goHref({ product: "flight", legs });
    const parsed = readAffiliateRequest(new URLSearchParams(href.slice(href.indexOf("?") + 1)));
    assert.deepEqual(parsed?.legs, legs, "the legs did not survive the round trip through the URL");

    const url = resolveLink(parsed!, config)?.url ?? "";
    for (const leg of legs) {
      assert.ok(url.includes(leg.from) && url.includes(leg.to), `${leg.from}-${leg.to} is missing from ${url}`);
      assert.ok(url.includes(leg.date.slice(2).replace(/-/g, "")) || url.includes(leg.date), `${leg.date} is missing`);
    }
  });

  it("hands off airport codes rather than what the box says", () => {
    // A LEG IS THREE HYPHEN-SEPARATED FIELDS, and the airport box holds a
    // label after a pick — "New York (JFK)". Sending the label used to split
    // a hyphenated city into extra fields and drop the leg. Cash flights strip
    // codes before /go and before the Aviasales hand-off. /go still has to
    // survive the same labels if a leftover tab sends them.
    assert.match(SOURCE, /airportCode\(from\)/);
    assert.match(SOURCE, /airportCode\(to\)/);
    assert.match(SOURCE, /airportCode\(leg\.from\)/);
    assert.match(SOURCE, /airportCode\(leg\.to\)/);

    const legs = [{ from: airportCode("Cluj-Napoca (CLJ)"), to: airportCode("Rome (FCO)"), date: "2026-09-01" }];
    const href = goHref({ product: "flight", legs, checkOut: "2026-09-08" });
    const parsed = readAffiliateRequest(new URLSearchParams(href.slice(href.indexOf("?") + 1)));
    assert.deepEqual(parsed?.legs, [{ from: "CLJ", to: "FCO", date: "2026-09-01" }]);
    assert.match(resolveLink(parsed!, config)?.url ?? "", /CLJ-FCO\/2026-09-01\/2026-09-08/);
  });

  it("still reads a leg from a page that has not been reloaded since the fix", () => {
    // A browser holding the previous version of the booking page sends
    // labels. Refusing them would break the search for exactly as long as
    // somebody's tab stayed open, which is not a trade worth making.
    const parsed = readAffiliateRequest(new URLSearchParams("product=flight&legs=New York (JFK)-Rome (FCO)-2026-09-01"));
    assert.deepEqual(parsed?.legs, [{ from: "JFK", to: "FCO", date: "2026-09-01" }]);
  });

  it("refuses a leg that is not three whole fields", () => {
    // This is an outside input even though the site wrote the link: anybody
    // can edit a query string, and /go must never be talked into forwarding
    // somewhere of the sender's choosing.
    const parsed = readAffiliateRequest(new URLSearchParams("product=flight&legs=JFK-FCO-nonsense_-_-"));
    assert.deepEqual(parsed?.legs, []);
  });

  it("takes no destination URL, however it is dressed up", () => {
    const parsed = readAffiliateRequest(new URLSearchParams("product=flight&legs=https://evil.example.com"));
    assert.deepEqual(parsed?.legs, []);
    const href = goHref({ product: "hotel", destination: "https://evil.example.com" });
    assert.doesNotMatch(resolveLink(readAffiliateRequest(new URLSearchParams(href.slice(href.indexOf("?") + 1)))!, config)?.url ?? "", /^https:\/\/evil/);
  });
});

/**
 * TWO FLIGHT BUTTONS, TWO PARTNERS, ONE ROUTER.
 *
 * /book shows a button that says it opens Aviasales next to one that says it
 * opens Kayak, so "the flight partner" — a single setting — cannot answer both.
 * A link may name its own partner, and these hold the three things that makes
 * fragile: that the name reaches a results list rather than an empty search
 * box, that the marker is still on it, and that a stranger editing the name
 * cannot reach anywhere but one of the owner's own partners.
 */
describe("a link that names its own partner", () => {
  const MARKER = "761677";
  const kayakConfig = { travelpayouts: {}, stay22: NO_STAY22, marker: MARKER, partners: { flights: "kayak" } as never };
  /**
   * DATES THAT DO NOT WALK INTO THE PAST.
   *
   * This block was pinned to a departure of 2026-08-25, and on 2026-08-26 all
   * five of its tests broke at once — not because anything regressed, but
   * because the site correctly refuses a flight that has already left, so the
   * request stopped parsing and every `resolved!` in here dereferenced null.
   * A fixture dated by hand is a test with an expiry date on it.
   *
   * A month out, always, and the expectations are computed from the same two
   * values rather than typed beside them.
   */
  const isoInDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const OUT = isoInDays(30);
  const BACK = isoInDays(37);
  /** Aviasales writes a date in its route as DDMM. */
  const ddmm = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}`;
  const legs = [{ from: "JFK", to: "PRG", date: OUT }];
  const resolve = (href: string, config = kayakConfig) =>
    resolveLink(readAffiliateRequest(new URLSearchParams(href.slice(href.indexOf("?") + 1)))!, config);

  it("lands on the Aviasales results list for the route and dates, with the marker", () => {
    // The failure this replaces: the button opened a second, empty search form
    // and the traveller retyped the trip they had just typed.
    const href = goHref({ product: "flight", partner: "aviasales", legs, checkOut: BACK });
    assert.match(href, /partner=aviasales/);
    const resolved = resolve(href);
    const url = new URL(resolved!.url);
    assert.equal(url.hostname, "www.aviasales.com");
    assert.equal(url.pathname, `/search/JFK${ddmm(OUT)}PRG${ddmm(BACK)}1`);
    assert.equal(url.searchParams.get("marker"), MARKER);
    assert.equal(isAviasalesHref(resolved!.url), true, "the search link is not on the host the fare rows are held to");
    // Recorded as earning, or the owner cannot tell this from a link that works
    // and pays nothing — the car-hire failure at the top of this file.
    assert.equal(resolved!.route.earns, true);
    assert.equal(resolved!.route.network, "travelpayouts");
    assert.equal(resolved!.route.destinationLabel, "Aviasales");
  });

  it("says so rather than silently earning nothing when no marker is configured", () => {
    const resolved = resolve(
      goHref({ product: "flight", partner: "aviasales", legs }),
      { ...kayakConfig, marker: "" },
    );
    assert.match(resolved!.url, /^https:\/\/www\.aviasales\.com\/search\//);
    assert.doesNotMatch(resolved!.url, /marker/);
    assert.equal(resolved!.route.earns, false);
  });

  it("keeps the Kayak peer button on Kayak, and priceless", () => {
    const resolved = resolve(goHref({ product: "flight", partner: "kayak", legs, checkOut: BACK }));
    assert.ok(resolved!.url.startsWith(`https://www.kayak.com/flights/JFK-PRG/${OUT}/${BACK}`), resolved!.url);
    assert.equal(resolved!.route.destinationLabel, "Kayak");
    // Even when the owner's own setting is the other partner: a button that
    // says Kayak has to open Kayak.
    const flipped = resolve(goHref({ product: "flight", partner: "kayak", legs }), {
      ...kayakConfig,
      partners: { flights: "aviasales" } as never,
    });
    assert.match(flipped!.url, /^https:\/\/www\.kayak\.com\/flights\//);
  });

  it("ignores a name that is not one of the owner's partners for this search", () => {
    // The whole security of naming a partner: it is a NAME, checked against the
    // registry, so the worst an edited query string reaches is another of the
    // owner's partners or his setting — never an address of the sender's.
    for (const name of ["evil.example.com", "https://evil.example.com", "expedia", "economybookings"]) {
      const resolved = resolve(goHref({ product: "flight", partner: name as never, legs }));
      assert.match(resolved!.url, /^https:\/\/www\.kayak\.com\//, `${name} was obeyed`);
    }
  });

  it("leaves a link that names nobody on the owner's setting", () => {
    assert.doesNotMatch(goHref({ product: "flight", legs }), /partner=/);
    assert.match(resolve(goHref({ product: "flight", legs }))!.url, /^https:\/\/www\.kayak\.com\//);
    const onAviasales = resolve(goHref({ product: "flight", legs }), {
      ...kayakConfig,
      partners: { flights: "aviasales" } as never,
    });
    assert.match(onAviasales!.url, /^https:\/\/www\.aviasales\.com\/search\//);
  });

  it("does not let a flight partner be named on a hotel or a car link", () => {
    const hotel = resolve(goHref({ product: "hotel", partner: "aviasales" as never, destination: "Prague" }));
    assert.match(hotel!.url, /^https:\/\/www\.booking\.com\//);
    const car = resolve(
      goHref({ product: "car", partner: "aviasales" as never, destination: "Prague", checkIn: OUT, checkOut: BACK }),
    );
    assert.match(car!.url, /^https:\/\/www\.kayak\.com\/cars\//);
  });
});

describe("what the visitor is told", () => {
  it("takes the hotel button's wording from the one function that owns it", () => {
    // It no longer varies by provider — the owner's decision, see
    // hotelButtonLabel in lib/stay22.ts — but it is still read from there
    // rather than typed into the component, so the wording stays in one place.
    assert.match(SOURCE, /hotelButtonLabel\(\)/);
  });

  it("names partners only on the flight hand-off buttons, not on hotel search", () => {
    // Flights intentionally name Aviasales and Kayak. Hotels stay provider-neutral.
    for (const label of SOURCE.match(/searchLabel="[^"]*"/g) ?? []) {
      if (/Aviasales/i.test(label)) continue;
      assert.doesNotMatch(label, /Kayak|Booking\.com|Stay22|Expedia/i, label);
    }
    assert.match(SOURCE, /searchLabel="Open Aviasales"/);
    assert.match(SOURCE, /Compare on Kayak/);
  });
});
