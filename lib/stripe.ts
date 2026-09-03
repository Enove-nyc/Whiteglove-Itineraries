/**
 * Talking to Stripe, over HTTP, with no dependency.
 *
 * WHY NOT THE `stripe` PACKAGE. This site already talks to Resend, Upstash,
 * Duffel and Stay22 with `fetch` and a form body, and the two calls it makes to
 * Stripe are a checkout session and a billing portal session. A 700kb SDK to
 * post two forms would be the largest dependency in the project, and every one
 * of its releases would be a reason to redeploy a site that takes no money most
 * months. If this ever grows subscription schedules, metered usage or invoices,
 * the SDK is the right answer and this file is what it replaces.
 *
 * NO CARD NUMBER EVER REACHES THIS SITE. Checkout happens on Stripe's own page;
 * this file sends a price id and gets back a URL to send somebody to.
 *
 * EVERY FUNCTION HERE FAILS SOFT AND SAYS WHY. A traveller pressing subscribe
 * and getting a stack trace is worse than one being told, plainly, that this is
 * not available at the moment — and the owner needs the real reason, so the
 * reason comes back as a string rather than being thrown away.
 */

import { createHmac, timingSafeEqual } from "crypto";

const API = "https://api.stripe.com/v1";

export function stripeSecretKey(): string {
  return process.env.STRIPE_SECRET_KEY?.trim() || "";
}

export function stripeWebhookSecret(): string {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || "";
}

/** What the deployment has, for the admin screen and for `offeringProblem`. */
export function stripeReadiness() {
  const key = stripeSecretKey();
  return {
    secretKey: Boolean(key),
    webhookSecret: Boolean(stripeWebhookSecret()),
    /**
     * A test key is not a mistake — it is the right thing while the owner is
     * trying it out — but a site quietly taking test cards forever is, so the
     * admin screen says which one is in use.
     */
    testMode: key.startsWith("sk_test_"),
  };
}

/* ---- form encoding ------------------------------------------------------ */

/**
 * Stripe's API is form-encoded with bracketed paths, not JSON.
 * `{ line_items: [{ price: "p" }] }` has to go out as `line_items[0][price]=p`.
 */
function encode(value: unknown, prefix = "", out: string[] = []): string[] {
  if (value === undefined || value === null) return out;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => encode(entry, `${prefix}[${index}]`, out));
    return out;
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      encode(entry, prefix ? `${prefix}[${key}]` : key, out);
    }
    return out;
  }
  out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
  return out;
}

export type StripeResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

/**
 * Exported so lib/stripe-connect.ts can talk to the SAME Stripe account this
 * file does (the platform account — Connect calls like creating a connected
 * account, or a destination charge, are ordinary platform-account API calls,
 * just with a `destination`/`account` parameter) without a second hand-rolled
 * HTTP client next to this one.
 */
export async function call<T>(path: string, body?: Record<string, unknown>, idempotencyKey?: string): Promise<StripeResult<T>> {
  const key = stripeSecretKey();
  if (!key) return { ok: false, error: "STRIPE_SECRET_KEY is not set on this deployment." };
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    const response = await fetch(`${API}/${path}`, {
      method: body ? "POST" : "GET",
      headers,
      body: body ? encode(body).join("&") : undefined,
      cache: "no-store",
    });
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* Stripe always returns JSON; a body that is not is itself the error. */
    }
    if (!response.ok) {
      const message = (parsed as { error?: { message?: string } } | null)?.error?.message;
      return { ok: false, status: response.status, error: message || text || `Stripe returned HTTP ${response.status}.` };
    }
    return { ok: true, data: parsed as T };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/* ---- prices ------------------------------------------------------------- */

export type StripePrice = {
  id: string;
  unit_amount: number | null;
  currency: string;
  recurring?: { interval?: string; interval_count?: number } | null;
  active?: boolean;
};

/**
 * The price, from Stripe, cached for a few minutes.
 *
 * THIS IS THE ONLY PLACE A SUBSCRIPTION PRICE COMES FROM when the site is
 * taking cards. A number typed into the admin and a number charged by Stripe
 * will drift apart eventually — somebody raises the price in the dashboard and
 * forgets the website — and the version the traveller reads must be the one
 * that is going to appear on their statement.
 *
 * Cached per server instance rather than in Redis: it is one small call, it is
 * only made when somebody is actually looking at the account page, and a stale
 * price for five minutes after a change is not a promise anybody relied on.
 */
const priceCache = new Map<string, { at: number; price: StripePrice | null }>();
const PRICE_TTL_MS = 5 * 60 * 1000;

