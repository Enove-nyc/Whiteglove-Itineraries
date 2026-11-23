import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// A traveler-scoped /t/[shareId] link is meant to see a REDACTED trip — see
// redactForTraveler in data/itinerary.ts. It used to also leak the trip's
// own whole-trip share token (getSharedTraveler's old `tripShareId` field)
// straight into the browser as the chat prop, which is a strictly MORE
// powerful credential: /i/[shareId] opens that same token completely
// unredacted. A traveler could read it out of the page's own network
// traffic and use it to see every other family's private notes, email and
// phone. Fixed by never sending that token to a browser at all — see
// resolveCompanionShare in lib/account-store.ts.

describe("a traveler-scoped link can never hand out the trip's own unredacted token", () => {
  const TRAVELER_PAGE = readFileSync("app/t/[shareId]/app/page.tsx", "utf8");
  const STORE = readFileSync("lib/account-store.ts", "utf8");
  const CHAT_ROUTE = readFileSync("app/api/companion/chat/route.ts", "utf8");
  const REPORT_ROUTE = readFileSync("app/api/companion/report/route.ts", "utf8");

  it("the chat prop handed to the client component is this traveler's own token, not a resolved one", () => {
    const chatBlock = TRAVELER_PAGE.slice(TRAVELER_PAGE.indexOf("const chat = {"), TRAVELER_PAGE.indexOf("const chat = {") + 240);
    assert.match(chatBlock, /shareId,/);
    assert.match(chatBlock, /side: organizer \? "advisor" as const : "client"/);
    assert.doesNotMatch(chatBlock, /internalChatKey/);
  });

  it("getSharedTraveler documents internalChatKey as server-side only, never to be sent to a browser", () => {
    const idx = STORE.indexOf("export async function getSharedTraveler");
    const docStart = STORE.lastIndexOf("/**", idx);
    const fn = STORE.slice(docStart, idx + 400);
    assert.match(fn, /NEVER send this field to a/);
    assert.match(fn, /browser or echo it in an API response/);
  });

  it("resolveCompanionShare exists and accepts either a whole-trip or a traveler-scoped token", () => {
    assert.match(STORE, /export async function resolveCompanionShare/);
    const fn = STORE.slice(STORE.indexOf("export async function resolveCompanionShare"));
    assert.match(fn, /getShareOwnerEmail/);
    assert.match(fn, /getSharedTraveler/);
  });

  it("the chat route resolves through resolveCompanionShare rather than the trip-only getShareOwnerEmail", () => {
    assert.match(CHAT_ROUTE, /resolveCompanionShare/);
    assert.doesNotMatch(CHAT_ROUTE, /getShareOwnerEmail/);
  });

  it("every chat storage/rate-limit call inside the route uses the resolved chatKey, never the raw request token", () => {
    for (const fn of ["readChat", "markRead", "readMarkers", "isTyping", "setTyping", "quoteFor", "editMessageText", "deleteMessage", "appendChat"]) {
      const re = new RegExp(`${fn}\\(who\\.chatKey`);
      assert.match(CHAT_ROUTE, re, `${fn} should be called with who.chatKey`);
    }
    assert.doesNotMatch(CHAT_ROUTE, /appendChat\(shareId/);
  });

  it("the report route resolves through resolveCompanionShare too, and uses the resolved key", () => {
    assert.match(REPORT_ROUTE, /resolveCompanionShare/);
    assert.match(REPORT_ROUTE, /appendReport\(chatKey/);
  });
});

describe("revoking a client's link takes their push subscription with it", () => {
  const STORE = readFileSync("lib/account-store.ts", "utf8");

  it("stopTripShare clears pushSubscriptions, not just shareId and collaborators", () => {
    // A device that opted into push while the link was live has no business
    // still getting trip-change notifications once the advisor has revoked
    // it. notifySubscribers is called whenever a flight-status check finds
    // something new and reads pushSubscriptions straight off the trip — it
    // never itself checks whether shareId is still set — so leaving the old
    // subscription in place would mean it keeps receiving delay/cancel/gate
    // copy for a trip the client can no longer even open.
    const fn = STORE.slice(STORE.indexOf("export async function stopTripShare"), STORE.indexOf("async function upsertSharedWith"));
    assert.match(fn, /pushSubscriptions: \[\]/);
  });
});
