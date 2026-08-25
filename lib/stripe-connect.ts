import "server-only";

/**
 * Stripe Connect — one connected account per Business planner, trip payments
 * as destination charges into it.
 *
 * THE MONEY-FLOW DECISION. Section 8 of the brief asked this to be made
 * explicit before writing any of it: is White Glove collecting the money
 * itself, collecting on behalf of planners, or paying planners directly?
 * THIS SITE NEVER HOLDS A CLIENT'S MONEY. Every trip payment is a destination
 * charge — created on White Glove's own platform account (the same
 * STRIPE_SECRET_KEY lib/stripe.ts already uses for subscription billing) with
 * `transfer_data.destination` set to the planner's own Stripe Connect
 * account. Stripe settles the funds to the PLANNER's account, not White
 * Glove's; White Glove is never a money-transmitter for anyone else's trip.
 *
 * WHITE GLOVE'S TAKE RATE. A small platform fee (application_fee_amount, 0.1%
 * by default, PLATFORM_FEE_BPS to change it) is retained from each charge — the
 * only slice White Glove keeps. The charge is also created `on_behalf_of` the
 * planner's connected account, which makes them the merchant of record, so
 * Stripe's own processing fee comes out of THEIR settlement, not White Glove's.
 * Net effect: the traveler pays the face amount, and both Stripe's fee and
 * White Glove's 0.1% come off the planner's payout. See platformFeeCents and
 * createDestinationPaymentIntent.
 *
 * NO CARD NUMBER EVER REACHES THIS SITE, same rule as lib/stripe.ts's own
 * subscription checkout: the client app collects the card with Stripe
 * Elements, in the browser, against a PaymentIntent's client secret. This
 * file only ever sees a destination account id, an amount, and metadata.
 *
 * EXPRESS ACCOUNTS. Stripe hosts the onboarding (identity, bank details,
 * agreements) — this site never sees or stores anything about a planner's
 * own bank account. onboardingLinkFor() below is a one-time link to that
 * hosted flow; refreshAccountStatus() is how this site later learns Stripe
 * finished with them.
 */

import { call, stripeSecretKey } from "@/lib/stripe";
import { platformFeeCents } from "@/lib/platform-fee";

/** Whether a planner can even be sent to connect a Stripe account. */
export function canConnectAccounts(): boolean {
  return Boolean(stripeSecretKey());
}

/**
 * Its OWN webhook secret — a trip payment lands on a different registered
 * endpoint (/api/payments/webhook) than subscription billing does
 * (/api/billing/webhook), and Stripe hands every endpoint its own signing
 * secret regardless of which account the events describe. Never
 * stripeWebhookSecret() here — that one verifies a different endpoint.
 */
export function paymentsWebhookSecret(): string {
  return process.env.STRIPE_PAYMENTS_WEBHOOK_SECRET?.trim() || "";
}

/** The key a browser is allowed to hold — never the secret key. */
export function stripePublishableKey(): string {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || "";
}

/** Whether a real charge can be confirmed AND shown to a traveler — see connections.ts. */
export function canAcceptPayments(): boolean {
  return Boolean(stripeSecretKey() && paymentsWebhookSecret() && stripePublishableKey());
}

type ConnectAccountData = { id: string; charges_enabled?: boolean; payouts_enabled?: boolean };

/** A brand-new Express connected account for this planner. */
export async function createConnectAccount(ownerEmail: string): Promise<{ accountId: string } | { error: string }> {
  const result = await call<ConnectAccountData>("accounts", {
    type: "express",
    email: ownerEmail,
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
  });
  if (!result.ok) return { error: result.error };
  return { accountId: result.data.id };
}

/** A one-time link to Stripe's own hosted onboarding for this connected account. */
export async function onboardingLinkFor(accountId: string, refreshUrl: string, returnUrl: string): Promise<{ url: string } | { error: string }> {
  const result = await call<{ url: string }>("account_links", {
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  if (!result.ok) return { error: result.error };
  return { url: result.data.url };
}

/** Whatever Stripe currently says about this connected account's own readiness. */
export async function refreshAccountStatus(accountId: string): Promise<{ chargesEnabled: boolean; payoutsEnabled: boolean } | null> {
  const result = await call<ConnectAccountData>(accountId);
  if (!result.ok) return null;
  return { chargesEnabled: Boolean(result.data.charges_enabled), payoutsEnabled: Boolean(result.data.payouts_enabled) };
}

type PaymentIntentData = { id: string; client_secret: string };

/**
 * A PaymentIntent for one traveler/family's payment, destined for their
 * planner's own connected account — never White Glove's.
 *
 * `on_behalf_of` makes the planner the merchant of record, so Stripe's fee is
 * drawn from their settlement; `application_fee_amount` is White Glove's 0.1%.
 * Together: the traveler pays the face amount, both fees come off the planner's
 * payout. metadata carries everything the webhook needs to record the payment
 * against the right trip and unit; Stripe hands metadata back on every event
 * for this PaymentIntent untouched, so the webhook never has to guess.
 */
export async function createDestinationPaymentIntent(input: {
  amountCents: number;
  currency: string;
  destinationAccountId: string;
  ownerEmail: string;
  tripId: string;
  unitKey: string;
  scheduleItemId?: string;
  idempotencyKey?: string;
}): Promise<{ clientSecret: string; paymentIntentId: string } | { error: string }> {
  const feeCents = platformFeeCents(input.amountCents);
  const result = await call<PaymentIntentData>(
    "payment_intents",
    {
      amount: input.amountCents,
      currency: input.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      transfer_data: { destination: input.destinationAccountId },
      on_behalf_of: input.destinationAccountId,
      ...(feeCents > 0 ? { application_fee_amount: feeCents } : {}),
      metadata: {
        ownerEmail: input.ownerEmail,
        tripId: input.tripId,
        unitKey: input.unitKey,
        ...(input.scheduleItemId ? { scheduleItemId: input.scheduleItemId } : {}),
      },
    },
    input.idempotencyKey,
  );
  if (!result.ok) return { error: result.error };
  return { clientSecret: result.data.client_secret, paymentIntentId: result.data.id };
}
