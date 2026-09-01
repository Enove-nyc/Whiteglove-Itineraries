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
export type CompanionChatKind = "text" | "image" | "video" | "audio" | "file" | "location" | "poll";

/**
 * A poll — a question and its options, plus who voted for what. Meant for a trip
 * whose link more than one traveller holds (a family), so "which restaurant
 * Tuesday?" can go to everyone at once.
 *
 * VOTES ARE KEYED BY AN ANONYMOUS PER-DEVICE ID, not by chat side, because
 * every traveller on the one shared link is the same "client" side — the side
 * alone could never tell two family members apart. The advisor votes as the
 * fixed id "advisor"; each traveller's device carries its own random id. The id
 * is opaque and carries no identity; it only separates one voter from another.
 */
export type CompanionPoll = {
  question: string;
  options: string[];
  /** voterId → the index into `options` they chose. */
  votes?: Record<string, number>;
  /**
   * voterId → the name to show beside their vote, when the trip has per-traveler
   * links so a voter has a name at all. Present only on a PUBLIC poll; a private
   * one never records who chose what, only the running totals. Kept in step with
   * `votes`: a voter clearing their vote drops their name too.
   */
  voterNames?: Record<string, string>;
  /**
   * A private poll — the totals are shown, but never who voted for what. The
   * creator's choice at the moment the poll is asked; it cannot be flipped
   * afterwards, so a vote cast believing it was secret can never be un-hidden.
   */
  secret?: boolean;
};

/** A poll asks a question with between this many and this many options. */
export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 5;
export const MAX_POLL_OPTION = 80;

/**
 * The reactions the app offers — a fixed set, so a stored reaction is always
 * one of these and never arbitrary text a caller made up.
 */
export const REACTION_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🙏"] as const;
const REACTION_SET: ReadonlySet<string> = new Set(REACTION_EMOJIS);

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
   * Emoji reactions, one per side: each of the two people can leave a single
   * reaction on a message, and both see both. Tapping the same emoji again
   * clears it; a different one replaces it. Never carried on a deleted message.
   */
  reactions?: Partial<Record<CompanionChatSide, string>>;
  /** kind "poll": the question, its options, and who voted for what. */
  poll?: CompanionPoll;
  /**
   * WHO on the client side wrote this, when they came in by their own
   * per-traveler link (lib/account-store.ts, ensureTravelerShare). Several
   * travellers on one trip are all the "client" side, so the side alone can't
   * tell a family apart — this is what lets the advisor (and other travellers)
   * see who said what. Absent on advisor messages and on a whole-trip link that
   * carries no one traveller's name. Set server-side from the link, never from
   * the body, so a message can't claim to be from someone it isn't.
   */
  senderId?: string;
  senderName?: string;
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

/* ---- channels -------------------------------------------------------------
 *
 * A trip's conversation can be split into channels — "Hotel", "Flights",
 * "General" — the advisor makes and both sides see, so one topic doesn't bury
 * another. Each channel is its own thread: its own messages, read markers,
 * typing signal and reports, keyed the same way the trip's thread always was
 * but with the channel folded into the key.
 *
 * GENERAL IS SPECIAL, AND ON PURPOSE. Every trip has a General channel that
 * needs no creating and can't be deleted, and its storage keys carry NO channel
 * suffix — they are the exact keys the trip's single thread used before
 * channels existed. So every conversation that already exists simply becomes
 * that trip's General channel, with nothing to migrate: the old key is the new
 * General key.
 */
export type CompanionChannel = { id: string; name: string; createdAt?: string };

export const GENERAL_CHANNEL_ID = "general";
export const GENERAL_CHANNEL_NAME = "General";
export const MAX_CHANNELS = 20;
export const MAX_CHANNEL_NAME = 40;

/** The always-present General channel, the same object shape a stored one has. */
export function generalChannel(): CompanionChannel {
  return { id: GENERAL_CHANNEL_ID, name: GENERAL_CHANNEL_NAME };
}

