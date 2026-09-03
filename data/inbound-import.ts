/**
 * FORWARD A CONFIRMATION AND IT LANDS ON YOUR TRIP.
 *
 * The importer could already read a confirmation you PASTED or ATTACHED — the
 * airline's PDF, a screenshot, a photo of a printed voucher. What it could not
 * do is take one you simply forwarded, which is what everybody's confirmations
 * actually arrive as. This is that half.
 *
 * EACH ACCOUNT GETS ITS OWN ADDRESS, and that is the security design, not a
 * convenience. Routing on the From header would mean anybody who knows your
 * email address can put rows on your trip: From is trivially forged and is not
 * a credential. The address itself is the credential — a random token nobody
 * can guess, which the owner can rotate if it ever leaks.
 *
 * NOTHING IS ADDED WITHOUT REVIEW. A forwarded email becomes a PENDING import
 * waiting on the trip, opened in the same review screen a pasted confirmation
 * opens, and the planner keeps or discards each row. That rule is the owner's
 * own — "never automatically save imported information without review" — and it
 * matters more here than anywhere else, because this is the one path where
 * something arrives that nobody was looking at when it did.
 *
 * Pure: the address format and what may be read out of an inbound message can
 * be tested without a mail provider.
 */

/** The mailbox everything is forwarded to. The token after "+" is the account. */
export const INBOUND_MAILBOX = "trips";

/**
 * Random, unguessable, and rotatable — now in words rather than characters.
 *
 * Four words from the 512 in data/inbound-words.ts is 2^36, so an address is
 * still a credential nobody guesses, and it is one somebody can read off a
 * screen and type into their phone without getting it wrong. See that file for
 * why the count of words is fixed and held by a test.
 *
 * The old sixteen-character tokens still resolve: they were issued, people
 * have them saved, and nothing about this changes what an existing address
 * means. Only newly-issued ones are words.
 */
export const TOKEN_WORDS = 4;

/** Kept for the tokens issued before words, which are still valid addresses. */
export const TOKEN_LENGTH = 16;

/** The address to give one account, on one brand's domain. */
export function inboundAddress(token: string, domain: string): string {
  return token ? `${INBOUND_MAILBOX}+${token}@${domain}` : "";
}

/**
 * The token out of whatever the provider says the message was sent to.
 *
 * Deliberately forgiving about the shape of the header — "To" can arrive as
 * `Name <trips+abc@domain>`, as a bare address, or as several separated by
 * commas when somebody forwarded to more than one place. It is deliberately
 * strict about the token: anything that is not the exact character set is not
 * a token, so a near-miss routes nowhere rather than to somebody else.
 */
export function tokenFromRecipients(recipients: readonly string[]): string {
  for (const raw of recipients) {
    for (const part of String(raw ?? "").split(",")) {
      const match = /(?:^|<|\s)trips\+([A-Za-z0-9_-]{8,64})@/.exec(part);
      if (match) return match[1];
    }
  }
  return "";
}

/**
 * How a message found the account it landed on.
 *
 * "address" is the credential: the message was sent to that account's own
 * forwarding address, which nobody else knows. "sender" is a guess — it
 * arrived at the plain mailbox with no address token, and the From line
 * happened to match a registered account.
 *
 * THE DIFFERENCE IS SHOWN, NEVER SMOOTHED OVER. From is typed by whoever sent
 * the message and forging it is trivial, so a "sender" match is not proof of
 * anything and is labelled on screen as unconfirmed. It exists because people
 * forward from whatever mail app is open — a work address, a phone alias —
 * and losing those messages silently is its own failure. Neither kind is ever
 * written to a trip without somebody reading it first.
 */
export type MatchedBy = "address" | "sender";

/** What one forwarded message turned into, before anybody has looked at it. */
export type PendingImport = {
  id: string;
  /** When it arrived, ISO. */
  at: string;
  /** The email's subject, so the planner knows what they are opening. */
  subject: string;
  /** Who it came from, shown only so a stranger's message is obvious. */
  from: string;
  /** The rows the extractor read out, awaiting review. */
  items: unknown[];
  /** Anything the extractor could not read confidently. */
  warnings: string[];
  /**
   * What routed it here. Absent on entries queued before this existed, which
   * all arrived by address — the only route there was.
   */
  matchedBy?: MatchedBy;
};