export async function readPrice(priceId: string): Promise<StripePrice | null> {
  const id = priceId.trim();
  if (!id) return null;
  const cached = priceCache.get(id);
  if (cached && Date.now() - cached.at < PRICE_TTL_MS) return cached.price;
  const result = await call<StripePrice>(`prices/${encodeURIComponent(id)}`);
  const price = result.ok ? result.data : null;
  priceCache.set(id, { at: Date.now(), price });
  return price;
}

/**
 * "$12 a month". Empty string when there is nothing certain to say.
 *
 * Never falls back to a guess. If Stripe cannot be reached the caller shows no
 * price at all, which is the only safe thing — a wrong price on a subscribe
 * button is a complaint at best and a chargeback at worst.
 */
export function describePrice(price: StripePrice | null): string {
  if (!price || typeof price.unit_amount !== "number") return "";
  const amount = price.unit_amount / 100;
  let money: string;
  try {
    money = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: price.currency?.toUpperCase() || "USD",
      // Whole amounts read better without the trailing zeros on a button.
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    money = `${amount} ${price.currency?.toUpperCase() || ""}`.trim();
  }
  const interval = price.recurring?.interval;
  const count = price.recurring?.interval_count ?? 1;
  if (!interval) return money;
  if (count > 1) return `${money} every ${count} ${interval}s`;
  return `${money} a ${interval}`;
}

/* ---- checkout ----------------------------------------------------------- */

export type CheckoutSession = { id: string; url?: string | null; customer?: string | null };

/**
 * A hosted checkout page for one subscription, or for a single one-time
 * payment — see lib/plan-billing.ts's ONE_TIME_PLANS. `mode: "payment"` has
 * no renewal and no cancellation, so `subscription_data` — meaningless for a
 * one-time charge, and rejected by Stripe if sent with one — is only ever
 * attached in subscription mode.
 *
 * `clientReferenceId` is the account — it comes back on the completed event and
 * is how a payment finds the person who made it. The customer's email is
 * pre-filled so Stripe does not create a second customer for somebody who
 * already has one.
 *
 * `trialDays`, when given, is attached to `subscription_data` and Stripe's own
 * checkout page shows the trial terms before anybody enters a card — nothing
 * on this site has to say so separately for the charge itself to be honest.
 */