/** A channel id is a short opaque slug. General is the one fixed id; every other
 *  is random lowercase alphanumerics, so a value off the wire is only ever
 *  accepted when it matches one this trip actually has. */
function makeChannelId(): string {
  let s = "";
  while (s.length < 12) s += Math.random().toString(36).slice(2);
  return s.slice(0, 12);
}

/** Sanitise a channel id arriving from a request into the shape ids really
 *  take — lowercase alphanumerics, or "general". Anything else collapses to
 *  General rather than addressing a key nobody meant. */
export function normalizeChannelId(raw: unknown): string {
  if (typeof raw !== "string") return GENERAL_CHANNEL_ID;
  const v = raw.trim().toLowerCase();
  if (v === GENERAL_CHANNEL_ID) return GENERAL_CHANNEL_ID;
  const cleaned = v.replace(/[^a-z0-9]/g, "").slice(0, 24);
  return cleaned || GENERAL_CHANNEL_ID;
}

export function chatStoreAvailable(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

/** The channel-scoped part of a key. Empty for General, so General's keys are
 *  the un-suffixed keys the trip's single thread always used. */
const channelPart = (channelId: string) => (channelId === GENERAL_CHANNEL_ID ? "" : `:ch:${channelId}`);

const keyFor = (shareId: string, channelId: string = GENERAL_CHANNEL_ID) =>
  `white-glove:companion-chat:${shareId}${channelPart(channelId)}`;

const channelsKeyFor = (shareId: string) => `white-glove:companion-channels:${shareId}`;

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
  return raw === "image" || raw === "video" || raw === "audio" || raw === "file" || raw === "location" || raw === "poll" ? raw : "text";
}

/** Keep only a well-formed poll: a question, 2–5 non-empty option strings, and
 *  votes that point at real option indexes. Anything off is dropped rather than
 *  trusted, so a made-up body can never store a malformed poll. */
function sanitizePoll(raw: unknown): CompanionPoll | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as { question?: unknown; options?: unknown; votes?: unknown; voterNames?: unknown; secret?: unknown };
  if (typeof r.question !== "string" || !r.question.trim()) return undefined;
  if (!Array.isArray(r.options)) return undefined;
  const options = r.options
    .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
    .map((o) => o.trim().slice(0, MAX_POLL_OPTION))
    .slice(0, MAX_POLL_OPTIONS);
  if (options.length < MIN_POLL_OPTIONS) return undefined;
  const votes: Record<string, number> = {};
  if (r.votes && typeof r.votes === "object") {
    for (const [voter, choice] of Object.entries(r.votes as Record<string, unknown>)) {
      if (typeof voter !== "string" || !voter) continue;
      if (typeof choice !== "number" || !Number.isInteger(choice) || choice < 0 || choice >= options.length) continue;
      votes[voter.slice(0, 64)] = choice;
    }
  }
  const secret = r.secret === true;
  // Names go with votes, and only on a public poll — a private one keeps no
  // record of who chose what, so revealing it later is not even possible.
  const voterNames: Record<string, string> = {};
  if (!secret && r.voterNames && typeof r.voterNames === "object") {
    for (const [voter, name] of Object.entries(r.voterNames as Record<string, unknown>)) {
      const key = typeof voter === "string" ? voter.slice(0, 64) : "";
      if (!key || votes[key] === undefined) continue; // no orphan names
      if (typeof name === "string" && name.trim()) voterNames[key] = name.trim().slice(0, 80);
    }
  }
  return {
    question: r.question.trim().slice(0, MAX_CHAT_LABEL),
    options,
    votes: Object.keys(votes).length ? votes : undefined,
    voterNames: Object.keys(voterNames).length ? voterNames : undefined,
    secret: secret || undefined,
  };
}

