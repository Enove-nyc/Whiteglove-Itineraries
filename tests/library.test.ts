import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { applyLibraryPack, emptyLibraryItem, emptyLibraryPack, itemsInPack, libraryItemToProposalComponent, type LibraryItem } from "@/data/library";
import { emptyItinerary } from "@/data/itinerary";

describe("a fresh library item and pack", () => {
  it("starts with the kind it was given and nothing else", () => {
    const item = emptyLibraryItem("hotel");
    assert.equal(item.kind, "hotel");
    assert.equal(item.name, "");
  });

  it("a fresh pack starts empty, carrying only the name it was given", () => {
    const pack = emptyLibraryPack("Rome Family Trip");
    assert.equal(pack.name, "Rome Family Trip");
    assert.deepEqual(pack.itemIds, []);
  });
});

describe("turning a saved item into a proposal component", () => {
  const item: LibraryItem = {
    id: "lib-1",
    kind: "hotel",
    name: "Hotel Rossi",
    description: "Steps from the Ghetto",
    address: "Via Roma 1",
    phone: "+39 06 555 0100",
    price: 220,
    savedAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("carries every field a proposal component actually uses, under a fresh id", () => {
    const component = libraryItemToProposalComponent(item, "fresh-id");
    assert.equal(component.id, "fresh-id");
    assert.equal(component.kind, "hotel");
    assert.equal(component.name, "Hotel Rossi");
    assert.equal(component.address, "Via Roma 1");
    assert.equal(component.price, 220);
  });

  it("the same item dropped twice gets two independent ids, not one shared reference", () => {
    const a = libraryItemToProposalComponent(item, "id-a");
    const b = libraryItemToProposalComponent(item, "id-b");
    assert.notEqual(a.id, b.id);
  });
});

describe("resolving a pack's items", () => {
  const items: LibraryItem[] = [
    { id: "a", kind: "hotel", name: "Hotel A", savedAt: "t", updatedAt: "t" },
    { id: "b", kind: "activity", name: "Tour B", savedAt: "t", updatedAt: "t" },
  ];

  it("returns the items in the order the pack lists them", () => {
    const pack = { ...emptyLibraryPack("Pack"), id: "p1", itemIds: ["b", "a"] };
    const resolved = itemsInPack(pack, items);
    assert.deepEqual(resolved.map((i) => i.id), ["b", "a"]);
  });

  it("quietly drops a reference to an item that no longer exists, rather than leaving a hole", () => {
    const pack = { ...emptyLibraryPack("Pack"), id: "p1", itemIds: ["a", "deleted-item", "b"] };
    const resolved = itemsInPack(pack, items);
    assert.equal(resolved.length, 2);
    assert.ok(!resolved.some((i) => i.id === "deleted-item"));
  });
});

describe("dropping a saved pack onto a trip — \"Duplicate → Customize → Send\"", () => {
  let n = 0;
  const uid = () => `stop-${++n}`;

  const items: LibraryItem[] = [
    { id: "a", kind: "hotel", name: "Hotel Rossi", address: "Via Roma 1", phone: "+39 06 555 0100", description: "Steps from the Ghetto", savedAt: "t", updatedAt: "t" },
    { id: "b", kind: "activity", name: "Colosseum tour", notes: "Book the underground add-on", savedAt: "t", updatedAt: "t" },
  ];
  const pack = { ...emptyLibraryPack("Rome Family Trip"), id: "p1", itemIds: ["a", "b"] };

  it("adds every item as an unscheduled stop — nothing invents a date this data doesn't have", () => {
    const result = applyLibraryPack(emptyItinerary(), pack, items, uid);
    assert.equal(result.activities.length, 2);
    assert.ok(result.activities.every((a) => a.date === ""));
  });

  it("labels a non-activity item with its kind, so a hotel from the pack doesn't read as a stop to visit", () => {
    const result = applyLibraryPack(emptyItinerary(), pack, items, uid);
    const hotel = result.activities.find((a) => a.name.startsWith("Hotel:"));
    assert.equal(hotel?.name, "Hotel: Hotel Rossi");
    assert.equal(hotel?.address, "Via Roma 1");
  });

  it("an activity-kind item keeps its plain name", () => {
    const result = applyLibraryPack(emptyItinerary(), pack, items, uid);
    assert.ok(result.activities.some((a) => a.name === "Colosseum tour"));
  });

  it("names the trip after the pack only when it's still unnamed", () => {
    const untitled = applyLibraryPack(emptyItinerary(), pack, items, uid);
    assert.equal(untitled.title, "Rome Family Trip");

    const named = applyLibraryPack({ ...emptyItinerary(), title: "Our Anniversary Trip" }, pack, items, uid);
    assert.equal(named.title, "Our Anniversary Trip");
  });

  it("applying the same pack twice does not duplicate its stops", () => {
    const once = applyLibraryPack(emptyItinerary(), pack, items, uid);
    const twice = applyLibraryPack(once, pack, items, uid);
    assert.equal(twice.activities.length, 2);
  });

  it("never touches what's already on the trip", () => {
    const existing = { ...emptyItinerary(), activities: [{ id: "keep", name: "Already planned", date: "2026-06-01" }] };
    const result = applyLibraryPack(existing, pack, items, uid);
    assert.ok(result.activities.some((a) => a.id === "keep"));
    assert.equal(result.activities.length, 3);
  });
});

describe("starting a trip from the Library screen — the client-side wiring", () => {
  const MANAGER = readFileSync("components/LibraryManager.tsx", "utf8");

  it("builds the itinerary from applyLibraryPack rather than sending the pack's raw items to the server", () => {
    assert.match(MANAGER, /applyLibraryPack\(emptyItinerary\(\), pack, packItems, uid\)/);
  });

  it("reuses the trips route's own \"import\" action — the same one that adds a shared trip — rather than a new endpoint", () => {
    const fn = MANAGER.slice(MANAGER.indexOf("async function startTripFromPack"), MANAGER.indexOf("async function startTripFromPack") + 900);
    assert.match(fn, /action: "import", itinerary, name: pack\.name/);
  });

  it("a pack with nothing in it cannot be started", () => {
    assert.match(MANAGER, /disabled=\{packItems\.length === 0 \|\| startingPack === pack\.id\}/);
  });
});

describe("the library is a planner's own — never reachable by a client", () => {
  const ROUTE = readFileSync("app/api/account/library/route.ts", "utf8");

  it("is Business-gated, the same as a proposal", () => {
    assert.match(ROUTE, /mayServeCompanionClients/);
  });

  it("checks same-origin before any write", () => {
    const post = ROUTE.slice(ROUTE.indexOf("export async function POST"));
    assert.match(post, /sameOrigin/);
    assert.ok(post.indexOf("sameOrigin") < post.indexOf("switch"));
  });

  it("has no public, unauthenticated route the way a proposal or a shared itinerary does", () => {
    assert.doesNotMatch(ROUTE, /getShareOwnerEmail|getSharedProposal/);
  });
});
