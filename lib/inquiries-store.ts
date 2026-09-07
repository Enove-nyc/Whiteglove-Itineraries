/**
 * Where an advisor's enquiries are kept.
 *
 * Its own Redis key rather than a field on AccountData, for the reason
 * lib/trip-templates-store.ts gives: a record half a dozen unrelated routes
 * read and write whole is the wrong home for something that grows without
 * limit, and losing this store should lose a list of phone calls rather than
 * a login.
 *
 * AN AGENCY SHARES ONE BOOK OF ENQUIRIES, keyed the same way templates are.
 * A call that comes into the agency is the agency's to answer — whoever picks
 * up the phone should see it, and `assignedTo` on the record says whose it is.
 * Every caller passes its own account and never has to know which key it got.
 *
 * THE READING HALF IS SEPARATE FROM THE RULES ON PURPOSE. Everything about
 * what an enquiry IS — what may be stored, what is due, what order they come
 * in — is pure and testable without Redis in data/inquiries.ts. This file only
 * fetches and saves, and every failure here is quiet: a store that is
 * unreachable gives an advisor an empty list, never an error page over a
 * feature that is not the reason they opened the site.
 */

import { cleanInquiry, type Inquiry } from "@/data/inquiries";
import { agencyIdFor } from "@/lib/agency-store";
import { identityKey } from "@/lib/identity";

const PREFIX = "white-glove:inquiries:";
const AGENCY_PREFIX = "white-glove:inquiries:agency:";

/**
 * How many an account may hold.
 *
 * High enough that no working advisor meets it, low enough that the record
 * stays one reasonable fetch. When it is reached the OLDEST CLOSED enquiry is
 * dropped rather than the oldest of any kind — losing a live piece of work to
 * make room for a new one would be worse than the limit itself.
 */
export const MAX_INQUIRIES = 500;

export function inquiriesStoreAvailable() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
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

/** The record this account's enquiries actually live under — its own, or its agency's. */
async function keyFor(account: string): Promise<string> {
  const agencyId = await agencyIdFor(account);
  return agencyId ? `${AGENCY_PREFIX}${agencyId}` : `${PREFIX}${identityKey(account)}`;
}

export async function readInquiries(account: string): Promise<Inquiry[]> {
  if (!account || !inquiriesStoreAvailable()) return [];
  const raw = await redis<string>(`get/${encodeURIComponent(await keyFor(account))}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Read back through the same boundary a browser's input passes through.
    // A record written by an older version of this file, or by hand, cannot
    // put a shape into the app that the app does not expect.
    return parsed.flatMap((row) => {
      const id = (row as { id?: unknown })?.id;
      if (typeof id !== "string" || !id) return [];
      const cleaned = cleanInquiry(row, id, (row as { updatedAt?: string })?.updatedAt ?? new Date().toISOString());
      return cleaned ? [cleaned] : [];
    });
  } catch {
    return [];
  }
}

export async function writeInquiries(account: string, inquiries: Inquiry[]): Promise<boolean> {
  if (!account || !inquiriesStoreAvailable()) return false;
  return (await redis(`set/${encodeURIComponent(await keyFor(account))}`, JSON.stringify(trim(inquiries)))) !== null;
}

/**
 * Keep the newest MAX_INQUIRIES, giving up finished work before live work.
 *
 * Pure, and exported so the rule can be tested without a store — the same
 * split the rest of this file describes.
 */
export function trim(inquiries: readonly Inquiry[]): Inquiry[] {
  if (inquiries.length <= MAX_INQUIRIES) return inquiries.slice();
  const open = inquiries.filter((row) => row.status !== "converted" && row.status !== "lost");
  const closed = inquiries
    .filter((row) => row.status === "converted" || row.status === "lost")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  // Live work is never dropped, even past the cap: an advisor with 500 open
  // enquiries has a different problem than one this function can solve.
  return [...open, ...closed].slice(0, Math.max(MAX_INQUIRIES, open.length));
}