/** Keep only well-formed reactions: a known side, a known emoji, nothing else. */
function sanitizeReactions(raw: unknown): Partial<Record<CompanionChatSide, string>> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Partial<Record<CompanionChatSide, string>> = {};
  for (const side of ["client", "advisor"] as const) {
    const v = (raw as Record<string, unknown>)[side];
    if (typeof v === "string" && REACTION_SET.has(v)) out[side] = v;
  }
  return Object.keys(out).length ? out : undefined;
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
      const senderId = typeof m.senderId === "string" && m.senderId ? m.senderId.slice(0, 64) : undefined;
      const senderName = typeof m.senderName === "string" && m.senderName.trim() ? m.senderName.trim().slice(0, 80) : undefined;
      if (typeof m.deletedAt === "string") {
        // Everything the message carried is gone the moment it is deleted —
        // never just hidden client-side, where a curious poke at the network
        // tab would still find the picture. Who it was from stays (the side and,
        // where there is one, the name), so the thread doesn't lose a turn.
        out.push({ from: m.from, kind: kindOf(m.kind), text: "", at: m.at, deletedAt: m.deletedAt, senderId, senderName });
        continue;
      }
      const kind = kindOf(m.kind);
      // A picture, video or voice note with no file, or a place with neither
      // a coordinate nor an address, is a broken row, not a message — skip it
      // rather than render an empty bubble.
      if ((kind === "image" || kind === "video" || kind === "audio" || kind === "file") && typeof m.mediaId !== "string") continue;
      if (kind === "location" && !(Number.isFinite(m.lat) && Number.isFinite(m.lng)) && !(typeof m.address === "string" && m.address.trim())) continue;
      // A poll with no valid question/options is a broken row, not a message.
      const poll = kind === "poll" ? sanitizePoll(m.poll) : undefined;
      if (kind === "poll" && !poll) continue;
      out.push({ ...m, kind, poll, reactions: sanitizeReactions(m.reactions), senderId, senderName });
    } catch {
      /* skip a corrupt row rather than drop the thread */
    }
  }
  return out;
}

/** The whole thread for a trip's channel, oldest first. */
export async function readChat(shareId: string, channelId: string = GENERAL_CHANNEL_ID): Promise<CompanionChatMessage[]> {
  return parseChatMessages(await command<string[]>(["LRANGE", keyFor(shareId, channelId), 0, -1]));
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
  channelId: string = GENERAL_CHANNEL_ID,
): Promise<CompanionChatMessage[]> {
  if (!chatStoreAvailable()) return [];
  const key = keyFor(shareId, channelId);
  await command(["RPUSH", key, JSON.stringify(message)]);
  await command(["LTRIM", key, -MAX_THREAD, -1]);
  return readChat(shareId, channelId);
}

