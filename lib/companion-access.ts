/**
 * MAY THIS TRIP OPEN IN THE WHITE GLOVE APP?
 *
 * One question, asked in one place, by every door that shows the app: /app for
 * the account's own trip, and /i/[shareId]/app for a code.
 *
 * There are two ways a trip earns the app, and they are different shapes:
 *
 *   THE PLAN. Advisor Starter and Advisor Pro run several trips at once and
 *   the app comes with all of them (appCoversEveryTrip). Nothing per-trip to
 *   buy, nothing to spend.
 *
 *   A TRIP PASS. Everybody else buys the app one trip at a time, and the pass
 *   is spent on the trip they are taking (lib/trip-pass.ts). This is why the
 *   gate cannot be a function of the plan alone, which is what it used to be:
 *   a single $9 purchase set the account to `one_trip` and opened the app on
 *   every trip that account would ever have.
 *
 * WHY THE PLAN CHECK STILL COMES FIRST. It costs nothing — the plan is already
 * in hand at every call site — and it means an advisor's read never touches
 * the pass store at all.
 */

import { appCoversEveryTrip, mayUseCompanionApp } from "@/lib/account-limits";
import type { AccountPlan } from "@/lib/account-plans";
import { readTripPasses, tripCoveredByPass } from "@/lib/trip-pass-store";

/**
 * The gate. `account` is the trip's OWNER, not whoever is looking — a client
 * holding a code has no account and no plan, and it is the adviser's plan that
 * decides whether that code opens the app.
 */
export async function mayOpenTripInApp(account: string, plan: AccountPlan, tripId: string): Promise<boolean> {
  if (appCoversEveryTrip(plan)) return true;
  if (!tripId) return false;
  return tripCoveredByPass(account, tripId);
}

/**
 * Why a trip will not open, in a sentence somebody can act on.
 *
 * Never mentions an amount — prices are the owner's, set in Stripe, and
 * offerLine() is the only thing on the site allowed to print one.
 */
export function whyTripIsNotInApp(plan: AccountPlan): string {
  if (appCoversEveryTrip(plan)) return "";
  return mayUseCompanionApp(plan)
    ? "A Trip Pass opens one trip in the app. Use one on this trip, or buy another."
    : "The White Glove app opens a trip on your phone — a day at a time, and the wallet kept for when there is no signal. A Trip Pass opens this one.";
}

/**
 * Whether the app is any part of this account at all — the outer door.
 *
 * Distinct from mayOpenTripInApp, which is about ONE trip. This one answers
 * "is there an app here for this person", and it is what the account-wide
 * settings behind the app ask before they will save anything. Somebody who has
 * ever bought a pass has an app; somebody on Personal who has not, does not.
 */
export async function mayReachTheApp(account: string, plan: AccountPlan): Promise<boolean> {
  if (appCoversEveryTrip(plan)) return true;
  if (!account) return false;
  return (await readTripPasses(account)).length > 0;
}
