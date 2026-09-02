import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type SearchShape,
  airportCode,
  describeSearch,
  kayakUrl,
  searchProblem,
  searchTermFor,
  withAffiliate,
} from "@/lib/kayak-search";

/**
 * The Kayak search a flight form hands off to.
 *
 * A wrong URL here does not throw. It opens Kayak on the wrong day, or in the
 * wrong city, or with the filters silently dropped — and nobody finds out
 * until somebody has booked it.
 */

const leg = (from: string, to: string, date: string) => ({ from, to, date });

describe("getting a code out of what the box holds", () => {
  it("takes it out of a chosen label", () => {
    assert.equal(airportCode("New York — all airports (NYC)"), "NYC");
    assert.equal(airportCode("Kraków — John Paul II International (KRK)"), "KRK");
  });

  it("takes a code typed straight in", () => {
    assert.equal(airportCode("JFK"), "JFK");
    assert.equal(airportCode(" krk "), "KRK");
  });

  it("gives nothing for a half-typed city, rather than guessing", () => {
    // "New" is not an airport. Guessing one would send somebody to a city they
    // did not choose, and the search would look like it worked.
    for (const value of ["New", "New York", "", "  ", "JFKK"]) assert.equal(airportCode(value), "", value);
  });
});

describe("what the airport list searches on", () => {
  it("searches on the code once something has been picked", () => {
    // THE BUG. The box held the whole label after a pick, the list matched
    // nothing against it, so the dropdown reopened empty — and there was no
    // way to choose a different airport without deleting the text by hand.
    // Picking one airport locked the field.
    assert.equal(searchTermFor("New York — all airports (NYC)"), "NYC");
    assert.equal(searchTermFor("Kraków — John Paul II International (KRK)"), "KRK");
  });

  it("searches on what was typed when nothing has been picked", () => {
    assert.equal(searchTermFor("new yo"), "new yo");
    assert.equal(searchTermFor("  lizhensk "), "lizhensk");
  });
});

describe("what cannot be searched", () => {
  const round = (over: Partial<{ legs: [ReturnType<typeof leg>]; ret: string }> = {}): SearchShape => ({
    trip: "round-trip",
    legs: over.legs ?? [leg("JFK", "KRK", "2027-09-01")],
    ret: over.ret ?? "2027-09-08",
  });

  it("takes a complete round trip", () => {
    assert.equal(searchProblem(round()), null);
  });

  it("says which airport is missing, and how to give it", () => {
    assert.match(String(searchProblem(round({ legs: [leg("New", "KRK", "2027-09-01")] }))), /pick from the list, or type a code/);
  });

  it("refuses a flight from a place to itself", () => {
    assert.match(String(searchProblem(round({ legs: [leg("JFK", "JFK", "2027-09-01")] }))), /the same/i);
  });

  it("refuses a return before the departure", () => {
    assert.match(String(searchProblem(round({ ret: "2027-08-01" }))), /before the departure/);
  });

  it("refuses a round trip with no return, and says what to do instead", () => {
    assert.match(String(searchProblem(round({ ret: "" }))), /switch to one way/);
  });

  it("takes a one way with no return at all", () => {
    assert.equal(searchProblem({ trip: "one-way", legs: [leg("JFK", "KRK", "2027-09-01")] }), null);
  });

  it("refuses a date that has already passed", () => {
    assert.match(String(searchProblem({ trip: "one-way", legs: [leg("JFK", "KRK", "2020-01-15")] })), /passed/);
  });

  it("names which leg of a multi-city is wrong", () => {
    const shape: SearchShape = { trip: "multi-city", legs: [leg("JFK", "KRK", "2027-09-01"), leg("KRK", "", "2027-09-05")] };
    assert.match(String(searchProblem(shape)), /flight 2/);
  });

  it("refuses multi-city legs that are out of order", () => {
    // Almost always a typo, and Kayak takes the dates as given — so it would
    // search a journey nobody could fly and show nothing.
    const shape: SearchShape = { trip: "multi-city", legs: [leg("JFK", "KRK", "2027-09-05"), leg("KRK", "BUD", "2027-09-01")] };
    assert.match(String(searchProblem(shape)), /leaves before/);
  });

  it("takes multi-city legs in order", () => {
    const shape: SearchShape = {
      trip: "multi-city",
      legs: [leg("JFK", "KRK", "2027-09-01"), leg("KRK", "BUD", "2027-09-05"), leg("BUD", "JFK", "2027-09-09")],
    };
    assert.equal(searchProblem(shape), null);
  });
});