/** A short label for a message with nothing to show as its own words. */
function quoteLabelFor(m: CompanionChatMessage): string {
  const kind = kindOf(m.kind);
  if (kind === "image") return "Photo";
  if (kind === "video") return "Video";
  if (kind === "audio") return "Voice note";
  if (kind === "file") return m.text || "Document";
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
export async function quoteFor(shareId: string, at: string, channelId: string = GENERAL_CHANNEL_ID): Promise<CompanionChatMessage["replyTo"] | undefined> {
  const thread = await readChat(shareId, channelId);
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
async function findRawIndex(shareId: string, at: string, from: CompanionChatSide, channelId: string = GENERAL_CHANNEL_ID): Promise<{ index: number; raw: string } | null> {
  const rows = await command<string[]>(["LRANGE", keyFor(shareId, channelId), 0, -1]);
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

/** Find a message by its timestamp alone — a reaction can be left by either
 *  side on either side's message, so unlike edit/delete it is not scoped to the
 *  sender. */
async function findRawIndexByAt(shareId: string, at: string, channelId: string = GENERAL_CHANNEL_ID): Promise<{ index: number; raw: string } | null> {
  const rows = await command<string[]>(["LRANGE", keyFor(shareId, channelId), 0, -1]);
  if (!rows) return null;
  for (let i = 0; i < rows.length; i++) {
    try {
      const m = JSON.parse(rows[i]) as CompanionChatMessage;
      if (m.at === at) return { index: i, raw: rows[i] };
    } catch {
      /* not this one */
    }
  }
  return null;
}

/**
 * LSET one row back, but only if it is still the exact row we read.
 *
 * Between finding a message's index and writing it back, another message can
 * arrive: appendChat does RPUSH then LTRIM at the 200-message cap, which drops
 * index 0 and shifts every remaining index down by one. A bare LSET by the now
 * stale index would overwrite a DIFFERENT message. So re-read the row at that
 * index and only write when it still matches what we meant to change; otherwise
 * report failure and let the caller re-find rather than clobber the wrong turn.
 */
async function lsetIfUnchanged(shareId: string, index: number, expectedRaw: string, value: string, channelId: string = GENERAL_CHANNEL_ID): Promise<boolean> {
  const current = await command<string>(["LINDEX", keyFor(shareId, channelId), index]);
  if (current !== expectedRaw) return false;
  await command(["LSET", keyFor(shareId, channelId), index, value]);
  return true;
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
  channelId: string = GENERAL_CHANNEL_ID,
): Promise<CompanionChatMessage[] | null> {
  if (!chatStoreAvailable()) return null;
  // Re-find on each attempt so the index is fresh, and only write when the row
  // has not moved (lsetIfUnchanged). A concurrent message that shifts the list
  // costs a retry, never a clobbered message.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const found = await findRawIndex(shareId, at, by, channelId);
    if (!found) return null;
    let existing: CompanionChatMessage;
    try {
      existing = JSON.parse(found.raw) as CompanionChatMessage;
    } catch {
      return null;
    }
    if (existing.deletedAt || kindOf(existing.kind) !== "text") return null;
    const updated: CompanionChatMessage = { ...existing, text, editedAt: new Date().toISOString() };
    if (await lsetIfUnchanged(shareId, found.index, found.raw, JSON.stringify(updated), channelId)) return readChat(shareId, channelId);
  }
  // The row kept moving under concurrent writes — return the thread as it
  // stands rather than risk overwriting the wrong message.
  return readChat(shareId, channelId);
}

/**
 * Toggle `by`'s reaction on the message at `at`. Either side may react to
 * either side's message (unlike edit/delete, which are the sender's own), so
 * this finds by timestamp alone. The same emoji clears the reaction; a
 * different one replaces it; a deleted message takes none; only an emoji from
 * REACTION_EMOJIS is stored. Returns the thread as it now stands, or null when
 * the store is off or there is nothing at that address.
 */
export async function reactMessage(
  shareId: string,
  at: string,
  by: CompanionChatSide,
  emoji: string,
  channelId: string = GENERAL_CHANNEL_ID,
): Promise<CompanionChatMessage[] | null> {
  if (!chatStoreAvailable()) return null;
  if (!REACTION_SET.has(emoji)) return null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const found = await findRawIndexByAt(shareId, at, channelId);
    if (!found) return null;
    let existing: CompanionChatMessage;
    try {
      existing = JSON.parse(found.raw) as CompanionChatMessage;
    } catch {
      return null;
    }
    if (existing.deletedAt) return readChat(shareId, channelId); // nothing to react to
    const reactions: Partial<Record<CompanionChatSide, string>> = { ...(existing.reactions ?? {}) };
    if (reactions[by] === emoji) delete reactions[by];
    else reactions[by] = emoji;
    const hasAny = Object.keys(reactions).length > 0;
    const updated: CompanionChatMessage = { ...existing, reactions: hasAny ? reactions : undefined };
    if (await lsetIfUnchanged(shareId, found.index, found.raw, JSON.stringify(updated), channelId)) return readChat(shareId, channelId);
  }
  return readChat(shareId, channelId);
}

/**
 * Record `voterId`'s vote on the poll at `at`. Anyone in the thread may vote,
 * so this finds by timestamp; voting the same option again clears the vote, a
 * different one moves it. `optionIndex` must point at a real option. Returns the
 * thread as it now stands, or null when the store is off or there is no poll
 * there. Concurrency-safe the same way reactions are — a compare-and-set retry,
 * never a clobbered tally.
 */
export async function votePoll(
  shareId: string,
  at: string,
  voterId: string,
  optionIndex: number,
  channelId: string = GENERAL_CHANNEL_ID,
  voterName?: string,
): Promise<CompanionChatMessage[] | null> {
  if (!chatStoreAvailable()) return null;
  if (!voterId || typeof voterId !== "string") return null;
  if (!Number.isInteger(optionIndex) || optionIndex < 0) return null;
  const voter = voterId.slice(0, 64);
  const name = typeof voterName === "string" && voterName.trim() ? voterName.trim().slice(0, 80) : undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const found = await findRawIndexByAt(shareId, at, channelId);
    if (!found) return null;
    let existing: CompanionChatMessage;
    try {
      existing = JSON.parse(found.raw) as CompanionChatMessage;
    } catch {
      return null;
    }
    if (existing.deletedAt || kindOf(existing.kind) !== "poll" || !existing.poll) return null;
    if (optionIndex >= existing.poll.options.length) return null;
    const votes: Record<string, number> = { ...(existing.poll.votes ?? {}) };
    const voterNames: Record<string, string> = { ...(existing.poll.voterNames ?? {}) };
    if (votes[voter] === optionIndex) {
      // Tapping the same option again clears the vote — and its name with it.
      delete votes[voter];
      delete voterNames[voter];
    } else {
      votes[voter] = optionIndex;
      // A private poll keeps no names; a public one records it when there is one.
      if (!existing.poll.secret && name) voterNames[voter] = name;
    }
    const updated: CompanionChatMessage = {
      ...existing,
      poll: {
        ...existing.poll,
        votes: Object.keys(votes).length ? votes : undefined,
        voterNames: !existing.poll.secret && Object.keys(voterNames).length ? voterNames : undefined,
      },
    };
    if (await lsetIfUnchanged(shareId, found.index, found.raw, JSON.stringify(updated), channelId)) return readChat(shareId, channelId);
  }
  return readChat(shareId, channelId);
}

