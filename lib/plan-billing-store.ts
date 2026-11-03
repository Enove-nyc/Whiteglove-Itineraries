import { ITINERARIES_IN_DEVELOPMENT } from "@/lib/launch-status";
/**
 * Where the plan-offering switch lives, and where a live subscription is
 * written down.
 *
 * TWO THINGS, KEPT APART ON PURPOSE.
 *
 * The offering is one record: is this open, how does somebody pay, what are the
 * prices. It is the owner's setting and nothing else writes it.
 *
 * A subscription is one record per account, written by the Stripe webhook and
 * read by the account page. It is deliberately NOT the account's plan — the
 * plan is on the account record, which is the one place anything asks "what is
 * this person allowed to do". This holds the *why*: which Stripe customer, when
 * it renews, whether it is about to end. So a plan set by hand by the owner and
 * a plan set by a card work identically everywhere else on the site, and losing
 * this store demotes nobody.
 */

import { updateTag } from "next/cache";
import { isAccountPlan, type AccountPlan } from "@/lib/account-plans";
import { cleanOffering, DEFAULT_OFFERING, type PlanOffering } from "@/lib/plan-billing";
import { identityKey } from "@/lib/identity";
import { statusIsPaid } from "@/lib/stripe";

const OFFERING_KEY = "white-glove:plan-offering";
const SUB_PREFIX = "white-glove:subscription:";
const SUB_INDEX = "white-glove:subscription-index";
const CUSTOMER_PREFIX = "white-glove:stripe-customer:";
const ONE_TIME_PREFIX = "white-glove:one-time-purchase:";

export const PLAN_OFFERING_TAG = "plan-offering";

