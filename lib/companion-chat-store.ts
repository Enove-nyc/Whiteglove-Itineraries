/**
 * The chat thread on a trip — between the client holding the app link and the
 * advisor who planned it.
 *
 * KEYED BY THE TRIP'S SHARE TOKEN, not by an account. The token is the trip's
 * public address (lib/account-store.ts), the same one the client's app link
 * carries, so the client — who has no account — and the advisor are talking in
 * the same place: the one trip that token belongs to. Sharing a trip is what
 * opens the channel; there is no thread until there is a link.
 *
 * Stored as a Redis list, appended to and trimmed, so two messages arriving
 * together do not overwrite each other the way a read-modify-write of one JSON
 * blob would. Without the private store connected there is no thread, and the
 * app says so rather than pretending a message was delivered.
 */

export type CompanionChatSide = "client" | "advisor";

/**
 * What a message carries. A plain message is "text"; the concierge and the
 * traveller can also send a picture, a short video, a voice note, or their
 * current place, so the advisor can see and hear what they are looking at
 * rather than only read about it.
 */
export type CompanionChatKind = "text" | "image" | "video" | "audio" | "file" | "location";

export type CompanionChatMessage = {
  from: CompanionChatSide;
  /**
   * What this message is. ABSENT ON OLDER ROWS, and that is deliberate — every
   * message written before pictures existed is a text message, so a missing
   * kind reads as "text" and nothing already in a thread changes.
   */
  kind?: CompanionChatKind;
  /** The words: the message itself, a picture/video's caption, or a place's label. May be "". */
  text: string;
  /** kind "image", "video" or "audio": the media-store id, served back through /api/media. */
  mediaId?: string;
  /** kind "location": a point the other side can open in a map — the
   *  sender's own device fix. */
  lat?: number;
  lng?: number;
  /**
   * kind "location", alternative to lat/lng: a place's own street address,
   * shared from the itinerary rather than found by the sender's device —
   * the hotel, the restaurant, the activity, not "where I am standing".
   */
  address?: string;
  /** ISO timestamp. */
  at: string;
  /**
   * Set once the sender edits this message's text — a text message only; a
   * picture or a place is sent again rather than changed. The original is
   * gone once this is set: there is no history to page through, only the
   * words as they now stand and the honest word "edited" beside them.
   */
  editedAt?: string;
  /**
   * Set once the sender deletes this message. The row stays — deleting it
   * outright would shift every other message's position in the list the
   * store and the edit/delete lookups both address by, and the other side
   * would see a conversation that silently lost a turn — but everything the
   * row carried is gone: parseChatMessages strips the text, mediaId and
   * coordinates from anything deleted before it ever leaves the store.
   */
  deletedAt?: string;
  /**
   * A quoted reply — a snapshot taken from the ORIGINAL message at the moment
   * this one was sent, not a live reference. So it survives the original
   * being edited or deleted afterwards (the quote still reads as it did when
   * this reply was written), and a reply never has to look anything up to
   * render. Built server-side from a real message in this same thread — see
   * quoteFor() — never trusted from the client, or a reply could quote words
   * nobody ever actually sent.
   */
  replyTo?: {
    at: string;
    from: CompanionChatSide;
    kind: CompanionChatKind;
    /** A short snippet — the words, or what to call a picture/video/voice
     *  note/place when there are none to show. */
    text: string;
  };
  /**
   * A short label for the day or activity this message was started from —
   * "Day 3 — The Colosseum" — set once, when "Ask about this" opens the
   * thread. Plain display text, not sensitive: the same trust level as the
   * message's own words, just capped and stripped the same way.
   */
  itineraryRef?: string;
};

/** The most a text message may carry, and the most a thread keeps. */
export const MAX_CHAT_TEXT = 2000;
/** A caption on a picture, or a label on a place — short, not a message. */
export const MAX_CHAT_LABEL = 140;
const MAX_THREAD = 200;

export function chatStoreAvailable(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

const keyFor = (shareId: string) => `white-glove:companion-chat:${shareId}`;

async function command<T>(args: (string | number)[]): Promise<T | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(url.replace(/\/$/, ""), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as { result?: T };
    return payload.result ?? null;
  } catch {
    return null;
  }
}

