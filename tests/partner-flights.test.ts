import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import { searchPartnerFlights } from "@/lib/partner-flights";

// Keep the wall clock explicit so valid September fixtures do not expire.
before(() => mock.timers.enable({ apis: ["Date"], now: new Date("2026-08-01T12:00:00Z") }));
after(() => mock.timers.reset());

describe("on-site flight compare rows", () => {
  it("builds a tracked /go link with the route and dates when live fares are off", async () => {
    const previous = process.env.TRAVELPAYOUTS_TOKEN;
    delete process.env.TRAVELPAYOUTS_TOKEN;
    try {
      const result = await searchPartnerFlights({
        origin: "JFK",
        destination: "FCO",
        departDate: "2026-09-12",
        returnDate: "2026-09-19",
        adults: 2,
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.mode, "compare");
      assert.equal(result.flights.length, 0);
      assert.match(result.message, /No priced flights/i);
      assert.doesNotMatch(result.message, /unavailable|not available|could not be loaded/i);
      assert.match(result.kayakHref, /^\/go\?/);
      assert.match(result.kayakHref, /product=flight/);
      assert.match(result.kayakHref, /legs=JFK-FCO-2026-09-12/);
      assert.match(result.kayakHref, /out=2026-09-19/);
      assert.doesNotMatch(result.kayakHref, /aid=|marker|kayak\.com|stay22|TRAVELPAYOUTS/i);
    } finally {
      if (previous !== undefined) process.env.TRAVELPAYOUTS_TOKEN = previous;
    }
  });

  it("refuses missing airports rather than inventing a search", async () => {
    const result = await searchPartnerFlights({
      origin: "",
      destination: "FCO",
      departDate: "2026-09-12",
    });
    assert.equal(result.ok, false);
  });

  it("refuses a departure that has already passed", async () => {
    const result = await searchPartnerFlights({
      origin: "JFK",
      destination: "FCO",
      departDate: "2020-01-15",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /past/);
  });

  it("puts every multi-city leg on the Kayak /go link and does not invent a priced row", async () => {
    const previous = process.env.TRAVELPAYOUTS_TOKEN;
    process.env.TRAVELPAYOUTS_TOKEN = "test-token-not-used";
    try {
      const result = await searchPartnerFlights({
        origin: "JFK",
        destination: "FCO",
        departDate: "2026-09-12",
        legs: [
          { from: "JFK", to: "FCO", date: "2026-09-12" },
          { from: "FCO", to: "TLV", date: "2026-09-18" },
        ],
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.mode, "compare");
      assert.equal(result.flights.length, 0);
      assert.match(result.kayakHref, /legs=JFK-FCO-2026-09-12_FCO-TLV-2026-09-18/);
      assert.doesNotMatch(result.kayakHref, /out=/);
    } finally {
      if (previous === undefined) delete process.env.TRAVELPAYOUTS_TOKEN;
      else process.env.TRAVELPAYOUTS_TOKEN = previous;
    }
  });
});
