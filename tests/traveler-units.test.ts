import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { emptyItinerary, redactForTraveler, travelerUnitKey, unitMates, type ItinTraveler, type Itinerary } from "@/data/itinerary";

function traveler(id: string, overrides: Partial<ItinTraveler> = {}): ItinTraveler {
  return { id, name: id, kind: "adult", ...overrides };
}

describe("a traveler's unit key", () => {
  it("is their own id, solo, with no family label", () => {
    assert.equal(travelerUnitKey(traveler("a")), "solo:a");
  });

  it("matches another traveler with the exact same family label", () => {
    const a = travelerUnitKey(traveler("a", { family: "Smith family" }));
    const b = travelerUnitKey(traveler("b", { family: "Smith family" }));
    assert.equal(a, b);
  });

  it("matches regardless of case or surrounding whitespace", () => {
    const a = travelerUnitKey(traveler("a", { family: "  Smith Family " }));
    const b = travelerUnitKey(traveler("b", { family: "smith family" }));
    assert.equal(a, b);
  });

  it("a blank family label is the same as none at all", () => {
    assert.equal(travelerUnitKey(traveler("a", { family: "  " })), "solo:a");
  });
});

describe("who shares a traveler's unit", () => {
  const itin: Itinerary = {
    ...emptyItinerary(),
    travelers: [
      traveler("smith-1", { name: "Mr. Smith", family: "Smith family" }),
      traveler("smith-2", { name: "Mrs. Smith", family: "Smith family" }),
      traveler("green-1", { name: "Mr. Green", family: "Green family" }),
      traveler("solo-1", { name: "Solo traveler" }),
    ],
  };

  it("includes yourself and your family, not another family", () => {
    const mates = unitMates(itin, "smith-1").map((t) => t.id).sort();
    assert.deepEqual(mates, ["smith-1", "smith-2"]);
  });

  it("a traveler with no family label is only ever themselves", () => {
    const mates = unitMates(itin, "solo-1").map((t) => t.id);
    assert.deepEqual(mates, ["solo-1"]);
  });

  it("is empty for a traveler id that isn't on the trip", () => {
    assert.deepEqual(unitMates(itin, "nobody"), []);
  });
});

describe("what one traveler's own link may see of everyone else", () => {
  const itin: Itinerary = {
    ...emptyItinerary(),
    travelers: [
      traveler("smith-1", { name: "Mr. Smith", family: "Smith family", notes: "Passport A1234", email: "smith@example.com", phone: "555-1111" }),
      traveler("smith-2", { name: "Mrs. Smith", family: "Smith family", notes: "Passport A5678" }),
      traveler("green-1", { name: "Mr. Green", family: "Green family", notes: "Passport B0000", email: "green@example.com", phone: "555-2222" }),
    ],
  };

  it("keeps their own unit's notes, email and phone in full", () => {
    const redacted = redactForTraveler(itin, "smith-1");
    const me = redacted.travelers?.find((t) => t.id === "smith-1");
    const mate = redacted.travelers?.find((t) => t.id === "smith-2");
    assert.equal(me?.notes, "Passport A1234");
    assert.equal(me?.email, "smith@example.com");
    assert.equal(mate?.notes, "Passport A5678");
  });

  it("strips another unit's notes, email and phone — but keeps their name and kind, since the roster is not secret", () => {
    const redacted = redactForTraveler(itin, "smith-1");
    const other = redacted.travelers?.find((t) => t.id === "green-1");
    assert.equal(other?.name, "Mr. Green");
    assert.equal(other?.kind, "adult");
    assert.equal(other?.notes, undefined);
    assert.equal(other?.email, undefined);
    assert.equal(other?.phone, undefined);
  });

  it("leaves the shared trip itself — flights, lodging, activities — untouched when nothing is assigned to a unit", () => {
    const withStops: Itinerary = {
      ...itin,
      flights: [{ id: "f1", from: "JFK", to: "FCO", date: "2026-06-01" }],
      lodging: [{ id: "l1", type: "hotel", name: "Hotel Rossi", checkIn: "2026-06-01", checkOut: "2026-06-05" }],
    };
    const redacted = redactForTraveler(withStops, "smith-1");
    assert.deepEqual(redacted.flights, withStops.flights);
    assert.deepEqual(redacted.lodging, withStops.lodging);
  });
});