/** A stored kind we recognise, or "text" — an old or unknown row is text. */
function kindOf(raw: unknown): CompanionChatKind {
  return raw === "image" || raw === "video" || raw === "audio" || raw === "file" || raw === "location" ? raw : "text";
}

/**
 * Turn stored rows into messages, dropping anything malformed.
 *
 * Exported so the back-compatibility that matters most — a thread written
 * before pictures existed must still read, every row as text — can be pinned
 * by a test without a live store.
 */
export function parseChatMessages(rows: string[] | null): CompanionChatMessage[] {
  if (!rows) return [];
  const out: CompanionChatMessage[] = [];
  for (const row of rows) {
    try {
      const m = JSON.parse(row) as CompanionChatMessage;
      if (!m || (m.from !== "client" && m.from !== "advisor") || typeof m.text !== "string") continue;
      if (typeof m.deletedAt === "string") {
        // Everything the message carried is gone the moment it is deleted —
        // never just hidden client-side, where a curious poke at the network
        // tab would still find the picture.
        out.push({ from: m.from, kind: kindOf(m.kind), text: "", at: m.at, deletedAt: m.deletedAt });
        continue;
      }
      const kind = kindOf(m.kind);
      // A picture, video or voice note with no file, or a place with neither
      // a coordinate nor an address, is a broken row, not a message — skip it
      // rather than render an empty bubble.
      if ((kind === "image" || kind === "video" || kind === "audio" || kind === "file") && typeof m.mediaId !== "string") continue;
      if (kind === "location" && !(Number.isFinite(m.lat) && Number.isFinite(m.lng)) && !(typeof m.address === "string" && m.address.trim())) continue;
      out.push({ ...m, kind });
    } catch {
      /* skip a corrupt row rather than drop the thread */
    }
  }
  return out;
}

/** The whole thread for a trip, oldest first. */
export async function readChat(shareId: string): Promise<CompanionChatMessage[]> {
  return parseChatMessages(await command<string[]>(["LRANGE", keyFor(shareId), 0, -1]));
}

/**
 * Add one message and return the thread as it now stands.
 *
 * `at` is stamped by the caller (the route) rather than here — this module has
 * no business reading the clock, and the route already has `now`.
 */
export async function appendChat(
  shareId: string,
  message: CompanionChatMessage,
): Promise<CompanionChatMessage[]> {
  if (!chatStoreAvailable()) return [];
  const key = keyFor(shareId);
  await command(["RPUSH", key, JSON.stringify(message)]);
  await command(["LTRIM", key, -MAX_THREAD, -1]);
  return readChat(shareId);
}

/** A short label for a message with nothing to show as its own words. */
function quoteLabelFor(m: CompanionChatMessage): string {
  const kind = kindOf(m.kind);
  if (kind === "image") return "Photo";
  if (kind === "video") return "Video";
  if (kind === "audio") return "Voice note";
  if (kind === "location") return m.text || "Location";
  return m.text;
}

/** How much of a quoted message's words a reply carries. Shorter than a
 *  caption — this is context for a reply, not the message itself. */
const MAX_QUOTE_TEXT = 120;

/**
 * The snapshot a reply carries of the message it quotes — built from a real
 * row in THIS thread, never from anything the client sends. A stale or
 * fabricated `at` (the wrong trip, a made-up id) quietly means the reply is
 * sent as a plain message rather than failing the whole send over it.
 */
export async function quoteFor(shareId: string, at: string): Promise<CompanionChatMessage["replyTo"] | undefined> {
  const thread = await readChat(shareId);
  const original = thread.find((m) => m.at === at);
  if (!original) return undefined;
  return { at: original.at, from: original.from, kind: kindOf(original.kind), text: quoteLabelFor(original).slice(0, MAX_QUOTE_TEXT) };
}

