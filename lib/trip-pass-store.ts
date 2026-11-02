/**
 * Where an account's Trip Passes are kept.
 *
 * One record per account: the list of passes bought, each either spare or
 * attached to a trip. Written by the Stripe webhook when a one-time purchase
 * settles, and by the one action that spends a pass on a trip. The RULES are
 * in lib/trip-pass.ts, which has no storage in it and can be read on its own;
 * this file is the Redis around them.
 *
 * IT IS NOT THE ACCOUNT'S PLAN. Somebody holding a pass is still on Personal —
 * a pass is a thing they own on one trip, not a tier they are on. That
 * separation is the whole point: the plan answers "what may this account do",
 * and a pass answers "may this ONE trip open in the app".
 */

import { identityKey } from "@/lib/identity";
import { randomBytes } from "crypto";
import { paidRedisCommand } from "@/lib/paid-redis";
import { releaseOrphaned, spendPassOn, tripHasPass, unspentPasses, type TripPass } from "@/lib/trip-pass";

const PASS_PREFIX = "white-glove:trip-passes:";

export function tripPassStoreAvailable() {
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

function key(account: string) {
  return encodeURIComponent(`${PASS_PREFIX}${identityKey(account)}`);
}

function isPass(value: unknown): value is TripPass {
  if (!value || typeof value !== "object") return false;
  const pass = value as Record<string, unknown>;
  return typeof pass.id === "string" && typeof pass.boughtAt === "string";
}

export async function readTripPasses(account: string): Promise<TripPass[]> {
  if (!account || !tripPassStoreAvailable()) return [];
  const raw = await redis<string>(`get/${key(account)}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPass).map((pass) => ({
      id: pass.id,
      boughtAt: pass.boughtAt,
      tripId: typeof pass.tripId === "string" && pass.tripId ? pass.tripId : null,
      spentAt: typeof pass.spentAt === "string" && pass.spentAt ? pass.spentAt : null,
    }));
  } catch {
    return [];
  }
}

/** Compare-and-set prevents a stale spend/release from erasing a paid grant. */
const SAVE_PASSES = `
local current = redis.call("GET", KEYS[1])
if ARGV[1] == "missing" then
  if current then return 0 end
elseif current ~= ARGV[2] then
  return 0
end
redis.call("SET", KEYS[1], ARGV[3])
return 1
`;

async function mutatePasses<T>(
  account: string,
  change: (passes: TripPass[]) => { passes: TripPass[]; value: T },
): Promise<{ value: T } | null> {
  if (!account || !tripPassStoreAvailable()) return null;
  const rawKey = `${PASS_PREFIX}${identityKey(account)}`;
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const raw = await paidRedisCommand<string | null>(["GET", rawKey]);
      const parsed: unknown = raw === null ? [] : JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.every(isPass)) return null;
      const next = change(parsed);
      const encoded = JSON.stringify(next.passes);
      if (raw === encoded) return { value: next.value };
      const saved = await paidRedisCommand<number>([
        "EVAL", SAVE_PASSES, 1, rawKey, raw === null ? "missing" : "present", raw ?? "", encoded,
      ]);
      if (saved === 1) return { value: next.value };
    }
  } catch {
    // A failed read must never be interpreted as an empty pass ledger.
  }
  return null;
}

/**
 * A purchase settled. Grants one pass.
 *
 * `tripId` is the trip the buyer was looking at when they paid, carried
 * through Stripe's metadata — the pass lands already spent on it, so somebody
 * who bought the pass FROM a trip never has to come back and choose. Bought
 * from the pricing page instead, there is no trip yet and the pass is spare.
 */
export async function grantTripPass(account: string, tripId?: string): Promise<TripPass | null> {
  const now = new Date().toISOString();
  const id = randomBytes(9).toString("base64url");
  const result = await mutatePasses(account, (passes) => {
    const attach = Boolean(tripId && !tripHasPass(passes, tripId));
    const pass: TripPass = { id, boughtAt: now, tripId: attach ? tripId! : null, spentAt: attach ? now : null };
    return { passes: [...passes, pass], value: pass };
  });
  return result?.value ?? null;
}

export type SpendOutcome = { ok: true } | { ok: false; reason: "none_left" | "already" | "storage" };

/** Put one of this account's spare passes on this trip, for good. */
export async function spendTripPass(account: string, tripId: string): Promise<SpendOutcome> {
  if (!tripId) return { ok: false, reason: "storage" };
  const result = await mutatePasses<SpendOutcome>(account, (passes) => {
    const next = spendPassOn(passes, tripId, new Date().toISOString());
    return { passes: next.passes, value: next.ok ? { ok: true } : { ok: false, reason: next.reason } };
  });
  return result?.value ?? { ok: false, reason: "storage" };
}

/** Does THIS trip open in the app on a pass? The question every gate asks. */
export async function tripCoveredByPass(account: string, tripId: string): Promise<boolean> {
  if (!account || !tripId) return false;
  return tripHasPass(await readTripPasses(account), tripId);
}

/** How many are spare, for the screen that offers to spend one. */
export async function spareTripPasses(account: string): Promise<number> {
  return unspentPasses(await readTripPasses(account)).length;
}

/**
 * Hand back passes whose trip has been deleted.
 *
 * Called where the account's trips are already in hand, so it costs a read
 * only when something is actually orphaned. See releaseOrphaned in
 * lib/trip-pass.ts for why this is not a way to move a pass.
 */
export async function releaseDeletedTripPasses(account: string, liveTripIds: readonly string[]): Promise<void> {
  await mutatePasses(account, (passes) => ({ passes: releaseOrphaned(passes, liveTripIds), value: true }));
}
