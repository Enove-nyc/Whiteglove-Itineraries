import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseChatMessages, quoteFor, REACTION_EMOJIS } from "@/lib/companion-chat-store";

/**
 * The concierge thread: text, a picture, a video, a voice note, or a place —
 * and a way to report one.
 *
 * TWO THINGS THIS PINS. First, the back-compatibility that a stored thread is
 * fragile about: every message written before pictures existed has no `kind`,
 * and must still read as text so an old conversation does not vanish. Second,
 * the fences around the messages a client with no account can push real bytes
 * with — a picture, a video, a voice note — which are checked in the route
 * source, the same way business-trips.test.ts checks its gates, because the
 * property is that the checks are PRESENT and come before the work.
 */

describe("reading a stored thread", () => {
  it("reads an old text-only row that has no kind", () => {
    const [m] = parseChatMessages([JSON.stringify({ from: "client", text: "hello", at: "2026-01-01T00:00:00Z" })]);
    assert.equal(m.kind, "text");
    assert.equal(m.text, "hello");
  });

  it("reads a picture, a video, a voice note and a place", () => {
    const rows = [
      JSON.stringify({ from: "advisor", kind: "image", text: "the square", mediaId: "m-1-a", at: "t1" }),
      JSON.stringify({ from: "advisor", kind: "video", text: "the walk over", mediaId: "m-1-b", at: "t1b" }),
      JSON.stringify({ from: "client", kind: "audio", text: "", mediaId: "m-1-c", at: "t1c" }),
      JSON.stringify({ from: "client", kind: "location", text: "I'm here", lat: 41.9, lng: 12.5, at: "t2" }),
    ];
    const out = parseChatMessages(rows);
    assert.equal(out[0].kind, "image");
    assert.equal(out[0].mediaId, "m-1-a");
    assert.equal(out[1].kind, "video");
    assert.equal(out[1].mediaId, "m-1-b");
    assert.equal(out[2].kind, "audio");
    assert.equal(out[2].mediaId, "m-1-c");
    assert.equal(out[3].kind, "location");
    assert.equal(out[3].lat, 41.9);
  });

  it("reads a place shared by its own address — a trip stop, not a device fix", () => {
    const [m] = parseChatMessages([
      JSON.stringify({ from: "advisor", kind: "location", text: "The Grand Hotel", address: "Via Roma 1, Rome", at: "t4" }),
    ]);
    assert.equal(m.kind, "location");
    assert.equal(m.address, "Via Roma 1, Rome");
    assert.equal(m.lat, undefined);
  });

  it("drops a broken picture, video, voice note or place rather than showing an empty bubble", () => {
    const rows = [
      JSON.stringify({ from: "advisor", kind: "image", text: "", at: "t1" }), // no mediaId
      JSON.stringify({ from: "advisor", kind: "video", text: "", at: "t1b" }), // no mediaId
      JSON.stringify({ from: "client", kind: "audio", text: "", at: "t1c" }), // no mediaId
      JSON.stringify({ from: "client", kind: "location", text: "", at: "t2" }), // no coordinates
      JSON.stringify({ from: "client", kind: "text", text: "still here", at: "t3" }),
    ];
    const out = parseChatMessages(rows);
    assert.equal(out.length, 1);
    assert.equal(out[0].text, "still here");
  });

  it("skips a corrupt row without dropping the rest of the thread", () => {
    const out = parseChatMessages(["not json", JSON.stringify({ from: "client", text: "ok", at: "t" })]);
    assert.equal(out.length, 1);
  });

  it("refuses a row from neither side", () => {
    assert.equal(parseChatMessages([JSON.stringify({ from: "someone", text: "x", at: "t" })]).length, 0);
  });

  it("keeps an edited message's new words, and says it was edited", () => {
    const [m] = parseChatMessages([JSON.stringify({ from: "client", kind: "text", text: "actually Tuesday", editedAt: "t2", at: "t1" })]);
    assert.equal(m.text, "actually Tuesday");
    assert.equal(m.editedAt, "t2");
  });

  it("strips a deleted message down to nothing a client could act on", () => {
    // Whatever it carried — a caption, a picture's id, a place's coordinates —
    // must not survive being read back, or "deleted" would only mean "hidden".
    const rows = [
      JSON.stringify({ from: "advisor", kind: "text", text: "the old plan", deletedAt: "t9", at: "t1" }),
      JSON.stringify({ from: "client", kind: "image", text: "oops", mediaId: "m-1", deletedAt: "t9", at: "t2" }),
      JSON.stringify({ from: "client", kind: "location", text: "here", lat: 41.9, lng: 12.5, deletedAt: "t9", at: "t3" }),
    ];
    const out = parseChatMessages(rows);
    assert.equal(out.length, 3);
    for (const m of out) {
      assert.equal(m.deletedAt, "t9");
      assert.equal(m.text, "");
      assert.equal(m.mediaId, undefined);
      assert.equal(m.lat, undefined);
      assert.equal(m.lng, undefined);
    }
    // The kind is kept — the tombstone bubble still knows it was a picture, a
    // place or a plain message, even though it renders none of the content.
    assert.equal(out[1].kind, "image");
    assert.equal(out[2].kind, "location");
  });
});