/**
 * Delete one message — the sender's own, checked here as well as by the
 * route. The row stays so nothing else in the list shifts position; what it
 * carried is gone the moment parseChatMessages reads it back.
 */
export async function deleteMessage(shareId: string, at: string, by: CompanionChatSide, channelId: string = GENERAL_CHANNEL_ID): Promise<CompanionChatMessage[] | null> {
  if (!chatStoreAvailable()) return null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const found = await findRawIndex(shareId, at, by, channelId);
    if (!found) return null;
    let existing: CompanionChatMessage;
    try {
      existing = JSON.parse(found.raw) as CompanionChatMessage;
    } catch {
      return null;
    }
    if (existing.deletedAt) return readChat(shareId, channelId); // already gone; nothing to do
    const updated: CompanionChatMessage = { from: existing.from, kind: existing.kind, text: "", at: existing.at, deletedAt: new Date().toISOString() };
    if (await lsetIfUnchanged(shareId, found.index, found.raw, JSON.stringify(updated), channelId)) return readChat(shareId, channelId);
  }
  // The row kept moving under concurrent writes — leave it rather than delete
  // the wrong message.
  return readChat(shareId, channelId);
}

/**
 * Clear a trip's whole conversation — every message, every report, and both
 * sides' read markers. What is NOT touched: the trip itself, and the share
 * link that opens it. Deleting a conversation is deleting what was said, not
 * closing the door the client walks through — that stays open, and the next
 * message either side sends starts a thread as empty as the day it opened.
 */
export async function deleteConversation(shareId: string): Promise<boolean> {
  // Clear every channel, not just General — each is its own thread with its own
  // messages, reports, read markers and typing signal — then the channel list
  // itself, so the trip's next message starts a conversation as empty as the
  // day it opened, back to a single General channel.
  const channels = await readChannels(shareId);
  for (const ch of channels) {
    await command(["DEL", keyFor(shareId, ch.id)]);
    await command(["DEL", reportKeyFor(shareId, ch.id)]);
    await command(["DEL", readKeyFor(shareId, "client", ch.id)]);
    await command(["DEL", readKeyFor(shareId, "advisor", ch.id)]);
    await command(["DEL", typingKeyFor(shareId, "client", ch.id)]);
    await command(["DEL", typingKeyFor(shareId, "advisor", ch.id)]);
  }
  await command(["DEL", channelsKeyFor(shareId)]);
  return true;
}