describe("the address it opens", () => {
  it("writes a round trip as one route and two dates", () => {
    const url = kayakUrl({ trip: "round-trip", legs: [leg("JFK", "KRK", "2027-09-01")], ret: "2027-09-08" });
    assert.match(url, /^https:\/\/www\.kayak\.com\/flights\/JFK-KRK\/2027-09-01\/2027-09-08\?/);
  });

  it("writes a one way with no return date on it", () => {
    // A stray date here is a return flight nobody asked for.
    const url = kayakUrl({ trip: "one-way", legs: [leg("JFK", "KRK", "2027-09-01")] });
    assert.match(url, /flights\/JFK-KRK\/2027-09-01\?/);
    assert.ok(!/2027-09-08/.test(url));
  });

  it("writes multi-city as the legs in order", () => {
    const url = kayakUrl({
      trip: "multi-city",
      legs: [leg("JFK", "KRK", "2027-09-01"), leg("KRK", "BUD", "2027-09-05")],
    });
    assert.match(url, /flights\/JFK-KRK\/2027-09-01\/KRK-BUD\/2027-09-05\?/);
  });

  it("uses the code, not the label the box holds", () => {
    const url = kayakUrl({ trip: "one-way", legs: [leg("New York — all airports (NYC)", "Kraków (KRK)", "2027-09-01")] });
    assert.match(url, /flights\/NYC-KRK\//);
  });

  it("carries the nonstop filter only when it was asked for", () => {
    const shape: SearchShape = { trip: "one-way", legs: [leg("JFK", "KRK", "2027-09-01")] };
    assert.match(kayakUrl(shape, { nonstop: true }), /fs=stops%3D0|fs=stops=0/);
    assert.ok(!/fs=/.test(kayakUrl(shape)));
  });

  it("appends the affiliate key without losing the filters", () => {
    // A search that opens without it earns nothing, and the page looks exactly
    // the same — so nobody would ever notice.
    const url = kayakUrl({ trip: "one-way", legs: [leg("JFK", "KRK", "2027-09-01")] }, { nonstop: true, affiliate: "a=wg&b=1" });
    assert.match(url, /a=wg&b=1$/);
    assert.match(url, /sort=bestflight_a/);
    assert.match(url, /fs=stops/);
  });

  it("does not double the question mark", () => {
    assert.equal(withAffiliate("https://x.test/a?b=1", "?c=2"), "https://x.test/a?b=1&c=2");
    assert.equal(withAffiliate("https://x.test/a", "c=2"), "https://x.test/a?c=2");
    assert.equal(withAffiliate("https://x.test/a", "  "), "https://x.test/a");
  });
});

describe("how the search reads back", () => {
  it("says the journey in codes", () => {
    assert.equal(
      describeSearch({ trip: "round-trip", legs: [leg("JFK", "KRK", "2027-09-01")], ret: "2027-09-08" }),
      "JFK → KRK, 2027-09-01 and back 2027-09-08",
    );
    assert.equal(
      describeSearch({ trip: "multi-city", legs: [leg("JFK", "KRK", "2027-09-01"), leg("KRK", "BUD", "2027-09-05")] }),
      "JFK → KRK, 2027-09-01; KRK → BUD, 2027-09-05",
    );
  });
});