describe("sending a picture, video or voice note is fenced", () => {
  const ROUTE = readFileSync("app/api/companion/chat/route.ts", "utf8");
  const mediaBranch = ROUTE.slice(ROUTE.indexOf("body.dataUrl"), ROUTE.indexOf("A place"));

  it("comes only from this site, checked before anything is read", () => {
    const body = ROUTE.slice(ROUTE.indexOf("export async function POST"));
    assert.match(body, /sameOrigin/);
    assert.ok(body.indexOf("sameOrigin") < body.indexOf("sideFor"), "same-origin is the first gate");
  });

  it("is rate limited before it stores anything, with its own counter per kind", () => {
    assert.match(mediaBranch, /rateLimit\(`companion-\$\{media\.kind\}:/);
    assert.ok(mediaBranch.indexOf("rateLimit") < mediaBranch.indexOf("putMedia"), "the limit must be counted before the write");
  });

  it("checks the type and the size before it stores anything", () => {
    assert.match(mediaBranch, /mediaKindFor\(contentType\)/);
    assert.match(mediaBranch, /media\.available\(\)/);
    assert.ok(mediaBranch.indexOf("mediaKindFor") < mediaBranch.indexOf("putMedia"));
    assert.ok(mediaBranch.indexOf("media.limit") < mediaBranch.indexOf("putMedia"));
  });

  it("only accepts photograph, clip and voice-note types, not every media type the store takes", () => {
    // The media store also accepts PDFs and GIFs; chat is a photo, a clip or a
    // recorded voice note, nothing else.
    assert.match(ROUTE, /CHAT_IMAGE_TYPES = new Set\(\["image\/jpeg", "image\/png", "image\/webp"\]\)/);
    assert.match(ROUTE, /CHAT_VIDEO_TYPES = new Set\(\["video\/mp4", "video\/quicktime", "video\/webm"\]\)/);
    assert.match(ROUTE, /CHAT_AUDIO_TYPES = new Set\(\["audio\/webm", "audio\/mp4", "audio\/mpeg", "audio\/ogg"\]\)/);
  });

  it("gives video and audio their own ceiling — the disk-only limits, not the image one", () => {
    assert.match(ROUTE, /video.*limit: MAX_CHAT_VIDEO_BYTES.*available: videoUploadsAvailable/);
    assert.match(ROUTE, /audio.*limit: MAX_CHAT_AUDIO_BYTES.*available: audioUploadsAvailable/);
  });

  it("validates a shared location's coordinates", () => {
    assert.match(ROUTE, /Math\.abs\(body\.lat\) > 90/);
    assert.match(ROUTE, /Math\.abs\(body\.lng\) > 180/);
  });

  it("also accepts a trip stop shared by its own address, not only a device fix", () => {
    assert.match(ROUTE, /typeof body\?\.address === "string" && body\.address\.trim\(\)/);
    assert.match(ROUTE, /address: body\.address\.trim\(\)\.slice\(0, MAX_CHAT_LABEL\)/);
  });
});

describe("reading the thread also marks it read", () => {
  const ROUTE = readFileSync("app/api/companion/chat/route.ts", "utf8");
  const GET = ROUTE.slice(ROUTE.indexOf("export async function GET"), ROUTE.indexOf("export async function PATCH"));

  it("records this side's own marker at the newest message, and returns both sides' markers", () => {
    assert.match(GET, /markRead\(who\.chatKey, who\.side, latest\.at\)/);
    assert.match(GET, /readMarkers: await readMarkers\(who\.chatKey\)/);
    assert.ok(GET.indexOf("markRead") < GET.indexOf("readMarkers:"), "the poll's own read is recorded before the response is built");
  });
});

describe("changing or removing a message is fenced", () => {
  const ROUTE = readFileSync("app/api/companion/chat/route.ts", "utf8");
  const PATCH = ROUTE.slice(ROUTE.indexOf("export async function PATCH"), ROUTE.indexOf("export async function DELETE"));
  const DEL = ROUTE.slice(ROUTE.indexOf("export async function DELETE"));

  it("both check same-origin before touching the store", () => {
    assert.match(PATCH, /sameOrigin/);
    assert.match(DEL, /sameOrigin/);
    assert.ok(PATCH.indexOf("sameOrigin") < PATCH.indexOf("sideFor"));
    assert.ok(DEL.indexOf("sameOrigin") < DEL.indexOf("sideFor"));
  });

  it("edit is rate limited before the write, and ownership is proven by who.side, never the request body", () => {
    assert.match(PATCH, /rateLimit\(`companion-edit:/);
    assert.ok(PATCH.indexOf("rateLimit") < PATCH.indexOf("editMessageText"));
    // The side passed to the store is the one sideFor() worked out from the
    // session, not anything the caller could put in the JSON body.
    assert.match(PATCH, /editMessageText\(who\.chatKey, at, who\.side, text/);
  });

  it("delete proves ownership the same way", () => {
    assert.match(DEL, /deleteMessage\(who\.chatKey, at, who\.side\)/);
  });
});

describe("the thread is Business-only, like the app it belongs to", () => {
  // The client app page and the inbox are gated on mayServeCompanionClients;
  // the chat and report routes are the write path behind them and must carry
  // the SAME gate, or a share link from any plan becomes a way to push chat
  // and hosted images the product otherwise withholds.
  it("gates the chat route on the owner's plan, before a side is read", () => {
    const ROUTE = readFileSync("app/api/companion/chat/route.ts", "utf8");
    const sideFor = ROUTE.slice(ROUTE.indexOf("async function sideFor"), ROUTE.indexOf("export async function GET"));
    assert.match(sideFor, /mayServeCompanionClients\(await getPlan\(owner\)\)/);
    assert.ok(sideFor.indexOf("mayServeCompanionClients") < sideFor.indexOf("accountCookieName"), "the plan is checked before the side is worked out");
  });

  it("gates the report route on the owner's plan too", () => {
    const ROUTE = readFileSync("app/api/companion/report/route.ts", "utf8");
    const body = ROUTE.slice(ROUTE.indexOf("export async function POST"));
    assert.match(body, /mayServeCompanionClients\(await getPlan\(owner\)\)/);
    assert.ok(body.indexOf("mayServeCompanionClients") < body.indexOf("appendReport"), "gate before recording");
  });
});

describe("reporting a message is fenced", () => {
  const ROUTE = readFileSync("app/api/companion/report/route.ts", "utf8");

  it("comes only from this site, is rate limited, and records the report", () => {
    const body = ROUTE.slice(ROUTE.indexOf("export async function POST"));
    assert.match(body, /sameOrigin/);
    assert.match(body, /rateLimit\(`companion-report:/);
    assert.match(body, /appendReport/);
    assert.ok(body.indexOf("rateLimit") < body.indexOf("appendReport"), "count the limit before recording");
  });

  it("reads who is reporting from the link, never from the request body", () => {
    // The side is derived from the share owner + session, the same as the chat
    // route — a client cannot claim to be the advisor.
    assert.match(ROUTE, /resolveCompanionShare/);
    assert.match(ROUTE, /identityKey\(account\.email\) === identityKey\(owner\)/);
  });
});

describe("a reply quotes a real message, never a client-supplied one", () => {
  const ROUTE = readFileSync("app/api/companion/chat/route.ts", "utf8");
  const POST = ROUTE.slice(ROUTE.indexOf("export async function POST"));

  it("looks the quote up server-side from replyToAt, never takes quoted text from the body", () => {
    assert.match(POST, /quoteFor\(who\.chatKey, body\.replyToAt\)/);
    assert.doesNotMatch(POST, /replyTo:\s*body\.replyTo/);
  });

  it("attaches the same replyTo to every kind of send — media, location and text", () => {
    const mediaBranch = POST.slice(POST.indexOf("body.dataUrl"), POST.indexOf("A place"));
    const locationBranch = POST.slice(POST.indexOf("A place"), POST.indexOf("// Words."));
    const textBranch = POST.slice(POST.indexOf("// Words."));
    for (const branch of [mediaBranch, locationBranch, textBranch]) {
      assert.match(branch, /appendChat\(who\.chatKey, \{[\s\S]*replyTo,[\s\S]*?\}\)/);
    }
  });

  it("returns nothing for a stale or made-up `at` rather than failing the send", async () => {
    assert.equal(await quoteFor("no-such-share-id", "no-such-at"), undefined);
  });
});

describe("an itinerary reference is sanitized and carried on every kind of send", () => {
  const ROUTE = readFileSync("app/api/companion/chat/route.ts", "utf8");
  const POST = ROUTE.slice(ROUTE.indexOf("export async function POST"));

  it("is trimmed and capped the same way a caption is, never trusted raw", () => {
    assert.match(POST, /body\?\.itineraryRef === "string" && body\.itineraryRef\.trim\(\)/);
    assert.match(POST, /body\.itineraryRef\.trim\(\)\.slice\(0, MAX_CHAT_LABEL\)/);
  });

  it("attaches to media, location and text sends alike", () => {
    const mediaBranch = POST.slice(POST.indexOf("body.dataUrl"), POST.indexOf("A place"));
    const locationBranch = POST.slice(POST.indexOf("A place"), POST.indexOf("// Words."));
    const textBranch = POST.slice(POST.indexOf("// Words."));
    for (const branch of [mediaBranch, locationBranch, textBranch]) {
      assert.match(branch, /appendChat\(who\.chatKey, \{[\s\S]*itineraryRef,[\s\S]*?\}\)/);
    }
  });
});

describe("typing is a courtesy signal, not a message", () => {
  const ROUTE = readFileSync("app/api/companion/chat/route.ts", "utf8");
  const POST = ROUTE.slice(ROUTE.indexOf("export async function POST"));

  it("short-circuits before a reply is even looked up, and carries no rate limit", () => {
    assert.match(POST, /body\?\.typing === true/);
    assert.ok(POST.indexOf("body?.typing === true") < POST.indexOf("quoteFor"), "typing returns before a quote is looked up");
  });

  it("GET reports the OTHER side's typing state, never this side's own", () => {
    const GET = ROUTE.slice(ROUTE.indexOf("export async function GET"), ROUTE.indexOf("export async function PATCH"));
    assert.match(GET, /isTyping\(who\.chatKey, otherSideOf\(who\.side\)\)/);
  });
});

describe("a peek does not mark the thread read", () => {
  const ROUTE = readFileSync("app/api/companion/chat/route.ts", "utf8");
  const GET = ROUTE.slice(ROUTE.indexOf("export async function GET"), ROUTE.indexOf("export async function PATCH"));

  it("only marks read when ?peek=1 was not sent", () => {
    assert.match(GET, /searchParams\.get\("peek"\) === "1"/);
    assert.match(GET, /if \(!peek\)/);
    assert.ok(GET.indexOf('searchParams.get("peek")') < GET.indexOf("markRead"), "peek is read before markRead runs");
  });

  it("still reports the server's real picture size limit either way", () => {
    assert.match(GET, /imageLimit: effectiveMediaLimit\(\)/);
  });
});

describe("deleting a whole conversation is fenced", () => {
  const ROUTE = readFileSync("app/api/companion/chats/route.ts", "utf8");
  const DEL = ROUTE.slice(ROUTE.indexOf("export async function DELETE"));

  it("comes only from this site, and needs the account signed in", () => {
    assert.match(DEL, /sameOrigin/);
    assert.match(DEL, /account\?\.email/);
    assert.ok(DEL.indexOf("sameOrigin") < DEL.indexOf("account?.email"), "same-origin is checked before the account is even read");
  });

  it("is gated the same as the inbox it clears", () => {
    assert.match(DEL, /mayServeCompanionClients\(await getPlan\(account\.email\)\)/);
  });

  it("proves the conversation belongs to THIS account before clearing it — never trusts the share id alone", () => {
    // Otherwise any signed-in advisor could clear any other advisor's
    // conversation just by knowing (or guessing) their client's share id.
    const body = DEL.slice(DEL.indexOf("const shareId"));
    assert.match(body, /getTrips\(account\.email\)/);
    assert.match(body, /t\.shareId === shareId/);
    assert.ok(body.indexOf("getTrips") < body.indexOf("deleteConversation"), "ownership is proven before the store is touched");
  });

  it("does not touch the trip or share link — only deleteConversation is called", () => {
    const body = DEL.slice(DEL.indexOf("const owns"));
    assert.match(body, /await deleteConversation\(shareId\)/);
    assert.doesNotMatch(body, /stopTripShare|deleteTrip|removeTrip/);
  });

  it("clearing a conversation also clears both sides' typing signal, not just the messages", () => {
    const STORE = readFileSync("lib/companion-chat-store.ts", "utf8");
    const fn = STORE.slice(STORE.indexOf("export async function deleteConversation"), STORE.indexOf("/* ---- read markers"));
    assert.match(fn, /DEL", typingKeyFor\(shareId, "client"\)/);
    assert.match(fn, /DEL", typingKeyFor\(shareId, "advisor"\)/);
  });
});

describe("reactions — one emoji per side, both people see both", () => {
  it("keeps a valid reaction and its side", () => {
    const [m] = parseChatMessages([
      JSON.stringify({ from: "advisor", text: "hi", at: "t", reactions: { client: "❤️" } }),
    ]);
    assert.deepEqual(m.reactions, { client: "❤️" });
  });

  it("drops an unknown emoji and an unknown side, keeps the good one", () => {
    const [m] = parseChatMessages([
      JSON.stringify({ from: "advisor", text: "hi", at: "t", reactions: { client: "🐸", advisor: "👍", nobody: "❤️" } }),
    ]);
    assert.deepEqual(m.reactions, { advisor: "👍" });
  });

  it("a message with no valid reactions carries none", () => {
    const [m] = parseChatMessages([
      JSON.stringify({ from: "advisor", text: "hi", at: "t", reactions: { client: "not-an-emoji" } }),
    ]);
    assert.equal(m.reactions, undefined);
  });

  it("a deleted message keeps no reactions", () => {
    const [m] = parseChatMessages([
      JSON.stringify({ from: "advisor", text: "hi", at: "t", deletedAt: "t2", reactions: { client: "❤️" } }),
    ]);
    assert.equal(m.reactions, undefined);
  });

  it("reactMessage rejects a made-up emoji and toggles the same one off", () => {
    const STORE = readFileSync("lib/companion-chat-store.ts", "utf8");
    const fn = STORE.slice(STORE.indexOf("export async function reactMessage"), STORE.indexOf("* Delete one message"));
    assert.match(fn, /if \(!REACTION_SET\.has\(emoji\)\) return null/);
    assert.match(fn, /if \(reactions\[by\] === emoji\) delete reactions\[by\]/);
  });

  it("the route stores a reaction only through reactMessage, from the link's own side", () => {
    const ROUTE = readFileSync("app/api/companion/chat/route.ts", "utf8");
    const POST = ROUTE.slice(ROUTE.indexOf("export async function POST"));
    assert.match(POST, /reactMessage\(who\.chatKey, body\.reactAt, who\.side, body\.reaction\)/);
    assert.match(POST, /rateLimit\(`companion-react:/);
  });

  it("offers exactly the six agreed emoji", () => {
    assert.deepEqual([...REACTION_EMOJIS], ["❤️", "👍", "😂", "😮", "😢", "🙏"]);
  });
});