/* ---- channel list ---------------------------------------------------------
 *
 * The channels a trip has, over and above the General one every trip carries.
 * Stored as a Redis list of JSON `{id, name, createdAt}`; General is never
 * stored — it is prepended on read — so a trip with no extra channels has no
 * channel-list key at all, exactly as before channels existed.
 */

function parseChannels(rows: string[] | null): CompanionChannel[] {
  if (!rows) return [];
  const out: CompanionChannel[] = [];
  for (const row of rows) {
    try {
      const c = JSON.parse(row) as CompanionChannel;
      if (c && typeof c.id === "string" && c.id && c.id !== GENERAL_CHANNEL_ID && typeof c.name === "string" && c.name.trim()) {
        out.push({ id: c.id, name: c.name, createdAt: typeof c.createdAt === "string" ? c.createdAt : undefined });
      }
    } catch {
      /* skip a corrupt row */
    }
  }
  return out;
}

/** A trip's channels — General first, always, then the advisor's own, oldest
 *  first (the order they were made). */
export async function readChannels(shareId: string): Promise<CompanionChannel[]> {
  const stored = parseChannels(await command<string[]>(["LRANGE", channelsKeyFor(shareId), 0, -1]));
  return [generalChannel(), ...stored];
}

/** Whether `channelId` is one this trip really has — General always is; any
 *  other must be in the stored list. The gate the route uses before it writes
 *  to a channel, so a made-up id can never open an orphan thread. */
export async function isKnownChannel(shareId: string, channelId: string): Promise<boolean> {
  if (channelId === GENERAL_CHANNEL_ID) return true;
  return (await readChannels(shareId)).some((c) => c.id === channelId);
}

/**
 * Make a new channel on a trip. Named, capped, and de-duplicated by name
 * (case-insensitive) so an advisor doesn't end up with two "Flights". Returns
 * the channel list as it now stands and the one just created, or an error the
 * route can surface. The caller — the route — is what enforces advisor-only;
 * this is the store, and only knows about shape and limits.
 */
export async function createChannel(
  shareId: string,
  name: string,
): Promise<{ channels: CompanionChannel[]; created: CompanionChannel } | { error: string }> {
  if (!chatStoreAvailable()) return { error: "Channels need the private store connected." };
  const clean = name.trim().slice(0, MAX_CHANNEL_NAME);
  if (!clean) return { error: "Give the channel a name." };
  if (clean.toLowerCase() === GENERAL_CHANNEL_NAME.toLowerCase()) return { error: "Every trip already has a General channel." };
  const existing = await readChannels(shareId);
  if (existing.some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
    return { error: "There's already a channel with that name." };
  }
  if (existing.length >= MAX_CHANNELS) return { error: `That's the most channels a trip can have (${MAX_CHANNELS}).` };
  const created: CompanionChannel = { id: makeChannelId(), name: clean, createdAt: new Date().toISOString() };
  await command(["RPUSH", channelsKeyFor(shareId), JSON.stringify(created)]);
  return { channels: [...existing, created], created };
}

/**
 * Remove a channel and everything in it. General can't be removed — it is the
 * one channel a trip always has. Returns the channel list as it now stands.
 */
