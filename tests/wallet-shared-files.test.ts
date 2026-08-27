import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sharedAttachmentIds, travelerAttachments, withoutAttachments } from "@/lib/attachments";
import { codeOf } from "./helpers/source";

const file = (id: string, shared?: boolean) => ({
  id,
  kind: "boarding-pass",
  name: `${id}.pdf`,
  contentType: "application/pdf",
  bytes: 1024,
  addedAt: "2026-08-26T00:00:00Z",
  ...(shared === undefined ? {} : { shared }),
});

const trip = () => ({
  flights: [{ id: "f1", attachments: [file("pass", true), file("invoice", false)] }],
  lodging: [{ id: "l1", attachments: [file("conf")] }],
  activities: [{ id: "a1" }],
});

describe("what the traveler is handed", () => {
  it("keeps the files the adviser sent them", () => {
    const seen = travelerAttachments(trip());
    assert.deepEqual(seen.flights[0].attachments?.map((a) => a.id), ["pass"]);
  });

  it("does not mention the ones they were not sent", () => {
    // Present-and-refused tells them a document exists and is being withheld,
    // which is a worse answer than silence.
    const seen = travelerAttachments(trip());
    assert.equal("attachments" in seen.lodging[0], false, "an unshared file left a reference behind");
    assert.equal(JSON.stringify(seen).includes("invoice"), false);
  });

  it("treats a file with no flag at all as private", () => {
    // Everything uploaded before the flag existed. A default of shared would
    // have published a folder of documents nobody chose to publish.
    const seen = travelerAttachments({ flights: [{ id: "f1", attachments: [file("old")] }] });
    assert.equal("attachments" in seen.flights[0], false);
  });

  it("leaves a row that never had one alone", () => {
    const seen = travelerAttachments(trip());
    assert.deepEqual(seen.activities[0], { id: "a1" });
  });

  it("is not the same thing as the print, which still carries none", () => {
    const printed = withoutAttachments(trip());
    assert.equal("attachments" in printed.flights[0], false);
  });
});

describe("which files a code may open", () => {
  it("is exactly the shared ones", () => {
    const ids = sharedAttachmentIds(trip());
    assert.deepEqual([...ids], ["pass"]);
  });

  it("is empty for a trip where nothing was sent", () => {
    assert.equal(sharedAttachmentIds({ flights: [{ attachments: [file("x")] }] }).size, 0);
  });
});

describe("the route that serves one", () => {
  const route = codeOf("app/api/trip-file/[shareId]/route.ts");

  it("checks the code, the trip and the flag — all three", () => {
    assert.match(route, /getSharedItineraryByShareId\(shareId\)/);
    assert.match(route, /sharedAttachmentIds\(shared\.itinerary\)\.has\(id\)/);
  });

  it("asks the store as the owner it resolved, never as anything in the request", () => {
    assert.match(route, /getAttachmentFor\(id, shared\.ownerEmail\)/);
    assert.doesNotMatch(route, /searchParams\.get\("(email|owner|account)"\)/);
  });

  it("answers the same way for missing and forbidden", () => {
    const notFound = [...route.matchAll(/status: 404/g)];
    assert.ok(notFound.length >= 3, "a refusal that reads differently from a miss tells somebody a file exists");
    assert.doesNotMatch(route, /status: 403/);
  });

  it("is rate limited, uncached, and never indexed", () => {
    assert.match(route, /rateLimit\(`trip-file:/);
    assert.match(route, /"cache-control": "private, no-store, max-age=0"/);
    assert.match(route, /x-robots-tag/);
    assert.match(route, /sandbox/);
  });
});

describe("the two doors", () => {
  it("the shared trip hands back only what the traveler may see", () => {
    assert.match(codeOf("lib/account-store.ts"), /itinerary: travelerAttachments\(itinerary\)/);
  });

  it("a client opens a file through the trip's code, not through an account", () => {
    const app = codeOf("components/companion/CompanionApp.tsx");
    assert.match(app, /isClientViewer\s*\n?\s*\? `\/api\/trip-file\//);
    assert.match(app, /: `\/api\/account\/attachments\?id=/);
  });

  it("the toggle is offered to the side that owns the trip, and never to the client", () => {
    const app = codeOf("components/companion/CompanionApp.tsx");
    assert.match(app, /\{!isClientViewer && trip\.tripId && r\.id && r\.stopKind && \(\s*\n\s*<WalletShareToggle/);
  });
});