describe("a group trip where each unit has its own flights, stay and stops", () => {
  const itin: Itinerary = {
    ...emptyItinerary(),
    travelers: [
      traveler("smith-1", { name: "Mr. Smith", family: "Smith family" }),
      traveler("smith-2", { name: "Mrs. Smith", family: "Smith family" }),
      traveler("green-1", { name: "Mr. Green", family: "Green family" }),
    ],
    flights: [
      { id: "f-smith", from: "JFK", to: "FCO", date: "2026-06-01", unitKey: "family:smith family" },
      { id: "f-green", from: "LAX", to: "FCO", date: "2026-06-01", unitKey: "family:green family" },
      { id: "f-shared", from: "FCO", to: "CDG", date: "2026-06-10" },
    ],
    lodging: [
      { id: "l-smith", type: "hotel", name: "Hotel Rossi", checkIn: "2026-06-01", checkOut: "2026-06-05", unitKey: "family:smith family" },
      { id: "l-green", type: "hotel", name: "Hotel Verdi", checkIn: "2026-06-01", checkOut: "2026-06-05", unitKey: "family:green family" },
    ],
    activities: [
      { id: "a-smith", name: "Private tour", date: "2026-06-02", unitKey: "family:smith family" },
      { id: "a-shared", name: "Group dinner", date: "2026-06-03" },
    ],
  };

  it("a unit sees its own flight, stay and stop, and every shared one", () => {
    const redacted = redactForTraveler(itin, "smith-1");
    assert.deepEqual(redacted.flights.map((f) => f.id), ["f-smith", "f-shared"]);
    assert.deepEqual(redacted.lodging.map((l) => l.id), ["l-smith"]);
    assert.deepEqual(redacted.activities.map((a) => a.id), ["a-smith", "a-shared"]);
  });

  it("never sees another unit's flight, stay or stop", () => {
    const redacted = redactForTraveler(itin, "smith-1");
    assert.ok(!redacted.flights.some((f) => f.id === "f-green"));
    assert.ok(!redacted.lodging.some((l) => l.id === "l-green"));
  });

  it("the other family sees the mirror image", () => {
    const redacted = redactForTraveler(itin, "green-1");
    assert.deepEqual(redacted.flights.map((f) => f.id), ["f-green", "f-shared"]);
    assert.deepEqual(redacted.lodging.map((l) => l.id), ["l-green"]);
  });

  it("a viewer id that matches no traveler on the trip sees only the shared plan, never a guess", () => {
    const redacted = redactForTraveler(itin, "nobody");
    assert.deepEqual(redacted.flights.map((f) => f.id), ["f-shared"]);
    assert.deepEqual(redacted.lodging, []);
    assert.deepEqual(redacted.activities.map((a) => a.id), ["a-shared"]);
  });

  it("the builder is where a unit is chosen — every form that makes one of these offers it", () => {
    const BUILDER = readFileSync("components/ItineraryBuilder.tsx", "utf8");
    assert.equal((BUILDER.match(/Who is this for/g) ?? []).length, 3, "flights, stays and stops each need the selector");
    assert.match(BUILDER, /unitsOf\(itin\)/);
    // A selector that is never read back on save is decorative — which is
    // exactly what it was here until the three submit handlers carried it.
    assert.equal(
      (BUILDER.match(/unitKey: [fla]\.unitKey \|\| undefined/g) ?? []).length,
      3,
      "each form must save the unit it was given, not just show the box",
    );
  });
});

describe("the traveler-scoped app page and its share route keep the same fences everything else does", () => {
  const PAGE = readFileSync("app/t/[shareId]/app/page.tsx", "utf8");
  const ROUTE = readFileSync("app/api/account/traveler-share/route.ts", "utf8");
  const STORE = readFileSync("lib/account-store.ts", "utf8");

  it("the page redacts before building the companion trip, never after", () => {
    const idx = PAGE.indexOf("redactForTraveler");
    const buildIdx = PAGE.indexOf("buildCompanionFromItinerary(");
    assert.ok(idx > -1 && idx < buildIdx, "redaction must happen before the companion trip is built");
  });

  it("Business-gated, the same as handing a trip to a client at all", () => {
    assert.match(PAGE, /mayServeCompanionClients/);
    assert.match(ROUTE, /mayServeCompanionClients/);
  });

  it("the share route checks same-origin and sign-in before creating a link", () => {
    const post = ROUTE.slice(ROUTE.indexOf("export async function POST"));
    assert.match(post, /sameOrigin/);
    assert.match(post, /Please log in first/);
    assert.ok(post.indexOf("sameOrigin") < post.indexOf("Please log in first"));
  });

  it("a traveler-scoped link strips attachments the same way every client link does", () => {
    const fn = STORE.slice(STORE.indexOf("export async function getSharedTraveler"), STORE.indexOf("export async function getSharedTraveler") + 800);
    assert.match(fn, /withoutAttachments/);
  });

  it("ensures the trip's own share exists so the traveler's link has a chat thread to open", () => {
    const fn = STORE.slice(STORE.indexOf("export async function ensureTravelerShare"), STORE.indexOf("export async function getSharedTraveler"));
    assert.match(fn, /ensureTripShare/);
  });
});