/**
 * Find one message's position in the list by its `at` and who sent it — the
 * only two things a caller off the wire can be asked to prove they know, and
 * together they identify one row because `at` is stamped once, by the server,
 * when the message was first written.
 *
 * A list has no other address for "the message I am looking at" — it is not a
 * hash keyed by id — so editing or deleting one means finding its index first,
 * then changing that index with LSET. There is no lock across the two steps;
 * for a thread this size (one advisor, one client) the chance of a second
 * write landing between them is the same chance as two people editing the
 * same message in the same second, which is not a case worth building for.
 */
async function findRawIndex(shareId: string, at: string, from: CompanionChatSide): Promise<{ index: number; raw: string } | null> {
  const rows = await command<string[]>(["LRANGE", keyFor(shareId), 0, -1]);
  if (!rows) return null;
  for (let i = 0; i < rows.length; i++) {
    try {
      const m = JSON.parse(rows[i]) as CompanionChatMessage;
      if (m.at === at && m.from === from) return { index: i, raw: rows[i] };
    } catch {
      /* not this one */
    }
  }
  return null;
}

/**
 * Change a text message's words. Text only — a picture or a place is sent
 * again, not edited — and only the side that sent it, checked here as well as
 * by the route, the same belt-and-braces every other write in this file gets.
 *
 * Returns the thread as it now stands, or null when there was nothing at that
 * address to change (already deleted, wrong sender, or a stale `at`).
 */
export async function editMessageText(
  shareId: string,
  at: string,
  by: CompanionChatSide,
  text: string,
): Promise<CompanionChatMessage[] | null> {
  if (!chatStoreAvailable()) return null;
  const found = await findRawIndex(shareId, at, by);
  if (!found) return null;
  let existing: CompanionChatMessage;
  try {
    existing = JSON.parse(found.raw) as CompanionChatMessage;
  } catch {
    return null;
  }
  if (existing.deletedAt || kindOf(existing.kind) !== "text") return null;
  const updated: CompanionChatMessage = { ...existing, text, editedAt: new Date().toISOString() };
  await command(["LSET", keyFor(shareId), found.index, JSON.stringify(updated)]);
  return readChat(shareId);
}

/**
 * Delete one message — the sender's own, checked here as well as by the
 * route. The row stays so nothing else in the list shifts position; what it
 * carried is gone the moment parseChatMessages reads it back.
 */
export async function deleteMessage(shareId: string, at: string, by: CompanionChatSide): Promise<CompanionChatMessage[] | null> {
  if (!chatStoreAvailable()) return null;
  const found = await findRawIndex(shareId, at, by);
  if (!found) return null;
  let existing: CompanionChatMessage;
  try {
    existing = JSON.parse(found.raw) as CompanionChatMessage;
  } catch {
    return null;
  }
  if (existing.deletedAt) return readChat(shareId); // already gone; nothing to do
  const updated: CompanionChatMessage = { from: existing.from, kind: existing.kind, text: "", at: existing.at, deletedAt: new Date().toISOString() };
  await command(["LSET", keyFor(shareId), found.index, JSON.stringify(updated)]);
  return readChat(shareId);
}

/**
 * Clear a trip's whole conversation — every message, every report, and both
 * sides' read markers. What is NOT touched: the trip itself, and the share
 * link that opens it. Deleting a conversation is deleting what was said, not
 * closing the door the client walks through — that stays open, and the next
 * message either side sends starts a thread as empty as the day it opened.
 */
export async function deleteConversation(shareId: string): Promise<boolean> {
  await command(["DEL", keyFor(shareId)]);
  await command(["DEL", reportKeyFor(shareId)]);
  await command(["DEL", readKeyFor(shareId, "client")]);
  await command(["DEL", readKeyFor(shareId, "advisor")]);
  await command(["DEL", typingKeyFor(shareId, "client")]);
  await command(["DEL", typingKeyFor(shareId, "advisor")]);
  return true;
}

/* ---- read markers ---------------------------------------------------------
 *
 * "Read" is not tracked per message — that would be a second write for every
 * poll, on top of the one the messages already cost. Instead each side has
 * ONE marker: the `at` of the newest message they had loaded the last time
 * they asked for the thread. A message shows as read once the OTHER side's
 * marker is at or past its own `at` — the same shape a phone's messaging app
 * shows, at a hundredth of the writes.
 */

