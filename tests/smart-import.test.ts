import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { emptyItinerary, type Itinerary } from "@/data/itinerary";
import { addImportedItemsToItinerary, emptySmartImportResult, type ImportedItem } from "@/data/smart-import";
import { parseModelJson } from "@/lib/smart-import-parse";

describe("a fresh smart-import result", () => {
  it("starts with nothing to review", () => {
    const r = emptySmartImportResult();
    assert.deepEqual(r.items, []);
    assert.deepEqual(r.warnings, []);
  });
});

describe("adding imported items onto the real itinerary", () => {
  const base: Itinerary = { ...emptyItinerary(), startDate: "2026-06-01", endDate: "2026-06-05" };

  it("maps each kind onto the row the itinerary builder already edits", () => {
    const items: ImportedItem[] = [
      { id: "1", kind: "flight", airline: "Delta", flightNo: "DL123", from: "JFK", to: "FCO", date: "2026-06-01", confirmation: "ABC123" },
      { id: "2", kind: "lodging", name: "Hotel Rossi", address: "Via Roma 1", checkIn: "2026-06-01", checkOut: "2026-06-05" },
      { id: "3", kind: "activity", name: "Airport transfer", date: "2026-06-01", confirmation: "XYZ" },
    ];
    const result = addImportedItemsToItinerary(items, base);
    assert.equal(result.flights.length, 1);
    assert.equal(result.flights[0].airline, "Delta");
    assert.equal(result.flights[0].confirmation, "ABC123");
    assert.equal(result.lodging.length, 1);
    assert.equal(result.lodging[0].name, "Hotel Rossi");
    assert.equal(result.activities.length, 1);
    // A car/transfer/restaurant/tour has no confirmation field of its own on
    // ItinActivity — it rides in notes instead, never silently dropped.
    assert.match(result.activities[0].notes ?? "", /XYZ/);
  });

  it("appends to what the itinerary already holds rather than replacing it", () => {
    const withOne: Itinerary = { ...base, flights: [{ id: "existing", from: "A", to: "B", date: "2026-06-01" }] };
    const result = addImportedItemsToItinerary(
      [{ id: "1", kind: "flight", from: "JFK", to: "FCO", date: "2026-06-02" }],
      withOne,
    );
    assert.equal(result.flights.length, 2);
    assert.equal(result.flights[0].id, "existing");
  });

  it("never invents a date — an item with none lands exactly as bare as it was", () => {
    const result = addImportedItemsToItinerary([{ id: "1", kind: "activity", name: "Dinner reservation" }], base);
    assert.equal(result.activities[0].date, "");
  });
});

describe("parsing the model's raw JSON", () => {
  it("keeps a well-formed item", () => {
    const raw = JSON.stringify({
      items: [{ kind: "flight", airline: "Delta", from: "JFK", to: "FCO", date: "2026-06-01", departTime: "18:30" }],
      warnings: [],
    });
    const { items } = parseModelJson(raw);
    assert.equal(items.length, 1);
    assert.equal(items[0].kind, "flight");
    assert.equal(items[0].airline, "Delta");
    assert.equal(items[0].departTime, "18:30");
  });

  it("drops a date that is not YYYY-MM-DD rather than passing it through", () => {
    const raw = JSON.stringify({ items: [{ kind: "flight", from: "JFK", to: "FCO", date: "June 1st" }] });
    const { items } = parseModelJson(raw);
    assert.equal(items[0].date, undefined);
  });

  it("drops a time that is not HH:MM rather than passing it through", () => {
    const raw = JSON.stringify({ items: [{ kind: "flight", from: "JFK", to: "FCO", departTime: "6:30pm" }] });
    const { items } = parseModelJson(raw);
    assert.equal(items[0].departTime, undefined);
  });

  it("drops an item whose kind is not one of the three real kinds", () => {
    const raw = JSON.stringify({ items: [{ kind: "car-rental", name: "Hertz" }] });
    const { items } = parseModelJson(raw);
    assert.equal(items.length, 0);
  });

  it("drops an item that carries nothing recognizable", () => {
    const raw = JSON.stringify({ items: [{ kind: "activity" }] });
    const { items } = parseModelJson(raw);
    assert.equal(items.length, 0);
  });

  it("carries warnings through, capped and trimmed", () => {
    const raw = JSON.stringify({ items: [], warnings: ["a second passenger's name could not be read"] });
    const { warnings } = parseModelJson(raw);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /second passenger/);
  });

  it("returns nothing rather than throwing on text with no JSON in it", () => {
    assert.deepEqual(parseModelJson("Sorry, I can't help with that."), { items: [], warnings: [] });
  });

  it("returns nothing rather than throwing on malformed JSON", () => {
    assert.deepEqual(parseModelJson("{ items: [ this is not valid json"), { items: [], warnings: [] });
  });
});

describe("the import route keeps the same fences everything else does", () => {
  const ROUTE = readFileSync("app/api/account/smart-import/route.ts", "utf8");
  const LIB = readFileSync("lib/smart-import.ts", "utf8");

  it("checks same-origin, then sign-in, before spending a paid AI call", () => {
    const post = ROUTE.slice(ROUTE.indexOf("export async function POST"));
    assert.match(post, /sameOrigin/);
    assert.match(post, /Please log in first/);
    assert.ok(post.indexOf("sameOrigin") < post.indexOf("Please log in first"), "same-origin is checked before the account is even read");
  });

  it("is rate limited, since what it costs is a paid AI call rather than a plan feature", () => {
    assert.match(ROUTE, /rateLimit\(`smart-import:/);
  });

  it("caps how large an attached confirmation may be", () => {
    // The cap moved into data/smart-import-files.ts when the importer started
    // taking screenshots and photos as well as PDFs, so that what is accepted
    // can be tested without a request and the panel and the route cannot drift
    // apart about it. What matters is that the route still enforces one.
    assert.match(ROUTE, /readImportDataUrl/);
    assert.match(readFileSync("data/smart-import-files.ts", "utf8"), /MAX_IMPORT_BYTES/);
    assert.match(ROUTE, /413/, "an oversized file no longer gets its own status");
  });

  it("the system prompt tells the model never to invent a missing field", () => {
    assert.match(LIB, /NEVER invent/);
  });

  it("a PDF only ever goes to Gemini or Anthropic, never OpenAI's plain chat-completions call", () => {
    const openai = LIB.slice(LIB.indexOf("async function askOpenAI"), LIB.indexOf("Extract booking(s) from pasted"));
    assert.doesNotMatch(openai, /pdfBase64/);
  });
});
