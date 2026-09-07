import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { partnerLiveCapabilities } from "@/lib/partner-live";
import { stay22ApiConfigured } from "@/lib/stay22-api";
import { readFileSync } from "node:fs";

describe("partner live capabilities", () => {
  it("never invents a live car inventory flag", () => {
    const caps = partnerLiveCapabilities();
    assert.equal(caps.cars, false);
  });

  it("reflects whether the Stay22 hotel API is configured, without a live flight or car inventory flag", () => {
    const caps = partnerLiveCapabilities();
    assert.equal(caps.hotels, stay22ApiConfigured());
    assert.equal(caps.flights, false);
    assert.equal(caps.cars, false);
  });
});

describe("live partner search wiring", () => {
  it("keeps hotel live search on Stay22 and flights on the partner search helper", () => {
    const hotels = readFileSync("app/api/partners/hotels/search/route.ts", "utf8");
    const flights = readFileSync("app/api/partners/flights/search/route.ts", "utf8");
    assert.match(hotels, /searchStay22Accommodations/);
    assert.match(flights, /searchPartnerFlights/);
    const helper = readFileSync("lib/partner-flights.ts", "utf8");
    assert.match(helper, /searchLiveAviasalesFlights/);
    assert.match(helper, /Stay22's Direct Travel API is accommodations only/);
    assert.doesNotMatch(helper, /bookHref:\s*compareHref\(search, flight/);
    assert.match(helper, /liveRowFromFare/);
    const cars = readFileSync("app/api/partners/cars/search/route.ts", "utf8");
    assert.match(cars, /searchPartnerCars/);
    assert.doesNotMatch(hotels, /DUFFEL/);
    assert.doesNotMatch(flights, /DUFFEL/);
    assert.doesNotMatch(cars, /DUFFEL/);
  });

  it("documents the env names the owner must set", () => {
    const stay = readFileSync("lib/stay22-api.ts", "utf8");
    const tp = readFileSync("lib/travelpayouts-api.ts", "utf8");
    assert.match(stay, /STAY22_API_KEY/);
    assert.match(tp, /TRAVELPAYOUTS_TOKEN/);
  });

  it("names the Where to stay tab on the book partners UI", () => {
    const ui = readFileSync("components/BookPartners.tsx", "utf8");
    assert.match(ui, /Where to stay/);
    assert.doesNotMatch(ui, /Hotels and stays/);
    assert.match(ui, /\/api\/partners\/hotels\/search/);
    assert.match(ui, /\/api\/partners\/flights\/search/);
    assert.doesNotMatch(ui, /\/api\/partners\/cars\/search/);
    assert.match(ui, /goHref\(/);
    // carsEmbedPath and PartnerSearchWidget were here for the Cars tab's
    // partner panel, which White Glove's own car prices have replaced. The
    // helper and the embed route still exist; this screen no longer uses them.
    assert.doesNotMatch(ui, /carsEmbedPath/);
    assert.doesNotMatch(ui, /PartnerSearchWidget/);
    assert.match(ui, /View & book/);
    assert.match(ui, /Open Aviasales/);
    assert.match(ui, /Compare on Kayak/);
    assert.doesNotMatch(ui, /Passengers/);
    assert.doesNotMatch(ui, /Driver age/);
    assert.doesNotMatch(ui, /Open with these dates in a new tab/);
  });

  it("keeps cash flights on one form with trip type, live fares when real, and Aviasales/Kayak hand-offs — no embedded flight widget", () => {
    const ui = readFileSync("components/BookPartners.tsx", "utf8");
    const flights = ui.slice(ui.indexOf("function FlightsForm"), ui.indexOf("function HotelsForm"));
    const cars = ui.slice(ui.indexOf("function CarsForm"), ui.indexOf("function BookedPointer"));
    assert.doesNotMatch(flights, /PartnerSearchWidget/);
    // Both buttons hand off through /go by naming their partner. No second
    // search form, and no partner address written in the browser.
    assert.doesNotMatch(flights, /flightsEmbedPath/);
    assert.match(flights, /flightHandoff\("aviasales"\)/);
    assert.match(flights, /flightHandoff\("kayak"\)/);
    assert.match(flights, /AirportAutocomplete/);
    assert.match(flights, /DateField/);
    assert.match(flights, /round-trip/);
    assert.match(flights, /one-way/);
    assert.match(flights, /multi-city/);
    assert.match(flights, /Nonstop only/);
    assert.match(flights, /\/api\/partners\/flights\/search/);
    assert.match(flights, /Open Aviasales/);
    assert.match(flights, /Compare on Kayak/);
    // THE PARTNER PANEL HAS LEFT THE CARS TAB. It sat under White Glove's own
    // prices while those were unproven, on the reasoning that a page must not
    // be left with nothing if a provider fails. It carried a thin, fixed set
    // of cars; the list above it is wider and real, so the panel had become a
    // second, worse answer under the first one.
    assert.doesNotMatch(cars, /PartnerSearchWidget/);
    assert.doesNotMatch(cars, /carsEmbedPath/);
    assert.match(cars, /<CarPrices/, "then the prices are the whole answer and must be there");
    // CARS DO HAVE A FORM NOW, AND DID NOT BEFORE. The old rule was that the
    // partner panel carried its own boxes, so a White Glove form above it
    // would have been two forms asking the same question. That held while the
    // panel was the whole answer. It stopped holding when White Glove got car
    // prices of its own, which need a place and two dates and had nowhere to
    // read them from: /book opened on Cars with an empty panel and no way to
    // search anything.
    //
    // What survives from the old rule is that there is exactly ONE White Glove
    // form and it feeds both — our prices and the panel's location — and that
    // no partner address is written in the browser. carsEmbedPath is our own
    // /embed path; the partner is resolved on the server, as everywhere else.
    assert.match(cars, /<SearchGrid/, "the Cars tab must be searchable");
    assert.match(cars, /<AirportAutocomplete/, "the place must be chosen from a list, not typed blind");
    assert.equal((cars.match(/<SearchGrid/g) ?? []).length, 1, "one form, not two");
    assert.doesNotMatch(cars, /localrent\.com|https?:\/\//, "no partner address in the browser");
    assert.doesNotMatch(ui, /wanted\.trip === "multi-city"/);
    assert.doesNotMatch(ui, /Live prices are not available/);
    assert.doesNotMatch(ui, /Live prices could not be loaded/);
    assert.doesNotMatch(ui, /Compare fares with Kayak/);
    // The per-tab explainer went in the wording pass; the honesty rule — no
    // invented fare is ever shown as White Glove's — survives as the empty
    // result's own words.
    assert.match(ui, /No priced flights for those dates on White Glove/);
    assert.match(ui, /Nothing is invented here/);
  });

  it("puts a real airline mark and expandable stop copy on priced rows", () => {
    const panel = readFileSync("components/PartnerResultsPanel.tsx", "utf8");
    assert.match(panel, /logoUrl/);
    assert.match(panel, /stopDetail/);
    assert.match(panel, /<details/);
    assert.doesNotMatch(panel, /pics\.avs\.io\/placeholder|somewhere/i);
  });
});
