/**
 * What each plan actually includes, in a customer's words.
 *
 * WHY THIS IS DERIVED AND NOT WRITTEN OUT. A pricing page is the one page on a
 * site that can be read back as a promise, so every line here comes from the
 * same constants that ENFORCE the thing — PLAN_FEATURES and BUILT_IN_LIMITS in
 * lib/account-limits.ts. A feature cannot be advertised here and gated
 * differently there, because there is only one table and this reads it. Add an
 * entitlement to the code and it appears here; take one away and it leaves.
 *
 * NO PRICE LIVES IN THIS FILE. The amounts are the owner's, set on
 * /admin/settings/plans and read at request time through offerLine() in
 * lib/plan-billing.ts, which already refuses to print a number the site cannot
 * stand behind: nothing at all while the offering is "soon", and in card mode
 * only what Stripe itself reports. A page that hardcoded "$29" would be a
 * promise the billing code never made.
 */

import { BUILT_IN_LIMITS, PLAN_FEATURES, UNLIMITED, type PlanFeatures } from "@/lib/account-limits";
import { PLAN_BLURB, PLAN_LABELS, type AccountPlan } from "@/lib/account-plans";
import { PAID_PLANS, type PaidPlan } from "@/lib/plan-billing";

/**
 * One entitlement, said the way somebody deciding would say it. Order is the
 * order they are read in — what the plan is for first, the finer tools after.
 */
const FEATURE_LINES: Array<{ key: keyof PlanFeatures; line: string }> = [
  { key: "companionApp", line: "The White Glove app for your own trip — a day at a time, and the wallet on your phone with no signal" },
  { key: "companionClients", line: "Hand each client their own app by a link, and keep the conversation with them in one inbox" },
  { key: "ownBranding", line: "Your name and logo on the client's app and printed itinerary, in place of ours" },
  { key: "templates", line: "Save a trip as a template and start the next one from it" },
  { key: "analytics", line: "Your business at a glance above the pipeline — what is active, what leaves soon, what is outstanding" },
  { key: "assistantHistory", line: "Your assistant conversations kept between visits" },
];

/** A ceiling worth saying out loud. An unlimited one is not news; it is silence. */
function limitLines(plan: AccountPlan): string[] {
  const limits = BUILT_IN_LIMITS[plan];
  const lines: string[] = [];
  if (limits.trips !== UNLIMITED) {
    lines.push(limits.trips === 1 ? "One trip" : `${limits.trips} trips at a time`);
  } else {
    lines.push("As many trips as you are running");
  }
  if (limits.printsPerWeek !== UNLIMITED) {
    lines.push(`${limits.printsPerWeek} printable ${limits.printsPerWeek === 1 ? "copy" : "copies"} a week`);
  }
  // EXTRA LOGINS ARE NOT DESCRIBED HERE, because this deployment does not have
  // them: PlanLimits in this repository carries no staffSeats, and the agency
  // seats the other repository added are not part of what this site sells. A
  // pricing page must describe what a person would actually get for their
  // money, so a line copied across for tidiness would be a promise nobody here
  // could keep.
  return lines;
}

export type PlanCard = {
  plan: PaidPlan;
  /** "Advisor Starter". */
  name: string;
  /** Who it is for — never what it includes; that is `includes`. */
  blurb: string;
  /** Everything this plan does, ceilings first, then the tools it unlocks. */
  includes: string[];
  /** Whether this is bought once rather than subscribed to. */
  oneTime: boolean;
};

/**
 * The paid plans in the order somebody climbs them.
 *
 * `free` is not here on purpose. It is not a plan anybody chooses — it is what
 * an account is before it has bought anything, and it can plan nothing. A
 * pricing page listing it as an option would be offering a thing that does not
 * work.
 */
export function planCards(): PlanCard[] {
  return PAID_PLANS.map((plan) => ({
    plan,
    name: PLAN_LABELS[plan],
    blurb: PLAN_BLURB[plan],
    includes: [
      ...limitLines(plan),
      ...FEATURE_LINES.filter((entry) => PLAN_FEATURES[plan][entry.key]).map((entry) => entry.line),
    ],
    oneTime: plan === "one_trip",
  }));
}

/**
 * What separates this plan from the one below it — the reason to move up.
 *
 * Computed rather than written, for the same reason as everything else here:
 * the difference between two plans is a fact about the tables, and the moment
 * it is typed out by hand it starts drifting from them.
 */
export function whatThisAdds(plan: PaidPlan): string[] {
  const index = PAID_PLANS.indexOf(plan);
  if (index <= 0) return [];
  const below = PAID_PLANS[index - 1];
  return FEATURE_LINES.filter((entry) => PLAN_FEATURES[plan][entry.key] && !PLAN_FEATURES[below][entry.key]).map(
    (entry) => entry.line,
  );
}
