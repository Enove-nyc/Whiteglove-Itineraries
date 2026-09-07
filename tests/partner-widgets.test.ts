import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { carsEmbedPath, flightsEmbedPath } from "@/lib/partner-widget-paths";
import { AVIASALES_SEARCH_FORM, aviasalesWidgetSrc, LOCALRENT_SEARCH_FORM, localrentWidgetSrc } from "@/lib/partner-widgets";
import { isPrivatePath } from "@/lib/site-map";

describe("same-origin widget paths", () => {
  it("put the route and dates on /embed/flights, not on a partner host", () => {
    const path = flightsEmbedPath({
      origin: "JFK",
      destination: "FCO",
      departDate: "2026-09-12",
      returnDate: "2026-09-19",
      adults: 2,
    });
    assert.match(path, /^\/embed\/flights\?/);
    assert.match(path, /origin=JFK/);
    assert.match(path, /destination=FCO/);
    assert.match(path, /depart=2026-09-12/);
    assert.match(path, /return=2026-09-19/);
    assert.match(path, /adults=2/);
    assert.doesNotMatch(path, /tp\.media|aviasales|marker|shmarker/i);
  });

  it("drops junk instead of putting it on the embed address", () => {
    assert.equal(flightsEmbedPath({ origin: "not-an-airport", departDate: "soon" }), "/embed/flights");
    assert.doesNotMatch(carsEmbedPath({ location: "https://evil.example.com" }), /evil/);
  });

  it("omits dates that have already passed rather than prefilling the widget with them", () => {
    const stale = flightsEmbedPath({
      origin: "JFK",
      destination: "FCO",
      departDate: "2020-01-15",
      returnDate: "2026-09-19",
    });
    assert.match(stale, /origin=JFK/);
    assert.match(stale, /destination=FCO/);
    assert.doesNotMatch(stale, /depart=/);
    assert.doesNotMatch(stale, /return=/);
  });

  it("omits a return that is before the departure", () => {
    const path = flightsEmbedPath({
      origin: "JFK",
      destination: "FCO",
      departDate: "2026-09-19",
      returnDate: "2026-09-12",
    });
    assert.match(path, /depart=2026-09-19/);
    assert.doesNotMatch(path, /return=/);
  });

  it("puts one-way and nonstop on the embed address", () => {
    const path = flightsEmbedPath({
      origin: "JFK",
      destination: "FCO",
      departDate: "2026-09-12",
      returnDate: "2026-09-19",
      oneWay: true,
      nonstop: true,
    });
    assert.match(path, /one_way=true/);
    assert.match(path, /nonstop=true/);
    assert.doesNotMatch(path, /return=/);
  });
});

describe("Travelpayouts widget scripts", () => {
  it("put the marker on the Aviasales search form, not a Data API fare", () => {
    const previous = process.env.TRAVELPAYOUTS_MARKER;
    process.env.TRAVELPAYOUTS_MARKER = "761677";
    try {
      const src = aviasalesWidgetSrc({
        origin: "JFK",
        destination: "TLV",
        departDate: "2026-09-12",
        returnDate: "2026-09-19",
        adults: 1,
      });
      const url = new URL(src);
      assert.equal(url.origin + url.pathname, "https://tp.media/content");
      assert.equal(url.searchParams.get("shmarker"), "761677");
      assert.equal(url.searchParams.get("promo_id"), AVIASALES_SEARCH_FORM.promo_id);
      assert.equal(url.searchParams.get("campaign_id"), AVIASALES_SEARCH_FORM.campaign_id);
      assert.equal(url.searchParams.get("origin"), "JFK");
      assert.equal(url.searchParams.get("destination"), "TLV");
      assert.equal(url.searchParams.get("depart_date"), "2026-09-12");
      assert.equal(url.searchParams.get("return_date"), "2026-09-19");
      assert.match(url.searchParams.get("searchUrl") ?? "", /^https:\/\/www\.aviasales\.com\/search$/);
      assert.equal(url.searchParams.get("show_hotels"), "false");
      assert.equal(url.searchParams.get("one_way"), "false");
    } finally {
      if (previous === undefined) delete process.env.TRAVELPAYOUTS_MARKER;
      else process.env.TRAVELPAYOUTS_MARKER = previous;
    }
  });

  it("puts one-way and nonstop on the Aviasales widget", () => {
    const previous = process.env.TRAVELPAYOUTS_MARKER;
    process.env.TRAVELPAYOUTS_MARKER = "761677";
    try {
      const src = aviasalesWidgetSrc({
        origin: "JFK",
        destination: "TLV",
        departDate: "2026-09-12",
        returnDate: "2026-09-19",
        oneWay: true,
        nonstop: true,
      });
      const url = new URL(src);
      assert.equal(url.searchParams.get("one_way"), "true");
      assert.equal(url.searchParams.get("only_direct"), "true");
      assert.equal(url.searchParams.get("return_date"), null);
    } finally {
      if (previous === undefined) delete process.env.TRAVELPAYOUTS_MARKER;
      else process.env.TRAVELPAYOUTS_MARKER = previous;
    }
  });

  it("does not put a past date on the Aviasales widget", () => {
    const previous = process.env.TRAVELPAYOUTS_MARKER;
    process.env.TRAVELPAYOUTS_MARKER = "761677";
    try {
      const src = aviasalesWidgetSrc({
        origin: "JFK",
        destination: "TLV",
        departDate: "2020-01-15",
        returnDate: "2020-01-22",
      });
      const url = new URL(src);
      assert.equal(url.searchParams.get("origin"), "JFK");
      assert.equal(url.searchParams.get("destination"), "TLV");
      assert.equal(url.searchParams.get("depart_date"), null);
      assert.equal(url.searchParams.get("return_date"), null);
    } finally {
      if (previous === undefined) delete process.env.TRAVELPAYOUTS_MARKER;
      else process.env.TRAVELPAYOUTS_MARKER = previous;
    }
  });

  it("puts the same marker on the Localrent car search form", () => {
    const previous = process.env.TRAVELPAYOUTS_MARKER;
    process.env.TRAVELPAYOUTS_MARKER = "761677";
    try {
      const src = localrentWidgetSrc();
      const url = new URL(src);
      assert.equal(url.searchParams.get("shmarker"), "761677");
      assert.equal(url.searchParams.get("promo_id"), LOCALRENT_SEARCH_FORM.promo_id);
      assert.equal(url.searchParams.get("campaign_id"), LOCALRENT_SEARCH_FORM.campaign_id);
    } finally {
      if (previous === undefined) delete process.env.TRAVELPAYOUTS_MARKER;
      else process.env.TRAVELPAYOUTS_MARKER = previous;
    }
  });

  it("builds nothing when the marker is missing, rather than an untracked widget", () => {
    const previous = process.env.TRAVELPAYOUTS_MARKER;
    delete process.env.TRAVELPAYOUTS_MARKER;
    try {
      assert.equal(aviasalesWidgetSrc({ origin: "JFK", destination: "FCO" }), "");
      assert.equal(localrentWidgetSrc(), "");
    } finally {
      if (previous !== undefined) process.env.TRAVELPAYOUTS_MARKER = previous;
    }
  });
});