export function planBillingStoreAvailable() {
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

/* ---- the offering ------------------------------------------------------- */

/**
 * The switch as it stands.
 *
 * A store that cannot be read returns the default — which is open, on "ask", so
 * a Redis outage leaves the account page doing what it has always done rather
 * than making the site look as though a feature had been withdrawn. What a
 * failure here CANNOT produce is Stripe: "stripe" only ever comes from a record
 * the owner saved, so no outage, bad parse or fresh deployment can end with
 * somebody's card being charged.
 */
export async function readPlanOffering(): Promise<PlanOffering> {
  // Keep this development preview closed without changing the shared offering record.
  if (ITINERARIES_IN_DEVELOPMENT) return cleanOffering({ ...DEFAULT_OFFERING, open: false, how: "soon" });
  if (!planBillingStoreAvailable()) return { ...DEFAULT_OFFERING };
  const raw = await redis<string>(`get/${OFFERING_KEY}`);
  if (!raw) return { ...DEFAULT_OFFERING };
  try {
    return cleanOffering(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_OFFERING };
  }
}

export async function writePlanOffering(offering: PlanOffering, by: string): Promise<boolean> {
  if (!planBillingStoreAvailable()) return false;
  const next = cleanOffering({ ...offering, updatedAt: new Date().toISOString(), updatedBy: by });
  if ((await redis(`set/${OFFERING_KEY}`, JSON.stringify(next))) === null) return false;
  try {
    updateTag(PLAN_OFFERING_TAG);
  } catch {
    /* no request context */
  }
  return true;
}

/* ---- a live subscription ------------------------------------------------ */

export type SubscriptionRecord = {
  /** The account it belongs to — what they sign in with. */
  account: string;
  plan: AccountPlan;
  /** Stripe's ids, so the owner can find it in his own dashboard. */
  customerId: string;
  subscriptionId: string;
  /** "active", "trialing", "past_due", "canceled" — Stripe's own word. */
  status: string;
  /** ISO. When the paid-up period runs out. */
  currentPeriodEnd?: string;
  /** True when they have cancelled but the paid period has not run out yet. */
  cancelAtPeriodEnd?: boolean;
  startedAt: string;
  updatedAt: string;
};

const subKey = (account: string) => `${SUB_PREFIX}${identityKey(account)}`;

export async function readSubscription(account: string): Promise<SubscriptionRecord | null> {
  if (!account || !planBillingStoreAvailable()) return null;
  const raw = await redis<string>(`get/${encodeURIComponent(subKey(account))}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SubscriptionRecord;
    return parsed && typeof parsed === "object" && parsed.account ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * One Trip pays once and never expires — see checkout.session.completed in
 * app/api/billing/webhook/route.ts, which sets the plan directly and writes
 * no SubscriptionRecord at all, because there is no subscription to record.
 * That is exactly the gap ownEntitledPlan below has to close: a One Trip
 * buyer whose plan is later overwritten (an agency invite, for instance)
 * has nothing in SubscriptionRecord to restore from. This is that record —
 * a permanent marker, not a status to watch, because the purchase itself
 * never lapses.
 */
export async function writeOneTimePurchase(account: string, plan: AccountPlan): Promise<boolean> {
  if (!account || !planBillingStoreAvailable()) return false;
  const key = encodeURIComponent(`${ONE_TIME_PREFIX}${identityKey(account)}`);
  return (await redis(`set/${key}`, JSON.stringify({ plan, purchasedAt: new Date().toISOString() }))) !== null;
}

export async function readOneTimePurchase(account: string): Promise<AccountPlan | null> {
  if (!account || !planBillingStoreAvailable()) return null;
  const raw = await redis<string>(`get/${encodeURIComponent(`${ONE_TIME_PREFIX}${identityKey(account)}`)}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { plan?: unknown };
    return isAccountPlan(parsed.plan) ? parsed.plan : null;
  } catch {
    return null;
  }
}

/**
 * What this account is entitled to on its OWN purchase, independent of
 * anything an agency granted it.
 *
 * WHY THIS EXISTS. Joining an agency sets a member's plan to pro by hand
 * (app/api/account/agency/join/route.ts), the same way the webhook below
 * sets it by hand when a card is charged. Leaving, being removed, or the
 * agency's own Pro subscription lapsing all have to take that hand-set plan
 * back — but "back" is not always free: somebody who was already paying for
 * their own Advisor Starter before they ever joined an agency is still
 * being charged for it, and somebody who bought One Trip still owns that
 * one trip forever. Dropping either to free would keep taking the first
 * one's money while showing them nothing for it, and would quietly undo a
 * purchase that has no expiry at all for the second. A live subscription
 * wins when there is one; a One Trip purchase (which never lapses) is
 * checked next; free is what is left once neither is true.
 */
export async function ownEntitledPlan(account: string): Promise<AccountPlan> {
  const sub = await readSubscription(account);
  if (sub && statusIsPaid(sub.status)) return sub.plan;
  const oneTime = await readOneTimePurchase(account);
  return oneTime ?? "free";
}

export async function writeSubscription(record: SubscriptionRecord): Promise<boolean> {
  if (!planBillingStoreAvailable()) return false;
  const ok = (await redis(`set/${encodeURIComponent(subKey(record.account))}`, JSON.stringify(record))) !== null;
  if (!ok) return false;
  await redis(`sadd/${SUB_INDEX}`, JSON.stringify([record.account]));
  return true;
}

/** Everything on a card right now, for the owner's own screen. */
export async function listSubscriptions(limit = 500): Promise<SubscriptionRecord[]> {
  if (!planBillingStoreAvailable()) return [];
  const accounts = await redis<string[]>(`smembers/${SUB_INDEX}`);
  if (!Array.isArray(accounts)) return [];
  const rows: SubscriptionRecord[] = [];
  for (const account of accounts.slice(0, limit)) {
    const row = await readSubscription(account);
    if (row) rows.push(row);
  }
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/* ---- which account a Stripe customer is --------------------------------- */

/**
 * Stripe hands back a customer id, not an email, on most of the events that
 * matter. This is the way back.
 *
 * Written when the checkout is created — before the card is ever entered — so
 * a webhook that arrives while the traveller is still on Stripe's page can
 * still be matched to somebody. Without it, a subscription that cancels months
 * later has no way home.
 */
export async function rememberCustomer(customerId: string, account: string): Promise<boolean> {
  if (!customerId || !account || !planBillingStoreAvailable()) return false;
  return (await redis(`set/${encodeURIComponent(`${CUSTOMER_PREFIX}${customerId}`)}`, account)) !== null;
}

export async function accountForCustomer(customerId: string): Promise<string | null> {
  if (!customerId || !planBillingStoreAvailable()) return null;
  return redis<string>(`get/${encodeURIComponent(`${CUSTOMER_PREFIX}${customerId}`)}`);
}