export async function deleteChannel(shareId: string, channelId: string): Promise<CompanionChannel[]> {
  if (channelId === GENERAL_CHANNEL_ID) return readChannels(shareId);
  const rows = (await command<string[]>(["LRANGE", channelsKeyFor(shareId), 0, -1])) ?? [];
  const keep = rows.filter((row) => {
    try {
      return (JSON.parse(row) as CompanionChannel).id !== channelId;
    } catch {
      return false; // drop a corrupt row while we're here
    }
  });
  // Rewrite the list from scratch — clear, then push what remains. Cheaper and
  // simpler than an LREM by exact value, and it drops corrupt rows too.
  await command(["DEL", channelsKeyFor(shareId)]);
  for (const row of keep) await command(["RPUSH", channelsKeyFor(shareId), row]);
  // The channel's own thread, reports, markers and typing go with it.
  await command(["DEL", keyFor(shareId, channelId)]);
  await command(["DEL", reportKeyFor(shareId, channelId)]);
  await command(["DEL", readKeyFor(shareId, "client", channelId)]);
  await command(["DEL", readKeyFor(shareId, "advisor", channelId)]);
  await command(["DEL", typingKeyFor(shareId, "client", channelId)]);
  await command(["DEL", typingKeyFor(shareId, "advisor", channelId)]);
  return readChannels(shareId);
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

const readKeyFor = (shareId: string, side: CompanionChatSide, channelId: string = GENERAL_CHANNEL_ID) =>
  `white-glove:companion-read:${shareId}${channelPart(channelId)}:${side}`;

/** Record that `side` has now seen the thread up to `at`. */
export async function markRead(shareId: string, side: CompanionChatSide, at: string, channelId: string = GENERAL_CHANNEL_ID): Promise<void> {
  if (!chatStoreAvailable() || !at) return;
  await command(["SET", readKeyFor(shareId, side, channelId), at]);
}

/** Both sides' read markers, whichever exist. */
export async function readMarkers(shareId: string, channelId: string = GENERAL_CHANNEL_ID): Promise<Partial<Record<CompanionChatSide, string>>> {
  const [client, advisor] = await Promise.all([
    command<string>(["GET", readKeyFor(shareId, "client", channelId)]),
    command<string>(["GET", readKeyFor(shareId, "advisor", channelId)]),
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

const typingKeyFor = (shareId: string, side: CompanionChatSide, channelId: string = GENERAL_CHANNEL_ID) =>
  `white-glove:companion-typing:${shareId}${channelPart(channelId)}:${side}`;
/** How long a "typing" signal lasts without being refreshed. Longer than the
 *  composer's own refresh interval, so a normal pause between keystrokes
 *  doesn't flicker the indicator off and straight back on. */
const TYPING_TTL_SECONDS = 6;

/** `side` is typing right now (or still within the last few seconds of it). */
export async function setTyping(shareId: string, side: CompanionChatSide, channelId: string = GENERAL_CHANNEL_ID): Promise<void> {
  if (!chatStoreAvailable()) return;
  await command(["SET", typingKeyFor(shareId, side, channelId), "1", "EX", TYPING_TTL_SECONDS]);
}

/** Whether `side` was typing within the last few seconds. */
export async function isTyping(shareId: string, side: CompanionChatSide, channelId: string = GENERAL_CHANNEL_ID): Promise<boolean> {
  return Boolean(await command<string>(["GET", typingKeyFor(shareId, side, channelId)]));
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

const reportKeyFor = (shareId: string, channelId: string = GENERAL_CHANNEL_ID) =>
  `white-glove:companion-report:${shareId}${channelPart(channelId)}`;
const MAX_REPORTS = 200;

/** Record a report against a trip's thread. */
export async function appendReport(shareId: string, report: CompanionChatReport, channelId: string = GENERAL_CHANNEL_ID): Promise<boolean> {
  if (!chatStoreAvailable()) return false;
  const key = reportKeyFor(shareId, channelId);
  await command(["RPUSH", key, JSON.stringify(report)]);
  await command(["LTRIM", key, -MAX_REPORTS, -1]);
  return true;
}

/** Every report on a trip's thread, oldest first — for the operator to review. */
export async function readReports(shareId: string, channelId: string = GENERAL_CHANNEL_ID): Promise<CompanionChatReport[]> {
  const rows = await command<string[]>(["LRANGE", reportKeyFor(shareId, channelId), 0, -1]);
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