export async function createCheckoutSession(input: {
  priceId: string;
  account: string;
  email?: string;
  customerId?: string;
  successUrl: string;
  cancelUrl: string;
  /** So the webhook knows which plan was bought without looking the price up. */
  plan: string;
  /**
   * The trip a Trip Pass was bought FROM, if there was one.
   *
   * Carried so the webhook can land the pass already spent on it — somebody
   * who pressed buy while looking at their trip should not have to come back
   * and choose it again. Bought from the pricing page there is no trip yet,
   * this is left off, and the pass is spare until they spend it.
   */
  trip?: string;
  /** "subscription" unless told otherwise — see the note above. */
  mode?: "subscription" | "payment";
  /**
   * Days free before the card is charged — only ever set for a first
   * subscription, never a one-time purchase. See trialEligible in
   * lib/plan-billing.ts, the one place that decides who qualifies.
   */
  trialDays?: number;
}): Promise<StripeResult<CheckoutSession>> {
  const mode = input.mode ?? "subscription";
  const body: Record<string, unknown> = {
    mode,
    line_items: [{ price: input.priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.account.slice(0, 200),
    allow_promotion_codes: true,
    metadata: {
      account: input.account.slice(0, 200),
      plan: input.plan,
      ...(input.trip ? { trip: input.trip.slice(0, 200) } : {}),
    },
  };
  if (mode === "subscription") {
    // Repeated on the subscription itself: the events that arrive months later
    // — a renewal, a cancellation — carry the subscription, not the session.
    body.subscription_data = {
      metadata: { account: input.account.slice(0, 200), plan: input.plan },
      ...(input.trialDays && input.trialDays > 0 ? { trial_period_days: input.trialDays } : {}),
    };
  } else {
    // A one-time purchase grants a permanent entitlement the moment the
    // webhook sees it paid (lib/plan-billing-store.ts's writeOneTimePurchase)
    // — there is no subscription behind it to later correct a bad charge.
    // Several of Stripe's other payment methods (ACH debit, and others by
    // country) settle DAYS after checkout completes, not at checkout at all,
    // so leaving the method list open would mean "completed" and "paid" are
    // two different moments for the same session. Cards settle immediately;
    // pinning to cards keeps that gap from existing for this flow at all.
    body.payment_method_types = ["card"];
  }
  if (input.customerId) body.customer = input.customerId;
  else if (input.email) body.customer_email = input.email;
  return call<CheckoutSession>("checkout/sessions", body);
}

/** Stripe's own page for changing a card or cancelling. */
export async function createPortalSession(input: {
  customerId: string;
  returnUrl: string;
}): Promise<StripeResult<{ url?: string | null }>> {
  return call<{ url?: string | null }>("billing_portal/sessions", {
    customer: input.customerId,
    return_url: input.returnUrl,
  });
}

export type StripeSubscription = {
  id: string;
  status: string;
  customer: string | { id?: string };
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data?: Array<{ id: string; quantity?: number; price?: { id?: string } }> };
};

export async function readSubscriptionFromStripe(id: string): Promise<StripeSubscription | null> {
  const result = await call<StripeSubscription>(`subscriptions/${encodeURIComponent(id)}`);
  return result.ok ? result.data : null;
}

/**
 * Add, change, or remove an agency's seat line item on an EXISTING
 * subscription — see lib/agency.ts. This never touches the base Advisor Pro
 * item, only the one item on this seat price.
 *
 * READS BEFORE IT WRITES, because updating a subscription item needs that
 * item's own id (`si_...`), not the price id — sending the price id alone a
 * second time would add a duplicate item instead of changing the quantity of
 * the one already there. `quantity: 0` deletes the item outright rather than
 * leaving a zero-quantity line on the invoice.
 *
 * `always_invoice` settles the prorated difference right away — the owner
 * sees the charge or credit the moment they change seats, not buried in next
 * month's total.
 */
export async function setSubscriptionSeatQuantity(input: {
  subscriptionId: string;
  seatPriceId: string;
  quantity: number;
}): Promise<StripeResult<StripeSubscription>> {
  const current = await readSubscriptionFromStripe(input.subscriptionId);
  if (!current) return { ok: false, error: "That subscription could not be read." };
  const existing = current.items?.data?.find((item) => item.price?.id === input.seatPriceId);

  if (input.quantity <= 0) {
    if (!existing) return { ok: true, data: current };
    return call<StripeSubscription>(`subscriptions/${encodeURIComponent(input.subscriptionId)}`, {
      items: [{ id: existing.id, deleted: true }],
      proration_behavior: "always_invoice",
    });
  }

  return call<StripeSubscription>(`subscriptions/${encodeURIComponent(input.subscriptionId)}`, {
    items: [existing ? { id: existing.id, quantity: input.quantity } : { price: input.seatPriceId, quantity: input.quantity }],
    proration_behavior: "always_invoice",
  });
}

/* ---- webhooks ----------------------------------------------------------- */

/**
 * Is this really from Stripe?
 *
 * WITHOUT THIS THE WEBHOOK IS AN OPEN DOOR. The endpoint's whole job is to put
 * accounts onto paid plans; anybody who found the URL could post a made-up
 * "payment succeeded" and give themselves Business. So the raw body — not the
 * parsed one, the bytes exactly as they arrived — is signed with the endpoint
 * secret and compared in constant time, and a timestamp older than the
 * tolerance is refused so a captured request cannot be replayed.
 *
 * Returns the parsed event, or null. Null means do nothing, and say nothing:
 * a caller that tells a forger why their forgery failed is helping them.
 */
export function verifyWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  now = Date.now(),
  toleranceSeconds = 300,
): { type: string; data: { object: Record<string, unknown> } } | null {
  if (!rawBody || !signatureHeader || !secret) return null;

  let timestamp = "";
  const signatures: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key?.trim() === "t") timestamp = value?.trim() ?? "";
    else if (key?.trim() === "v1" && value) signatures.push(value.trim());
  }
  if (!timestamp || signatures.length === 0) return null;

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return null;
  if (Math.abs(now / 1000 - sentAt) > toleranceSeconds) return null;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const matched = signatures.some((candidate) => {
    const given = Buffer.from(candidate, "utf8");
    return given.length === expectedBuffer.length && timingSafeEqual(given, expectedBuffer);
  });
  if (!matched) return null;

  try {
    const parsed = JSON.parse(rawBody) as { type?: string; data?: { object?: Record<string, unknown> } };
    if (!parsed?.type || !parsed.data?.object) return null;
    return { type: parsed.type, data: { object: parsed.data.object } };
  } catch {
    return null;
  }
}

/** The customer id off an event object, whether it is expanded or not. */
export function customerIdOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return "";
}

/**
 * Which of Stripe's many statuses means "this person is paid up".
 *
 * `trialing` counts — they are inside something the owner set up on purpose.
 * `past_due` also counts, deliberately: Stripe retries a failed card for up to
 * two weeks, and taking somebody's Pro account away on the morning their card
 * expired, before they have had a chance to fix it, is how a subscription
 * business makes an enemy of a customer who was going to keep paying.
 */
export function statusIsPaid(status: string): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}
