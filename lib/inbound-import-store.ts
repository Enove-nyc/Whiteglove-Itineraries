/**
 * Where a forwarded confirmation waits, and which account an address belongs to.
 *
 * TWO KEYS, AND THE FIRST ONE IS THE CREDENTIAL. The token in an inbound
 * address is the only thing proving a message may touch an account, so it is
 * stored as its own lookup — token to account — and never derived from
 * anything the sender controls. Rotating an account's address deletes the old
 * lookup, which is what makes rotation mean something.
 *
 * The queue is per account and deliberately small: it exists to be cleared,
 * not to become a second inbox.
 */

import { randomInt } from "crypto";
import { identityKey } from "@/lib/identity";
import { INBOUND_WORDS } from "@/data/inbound-words";
import { TOKEN_WORDS, pendingToShow, type PendingImport } from "@/data/inbound-import";

const TOKEN_PREFIX = "white-glove:inbound-token:";
const QUEUE_PREFIX = "white-glove:inbound-pending:";
const ADDRESS_PREFIX = "white-glove:inbound-address:";

export function inboundStoreAvailable() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

/**
 * The domain forwarded mail actually arrives at.
 *
 * NOT ALWAYS THE SITE'S OWN DOMAIN, and that is the mail provider's rule
 * rather than a preference. Receiving is enabled per domain with an MX record,
 * and a domain can only have one lowest-priority MX — so putting the
 * provider's record on whiteglovekoshertravel.com would take over every
 * address at it, the owner's own mail included. The provider's own advice is a
 * subdomain, which leaves existing mail untouched, and INBOUND_EMAIL_DOMAIN is
 * where that subdomain is named.
 *
 * Only the ADDRESS SHOWN depends on this. Nothing about reading an arriving
 * message does: a message is routed on the token in front of the @, and the
 * mailbox check looks at the local part, so mail that arrives on any domain
 * the provider is configured for is handled the same.
 */
export function inboundDomain(fallback: string): string {
  const configured = process.env.INBOUND_EMAIL_DOMAIN?.trim().toLowerCase().replace(/^@/, "");
  // A hostname or nothing. A stray protocol, path or space means somebody
  // pasted a URL, and half a URL in an email address is worse than no address.
  return configured && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(configured) ? configured : fallback;
}

/**
 * Whether a forwarded email can actually arrive, not merely be stored.
 *
 * A queue with nowhere for mail to land is not forwarding, and an address
 * shown before the mail provider is wired is a promise the site cannot keep —
 * somebody forwards their booking to it, nothing comes back, and they learn
 * that the feature does not work rather than that it is not switched on yet.
 * The inbound route refuses everything without INBOUND_EMAIL_SECRET, so the
 * same secret is what decides whether an address is worth showing.
 */
export function inboundMailReady() {
  return inboundStoreAvailable() && Boolean(process.env.INBOUND_EMAIL_SECRET?.trim());
}

async function redis<T>(path: string, body?: string): Promise<T | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as { result?: T };
    return payload.result ?? null;
  } catch {
    return null;
  }
}

const key = (prefix: string, value: string) => encodeURIComponent(`${prefix}${value}`);

/**
 * A new address, in words somebody can read out.
 *
 * randomInt, not a hash of anything and not Math.random: this is a credential,
 * and the whole strength of it is that the four words were drawn evenly and
 * unpredictably from the list. Repeats are allowed — refusing them would leak
 * a little about what was drawn and buys nothing.
 */
function makeToken(): string {
  return Array.from({ length: TOKEN_WORDS }, () => INBOUND_WORDS[randomInt(INBOUND_WORDS.length)]).join("-");
}

/**
 * This account's forwarding token, made on first use and stable after.
 *
 * Both directions are written: the token finds the account when a message
 * arrives, and the account finds its own token so the screen can show the
 * address without a scan.
 */
export async function ensureInboundToken(account: string): Promise<string> {
  if (!account || !inboundStoreAvailable()) return "";
  const id = identityKey(account);
  const existing = await redis<string>(`get/${key(ADDRESS_PREFIX, id)}`);
  if (existing) return existing;
  const token = makeToken();
  const wrote = await redis(`set/${key(TOKEN_PREFIX, token)}`, JSON.stringify({ account, at: new Date().toISOString() }));
  if (wrote === null) return "";
  await redis(`set/${key(ADDRESS_PREFIX, id)}`, token);
  return token;
}

/** Whose address is this? The only thing that decides a message's destination. */
export async function accountForToken(token: string): Promise<string> {
  if (!token || !inboundStoreAvailable()) return "";
  const raw = await redis<string>(`get/${key(TOKEN_PREFIX, token)}`);
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as { account?: unknown };
    return typeof parsed.account === "string" ? parsed.account : "";
  } catch {
    return "";
  }
}

/** Retire the old address and issue a new one — the point of a rotatable credential. */
export async function rotateInboundToken(account: string): Promise<string> {
  if (!account || !inboundStoreAvailable()) return "";
  const id = identityKey(account);
  const old = await redis<string>(`get/${key(ADDRESS_PREFIX, id)}`);
  if (old) await redis(`del/${key(TOKEN_PREFIX, old)}`);
  await redis(`del/${key(ADDRESS_PREFIX, id)}`);
  return ensureInboundToken(account);
}

export async function readPending(account: string): Promise<PendingImport[]> {
  if (!account || !inboundStoreAvailable()) return [];
  const raw = await redis<string>(`get/${key(QUEUE_PREFIX, identityKey(account))}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PendingImport[]) : [];
  } catch {
    return [];
  }
}

async function writePending(account: string, entries: PendingImport[]): Promise<boolean> {
  return (await redis(`set/${key(QUEUE_PREFIX, identityKey(account))}`, JSON.stringify(entries))) !== null;
}

/**
 * Put one forwarded confirmation on the queue.
 *
 * Stale entries are dropped on the way in, so the queue tidies itself without
 * anything having to run on a schedule.
 */
export async function addPending(account: string, entry: PendingImport): Promise<boolean> {
  if (!account || !inboundStoreAvailable()) return false;
  const now = new Date().toISOString();
  // Trimmed by pendingToShow rather than by a plain slice, so a message that
  // only matched on its sender can never push a confirmed one off the end —
  // see MAX_UNCONFIRMED_PENDING in data/inbound-import.ts.
  return writePending(account, pendingToShow([entry, ...(await readPending(account))], now));
}

/** Taken off the queue once the planner has kept or discarded its rows. */
export async function clearPending(account: string, id: string): Promise<boolean> {
  if (!account || !inboundStoreAvailable()) return false;
  return writePending(account, (await readPending(account)).filter((e) => e.id !== id));
}