describe("how the widgets are loaded", () => {
  it("loads Travelpayouts into a real slot on the embed pages, not next/script", () => {
    const flights = readFileSync("app/embed/flights/page.tsx", "utf8");
    const cars = readFileSync("app/embed/cars/page.tsx", "utf8");
    const loader = readFileSync("components/PartnerWidgetEmbed.tsx", "utf8");
    assert.match(flights, /PartnerWidgetEmbed/);
    assert.match(cars, /PartnerWidgetEmbed/);
    assert.match(loader, /document\.createElement\("script"\)/);
    assert.match(loader, /tp\.media\/content/);
    for (const source of [flights, cars, loader]) {
      assert.doesNotMatch(source, /from "next\/script"/);
      assert.doesNotMatch(source, /strategy="afterInteractive"/);
      assert.doesNotMatch(source, /data-no-optimize|data-wp-|noptimize/i);
    }
  });

  it("keeps the marker off the public booking panel", () => {
    const panel = readFileSync("components/BookPartners.tsx", "utf8");
    // Flights hand off through /go, which builds the marked address on the
    // server; cars are searched through our own API. Neither carries the marker.
    assert.match(panel, /goHref\(/);
    assert.doesNotMatch(panel, /\/embed\/cars|carsEmbedPath/);
    assert.doesNotMatch(panel, /tp\.media|shmarker|TRAVELPAYOUTS_MARKER/);
    assert.match(panel, /\/api\/partners\/flights\/search/);
    assert.doesNotMatch(panel, /\/api\/partners\/cars\/search/);
    // The car search that DOES exist is the provider layer's, not the old
    // compare-row endpoint.
    assert.match(panel, /\/api\/travel\/cars\/search|<CarPrices/);
  });

  it("keeps the embed addresses out of the sitemap and robots list", () => {
    assert.equal(isPrivatePath("/embed"), true);
    assert.equal(isPrivatePath("/embed/flights"), true);
    assert.match(readFileSync("components/RequiredFields.tsx", "utf8"), /path\.startsWith\("\/embed"\)/);
    assert.equal(isPrivatePath("/embedded-tours"), false);
  });

  it("hands cash flights off to Aviasales/Kayak from one White Glove form; cars show our own prices", () => {
    const panel = readFileSync("components/BookPartners.tsx", "utf8");
    const flights = panel.slice(panel.indexOf("function FlightsForm"), panel.indexOf("function HotelsForm"));
    const cars = panel.slice(panel.indexOf("function CarsForm"), panel.indexOf("function BookedPointer"));
    assert.doesNotMatch(flights, /PartnerSearchWidget/);
    assert.doesNotMatch(flights, /flightsEmbedPath/);
    assert.match(flights, /flightHandoff\("aviasales"\)/);
    assert.match(flights, /Open Aviasales/);
    assert.match(flights, /Compare on Kayak/);
    assert.match(flights, /AirportAutocomplete|DateField/);
    assert.match(flights, /round-trip/);
    assert.match(flights, /one-way/);
    assert.match(flights, /multi-city/);
    assert.match(flights, /Nonstop only/);
    // THE CARS TAB NO LONGER EMBEDS A PARTNER. Its Localrent panel carried a
    // thin, fixed set of cars and sat under White Glove's own live prices,
    // which are wider and real — a second, worse answer under the first one.
    // The embed route and its helper still exist; this panel does not use them.
    assert.doesNotMatch(cars, /PartnerSearchWidget/);
    assert.match(cars, /<CarPrices/);
    assert.doesNotMatch(cars, /AddressAutocomplete|Driver age/);
    assert.match(panel, /\/api\/partners\/hotels\/search/);
    assert.doesNotMatch(panel, /@duffel|BookingSearch|FlightReview/);
  });
});
