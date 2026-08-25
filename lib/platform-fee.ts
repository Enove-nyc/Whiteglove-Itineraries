/**
 * White Glove's take rate on a trip payment — pure math, no Stripe, no
 * server-only guard, so it can be unit-tested on its own. lib/stripe-connect.ts
 * imports platformFeeCents to set application_fee_amount on the destination
 * charge; the fee is retained from the charge and the rest settles to the
 * advisor's connected account.
 */

/** The default take rate, in basis points. 10 bp = 0.1%. */
export const DEFAULT_PLATFORM_FEE_BPS = 10;

/**
 * The take rate actually in force, in basis points, from PLATFORM_FEE_BPS so
 * the owner can change it without a deploy. A missing, non-numeric, negative or
 * over-100% value falls back to the default rather than charging something
 * absurd.
 */
export function platformFeeBps(): number {
  const raw = process.env.PLATFORM_FEE_BPS?.trim();
  if (!raw) return DEFAULT_PLATFORM_FEE_BPS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 10000 ? Math.floor(n) : DEFAULT_PLATFORM_FEE_BPS;
}

/**
 * White Glove's platform fee on one charge, in whole cents.
 *
 * Rounded to the cent, and clamped so it can never be negative nor take the
 * whole charge — Stripe rejects an application fee that is not a positive
 * integer strictly below the amount. Below roughly a $10 trip, 0.1% rounds to
 * nothing, and taking nothing is the right answer there.
 */
export function platformFeeCents(amountCents: number): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
  const fee = Math.round((amountCents * platformFeeBps()) / 10000);
  return Math.min(Math.max(fee, 0), amountCents - 1);
}