const readKeyFor = (shareId: string, side: CompanionChatSide) => `white-glove:companion-read:${shareId}:${side}`;

/** Record that `side` has now seen the thread up to `at`. */
export async function markRead(shareId: string, side: CompanionChatSide, at: string): Promise<void> {
  if (!chatStoreAvailable() || !at) return;
  await command(["SET", readKeyFor(shareId, side), at]);
}

/** Both sides' read markers, whichever exist. */
export async function readMarkers(shareId: string): Promise<Partial<Record<CompanionChatSide, string>>> {
  const [client, advisor] = await Promise.all([
    command<string>(["GET", readKeyFor(shareId, "client")]),
    command<string>(["GET", readKeyFor(shareId, "advisor")]),
  ]);
  const out: Partial<Record<CompanionChatSide, string>> = {};
  if (client) out.client = client;
  if (advisor) out.advisor = advisor;
  return out;
}

/* ---- typing ----------------------------------------------------------------
 *
 * "X is typing…" is a courtesy, not a record — nobody needs to know a week
 * from now that somebody was typing at 3pm on Tuesday. So it is a key with a
 * short expiry rather than anything appended to: the composer refreshes it
 * every couple of seconds while there are words in the box, and it simply
 * expires on its own a few seconds after the last keystroke — the same way a
 * phone's messaging app stops showing "typing…" when nothing has been typed
 * for a moment, without either side having to say "I stopped."
 */

const typingKeyFor = (shareId: string, side: CompanionChatSide) => `white-glove:companion-typing:${shareId}:${side}`;
/** How long a "typing" signal lasts without being refreshed. Longer than the
 *  composer's own refresh interval, so a normal pause between keystrokes
 *  doesn't flicker the indicator off and straight back on. */
const TYPING_TTL_SECONDS = 6;

/** `side` is typing right now (or still within the last few seconds of it). */
export async function setTyping(shareId: string, side: CompanionChatSide): Promise<void> {
  if (!chatStoreAvailable()) return;
  await command(["SET", typingKeyFor(shareId, side), "1", "EX", TYPING_TTL_SECONDS]);
}

/** Whether `side` was typing within the last few seconds. */
export async function isTyping(shareId: string, side: CompanionChatSide): Promise<boolean> {
  return Boolean(await command<string>(["GET", typingKeyFor(shareId, side)]));
}

/* ---- reporting ----------------------------------------------------------- */

/**
 * A message somebody flagged.
 *
 * WHY THIS EXISTS. Once a picture can be sent from one person to another, the
 * app has to give the other person a way to say "this should not have been
 * sent" — it is a condition of carrying that kind of content at all. A report
 * is recorded here, against the trip's thread, for the operator to act on; the
 * reporter is told it was received, and nothing about the thread is destroyed
 * on the strength of one tap.
 */
export type CompanionChatReport = {
  /** Which side raised it. */
  by: CompanionChatSide;
  /** The `at` of the message being reported, so the operator can find it. */
  messageAt: string;
  /** When it was raised. ISO. */
  at: string;
};

const reportKeyFor = (shareId: string) => `white-glove:companion-report:${shareId}`;
const MAX_REPORTS = 200;

/** Record a report against a trip's thread. */
export async function appendReport(shareId: string, report: CompanionChatReport): Promise<boolean> {
  if (!chatStoreAvailable()) return false;
  const key = reportKeyFor(shareId);
  await command(["RPUSH", key, JSON.stringify(report)]);
  await command(["LTRIM", key, -MAX_REPORTS, -1]);
  return true;
}

/** Every report on a trip's thread, oldest first — for the operator to review. */
export async function readReports(shareId: string): Promise<CompanionChatReport[]> {
  const rows = await command<string[]>(["LRANGE", reportKeyFor(shareId), 0, -1]);
  if (!rows) return [];
  const out: CompanionChatReport[] = [];
  for (const row of rows) {
    try {
      const r = JSON.parse(row) as CompanionChatReport;
      if (r && (r.by === "client" || r.by === "advisor") && typeof r.messageAt === "string") out.push(r);
    } catch {
      /* skip a corrupt row */
    }
  }
  return out;
}
