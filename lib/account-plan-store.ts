/**
 * Where an account's plan lives, and where a request for one waits.
 *
 * The plan goes on the account record itself, beside the name and the phone —
 * it is a fact about the account, and keeping it anywhere else would mean two
 * places that can disagree about who somebody is.
 *
 * The requests are their own list, because they are not facts about an account
 * so much as a queue of things the owner has to answer. One open request per
 * account: asking twice replaces the first rather than making a second, so the
 * queue is a list of people waiting rather than a list of button presses.
 */

import {
  type AccountPlan,
  type PlanRequest,
  type PlanRequestState,
  isAccountPlan,
  planOf,
} from "@/lib/account-plans";
import { identityKey } from "@/lib/identity";
import { ownerEmail } from "@/lib/admin-roles";

const REQUESTS_KEY = "white-glove:plan-requests";
const ACCOUNT_PREFIX = "white-glove:account:";

export function planStoreAvailable() {
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

/* ---- the plan on an account -------------------------------------------- */

type StoredAccount = Record<string, unknown> & { plan?: string };

async function readAccount(account: string): Promise<StoredAccount | null> {
  const raw = await redis<string>(`get/${encodeURIComponent(`${ACCOUNT_PREFIX}${identityKey(account)}`)}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredAccount;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Which plan an account is on. Nothing bought yet for anything unset or unreadable.
 *
 * THE OWNER IS ALWAYS ON THE TOP PLAN. The owner runs this product; nothing is
 * bought for that account, so its stored plan is whatever it happened to be —
 * and with no adviser plan on it, the home page sent him to the one-trip app
 * and the advisor dashboard showed him its own paywall. Keyed on OWNER_EMAIL,
 * the same fact admin-roles keys the admin on, so the person who signs into
 * the dashboard is the person every plan gate lets through. Unset OWNER_EMAIL
 * (tests, a fresh environment) leaves this a no-op.
 */
export async function getPlan(account: string): Promise<AccountPlan> {
  const owner = ownerEmail();
  if (owner && identityKey(account) === identityKey(owner)) return "pro";
  return planOf(await readAccount(account));
}

/**
 * Put an account on a plan.
 *
 * READS THE RECORD AND WRITES IT BACK WHOLE, because that is how everything
 * else in this store works and a partial write would drop the password hash.
 * If the record cannot be read, nothing is written — better to fail visibly
 * than to replace an account with a record holding only a plan.
 */
export async function setPlan(account: string, plan: AccountPlan, by: string): Promise<boolean> {
  if (!isAccountPlan(plan)) return false;
  const record = await readAccount(account);
  if (!record) return false;
  const next = { ...record, plan, planSince: new Date().toISOString(), planSetBy: by };
  const key = encodeURIComponent(`${ACCOUNT_PREFIX}${identityKey(account)}`);
  return (await redis(`set/${key}/${encodeURIComponent(JSON.stringify(next))}`)) !== null;
}

/* ---- the queue of requests --------------------------------------------- */

async function readRequests(): Promise<PlanRequest[]> {
  const raw = await redis<string>(`get/${REQUESTS_KEY}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PlanRequest[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeRequests(rows: PlanRequest[]): Promise<boolean> {
  return (await redis(`set/${REQUESTS_KEY}`, JSON.stringify(rows))) !== null;
}

const sameAccount = (a: string, b: string) => identityKey(a) === identityKey(b);

/**
 * Record that somebody wants a different kind of account.
 *
 * Replaces their open request rather than adding to it. Somebody who asks for
 * Pro, thinks better of it and asks for Business has changed their mind once —
 * they have not become two people in the queue, and the owner should see what
 * they want now rather than every step of them deciding.
 *
 * An answered request is left where it is: it is what happened, and the new
 * ask sits beside it.
 */
export async function askForPlan(input: { account: string; wanted: AccountPlan; note?: string }): Promise<boolean> {
  if (!planStoreAvailable()) return false;
  const rows = await readRequests();
  const kept = rows.filter((row) => !(sameAccount(row.account, input.account) && row.state === "asked"));
  kept.unshift({
    account: input.account,
    wanted: input.wanted,
    note: input.note?.trim() || undefined,
    askedAt: new Date().toISOString(),
    state: "asked",
  });
  return writeRequests(kept);
}

/** Everything asked, newest first. */
export async function listPlanRequests(): Promise<PlanRequest[]> {
  return readRequests();
}

/** The one request an account is waiting on, if there is one. */
export async function openRequestFor(account: string): Promise<PlanRequest | null> {
  const rows = await readRequests();
  return rows.find((row) => sameAccount(row.account, account) && row.state === "asked") ?? null;
}

/**
 * Answer a request.
 *
 * GRANTING SETS THE PLAN FIRST and marks the request second. The other order
 * leaves a moment where the queue says somebody has Pro and the account says
 * they do not — and if the second write fails, that is where it stays. This
 * way the worst case is an account on the right plan with a request still
 * showing as open, which the owner can see and press again.
 */
export async function answerRequest(
  account: string,
  state: Exclude<PlanRequestState, "asked">,
  by: string,
): Promise<{ ok: boolean; message: string }> {
  if (!planStoreAvailable()) return { ok: false, message: "This needs the private store connected." };
  const rows = await readRequests();
  const found = rows.find((row) => sameAccount(row.account, account) && row.state === "asked");
  if (!found) return { ok: false, message: "That request is not open any more." };

  if (state === "granted" && !(await setPlan(found.account, found.wanted, by))) {
    return { ok: false, message: "That account could not be read, so nothing was changed." };
  }

  found.state = state;
  found.answeredAt = new Date().toISOString();
  found.answeredBy = by;
  if (!(await writeRequests(rows))) {
    return state === "granted"
      ? { ok: true, message: "The plan was set, but the request could not be marked answered. Press it again." }
      : { ok: false, message: "That could not be saved." };
  }
  return { ok: true, message: state === "granted" ? "Done — the account is on the new plan." : "Marked as declined." };
}
