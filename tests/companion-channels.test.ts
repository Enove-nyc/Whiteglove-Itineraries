import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  GENERAL_CHANNEL_ID,
  GENERAL_CHANNEL_NAME,
  createChannel,
  generalChannel,
  isKnownChannel,
  normalizeChannelId,
  readChannels,
} from "@/lib/companion-chat-store";

/**
 * Per-trip channels — the advisor splits one trip's conversation into topics
 * ("Hotel", "Flights") and both sides see them, with a General channel every
 * trip always carries. These pin the parts that hold without a live store: the
 * id hygiene, the always-present General, and the route's advisor-only fence.
 */

describe("a channel id off the wire is only ever a real shape", () => {
  it("passes General through untouched", () => {
    assert.equal(normalizeChannelId("general"), GENERAL_CHANNEL_ID);
    assert.equal(normalizeChannelId("GENERAL"), GENERAL_CHANNEL_ID);
  });

  it("strips a stored id down to lowercase alphanumerics", () => {
    assert.equal(normalizeChannelId("Ab12-CD_"), "ab12cd");
  });

  it("collapses junk — or a missing value — to General rather than addressing a key nobody meant", () => {
    assert.equal(normalizeChannelId("!!!"), GENERAL_CHANNEL_ID);
    assert.equal(normalizeChannelId(""), GENERAL_CHANNEL_ID);
    assert.equal(normalizeChannelId(undefined), GENERAL_CHANNEL_ID);
    assert.equal(normalizeChannelId(42), GENERAL_CHANNEL_ID);
  });
});

describe("every trip has a General channel with nothing to create", () => {
  it("generalChannel is the fixed id and name", () => {
    assert.deepEqual(generalChannel(), { id: GENERAL_CHANNEL_ID, name: GENERAL_CHANNEL_NAME });
  });

  it("readChannels leads with General even with no store and nothing stored", async () => {
    const list = await readChannels("no-such-trip");
    assert.equal(list[0].id, GENERAL_CHANNEL_ID);
    assert.equal(list[0].name, GENERAL_CHANNEL_NAME);
  });

  it("isKnownChannel is always true for General, and false for a made-up id with nothing stored", async () => {
    assert.equal(await isKnownChannel("no-such-trip", GENERAL_CHANNEL_ID), true);
    assert.equal(await isKnownChannel("no-such-trip", "madeup"), false);
  });

  it("createChannel says so plainly when the store is not connected, rather than pretending", async () => {
    const r = await createChannel("no-such-trip", "Flights");
    assert.ok("error" in r);
  });
});

describe("General's storage keys are the un-suffixed keys the trip's single thread always used", () => {
  const STORE = readFileSync("lib/companion-chat-store.ts", "utf8");
  it("the channel part of a key is empty for General", () => {
    // So every conversation that already exists simply becomes that trip's
    // General channel, with nothing to migrate.
    assert.match(STORE, /channelPart = \(channelId: string\) => \(channelId === GENERAL_CHANNEL_ID \? "" : `:ch:\$\{channelId\}`\)/);
  });
  it("deleteConversation walks every channel, then drops the channel list itself", () => {
    const fn = STORE.slice(STORE.indexOf("export async function deleteConversation"), STORE.indexOf("/* ---- channel list"));
    assert.match(fn, /readChannels\(shareId\)/);
    assert.match(fn, /for \(const ch of channels\)/);
    assert.match(fn, /DEL", channelsKeyFor\(shareId\)/);
  });
});

describe("the channels route: both sides read, only the advisor writes", () => {
  const ROUTE = readFileSync("app/api/companion/channels/route.ts", "utf8");
  const GET = ROUTE.slice(ROUTE.indexOf("export async function GET"), ROUTE.indexOf("export async function POST"));
  const POST = ROUTE.slice(ROUTE.indexOf("export async function POST"), ROUTE.indexOf("export async function DELETE"));
  const DEL = ROUTE.slice(ROUTE.indexOf("export async function DELETE"));

  it("GET is open to anyone holding the link and returns the channel list", () => {
    assert.match(GET, /readChannels\(who\.chatKey\)/);
    assert.doesNotMatch(GET, /who\.side !== "advisor"/);
  });

  it("POST creates a channel only for the advisor, from this site, gated and rate-limited", () => {
    assert.match(POST, /sameOrigin/);
    assert.match(POST, /who\.side !== "advisor"/);
    assert.match(POST, /rateLimit\(`companion-channel:/);
    assert.match(POST, /createChannel\(who\.chatKey, name\)/);
    assert.ok(POST.indexOf('who.side !== "advisor"') < POST.indexOf("createChannel"), "the advisor check comes before the write");
  });

  it("DELETE removes a channel only for the advisor, and never General", () => {
    assert.match(DEL, /who\.side !== "advisor"/);
    assert.match(DEL, /channel === "general"/);
    assert.match(DEL, /deleteChannel\(who\.chatKey, channel\)/);
  });
});

describe("the chat route refuses a write to a channel the trip doesn't have", () => {
  const ROUTE = readFileSync("app/api/companion/chat/route.ts", "utf8");
  it("every verb validates the channel with isKnownChannel", () => {
    // GET, PATCH, DELETE and POST each normalise the channel and check it is
    // one this trip really has before touching the store.
    const matches = ROUTE.match(/isKnownChannel\(who\.chatKey, channel\)/g) ?? [];
    assert.ok(matches.length >= 4, `expected the channel gate on every verb, saw ${matches.length}`);
  });
});