/** True when nothing proved this message is from who it says it is. */
export function isUnconfirmed(entry: PendingImport): boolean {
  return entry.matchedBy === "sender";
}

/** More than this waiting means something is wrong, not that somebody is busy. */
export const MAX_PENDING = 20;

/**
 * And a tighter cap on the ones nobody can vouch for.
 *
 * WITHOUT THIS, THE FALLBACK IS AN EVICTION TOOL. Anybody who knows a
 * customer's email address could send twenty messages with a forged From and
 * push every real forwarded confirmation off the end of the queue. So the two
 * kinds are trimmed separately: unconfirmed mail can only ever crowd out other
 * unconfirmed mail, and a confirmation sent to somebody's own address cannot
 * be displaced by a stranger.
 */
export const MAX_UNCONFIRMED_PENDING = 5;

/** Kept short: this is a queue to clear, not a mailbox to live in. */
export const PENDING_KEEP_DAYS = 30;

export function isStale(entry: PendingImport, now: string): boolean {
  const at = Date.parse(entry.at);
  const then = Date.parse(now);
  if (Number.isNaN(at) || Number.isNaN(then)) return false;
  return then - at > PENDING_KEEP_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Newest first, stale ones dropped, each kind capped on its own. What is kept
 * on the queue, and what the planner is shown.
 *
 * The two caps are applied separately and the result re-sorted, so an
 * unconfirmed message can never take a confirmed one's place — see
 * MAX_UNCONFIRMED_PENDING.
 */
export function pendingToShow(entries: readonly PendingImport[], now: string): PendingImport[] {
  const fresh = entries.filter((entry) => !isStale(entry, now)).sort((a, b) => b.at.localeCompare(a.at));
  const confirmed = fresh.filter((entry) => !isUnconfirmed(entry)).slice(0, MAX_PENDING);
  const unconfirmed = fresh.filter(isUnconfirmed).slice(0, MAX_UNCONFIRMED_PENDING);
  return [...confirmed, ...unconfirmed].sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * True when the message really was sent to the plain forwarding mailbox.
 *
 * The gate on the sender fallback. Without it, any message the provider ever
 * posted to this site would have its From line looked up against the account
 * list — a bounce, a mailing list, a misdirected reply. Something has to say
 * "this was meant for us", and with no address token the only thing that can
 * say it is the mailbox it was sent to.
 */
export function addressedToMailbox(recipients: readonly string[]): boolean {
  for (const raw of recipients) {
    for (const part of String(raw ?? "").split(",")) {
      if (new RegExp(`(?:^|<|\\s)${INBOUND_MAILBOX}@`, "i").test(part)) return true;
    }
  }
  return false;
}

/**
 * The bare address out of a From header.
 *
 * "Sarah Cohen <sarah@example.com>" and "sarah@example.com" both give
 * sarah@example.com, lower-cased so it can be looked up. Deliberately strict
 * about the shape: this is about to be used to pick an account, so anything
 * that is not unmistakably one address gives nothing back rather than a best
 * guess. Only ever the FIRST address — a From carrying two is not something to
 * resolve, it is something to ignore.
 */
export function senderAddress(from: string): string {
  const raw = String(from ?? "").trim();
  if (!raw || raw.includes(",")) return "";
  const angled = /<([^<>\s]+@[^<>\s]+)>/.exec(raw);
  const candidate = (angled ? angled[1] : raw).trim().toLowerCase();
  return /^[^\s@<>"]+@[^\s@<>".]+\.[a-z]{2,}$/.test(candidate) ? candidate : "";
}

/** How the builder says there is something waiting. Never a number nobody asked for. */
export function waitingLine(count: number): string {
  if (count <= 0) return "";
  return count === 1 ? "1 forwarded confirmation is waiting to be checked" : `${count} forwarded confirmations are waiting to be checked`;
}
