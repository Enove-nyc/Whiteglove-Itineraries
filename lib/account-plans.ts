/** Stable stored plan keys. Personal includes free planning; a Trip Pass adds app access to one trip. */

export const ACCOUNT_PLANS = ["free", "one_trip", "starter", "pro"] as const;
export type AccountPlan = (typeof ACCOUNT_PLANS)[number];

/** The one an account has before it has bought anything. Includes free planning — see lib/account-limits.ts. */
export const DEFAULT_PLAN: AccountPlan = "free";

/**
 * The names a person reads. The KEYS are not names: they are what is stored
 * on an account, sent to Stripe and written back by the webhook, so they
 * stay as they are for ever — renaming a tier is a label change and nothing
 * else, or every existing account and every subscription stops matching
 * itself.
 */
export const PLAN_LABELS: Record<AccountPlan, string> = {
  free: "Personal",
  one_trip: "Trip Pass",
  starter: "Advisor Starter",
  pro: "Advisor Pro",
};

/**
 * What each one is FOR — who it is meant for, not what it includes.
 *
 * Written this way on purpose. "Who this is for" is true today; "what you
 * get" would not be, and the moment it is written down somebody has been
 * promised it.
 */
export const PLAN_BLURB: Record<AccountPlan, string> = {
  free: "Plan your own trip: the days, the flights, the hotels, the stops, saved to your account and readable on any of your devices.",
  one_trip: "One trip, upgraded: the app on the phone through the trip itself, kept working with no signal.",
  starter: "For an advisor taking their first clients — the app handed to each one, and the pipeline to run them in.",
  pro: "For an advisor who plans trips often — everything Starter has, with your own name on the client's app.",
};

/** Higher means further up. Used only to work out what counts as an upgrade. */
const RANK: Record<AccountPlan, number> = { free: 0, one_trip: 1, starter: 2, pro: 3 };

export function isAccountPlan(value: unknown): value is AccountPlan {
  return typeof value === "string" && (ACCOUNT_PLANS as readonly string[]).includes(value);
}

/**
 * The plan on a record.
 *
 * Anything unset or unrecognised is the default. An account made before
 * plans existed, or before this ladder replaced the old one, has no field
 * that matches — and reads as having bought nothing, which is the honest
 * state for it.
 */
export function planOf(record: { plan?: string } | null | undefined): AccountPlan {
  return isAccountPlan(record?.plan) ? record.plan : DEFAULT_PLAN;
}

/**
 * What a person on this plan can ask about.
 *
 * Only upwards, and never the one they are on — offering somebody an
 * "upgrade" to what they already have reads as the site not knowing who
 * they are. An account with no plan yet can ask about any of the three.
 */
export function plansToAskAbout(current: AccountPlan): AccountPlan[] {
  return ACCOUNT_PLANS.filter((plan) => plan !== "free" && plan !== current && RANK[plan] >= RANK[current]);
}

export function isUpgrade(from: AccountPlan, to: AccountPlan): boolean {
  return to !== "free" && to !== from && RANK[to] >= RANK[from];
}

/**
 * What each plan gets you, over and above the whole site every account
 * already has — in words.
 *
 * These are the things a plan UNLOCKS. The trip ceiling is not here: it is a
 * number the owner can change, so describeLimits() in lib/account-limits.ts
 * says that instead, and a page shows both together so each plan reads out
 * everything it can do.
 *
 * The words are what the traveler GETS, not what the code calls it, and each
 * line has a gate behind it in lib/account-limits.ts. The two must not drift
 * apart: tests/account-plans.test.ts holds them together.
 */
const PLAN_INCLUDES: Record<AccountPlan, readonly string[]> = {
  free: [],
  one_trip: [
    "The White Glove app for this one trip — your itinerary on your phone, kept for when there is no signal",
    "The assistant remembers your conversation between visits",
  ],
  starter: [
    "The assistant remembers your conversation between visits",
    "The White Glove app for your own trips",
    "The app handed to each client — a link that opens their trip on their phone, and a chat with each one",
  ],
  pro: [
    "Everything Advisor Starter has",
    "Your own name and logo on the app you hand a client, in place of White Glove's",
    "Save a trip as a template, and start a new one from it",
    "The business-at-a-glance numbers on your trip pipeline",
  ],
};

export function whatYouGet(plan: AccountPlan): readonly string[] {
  return PLAN_INCLUDES[plan] ?? [];
}

/* ---- asking for one ---------------------------------------------------- */

/** Where a request has got to. */
export type PlanRequestState = "asked" | "granted" | "declined";

export type PlanRequest = {
  /** The account that asked — an email or a phone, the same string it signs in with. */
  account: string;
  wanted: AccountPlan;
  /** Anything they wanted to say. Never required. */
  note?: string;
  askedAt: string;
  state: PlanRequestState;
  /** When it stopped being "asked". */
  answeredAt?: string;
  /** Who answered it — a name, or "the shared password". */
  answeredBy?: string;
};

export const MAX_NOTE = 600;

/**
 * Why this request cannot be taken, or null.
 */
export function requestProblem(input: { current: AccountPlan; wanted: unknown; note?: string }): string | null {
  if (!isAccountPlan(input.wanted)) return "Choose which kind of account you want.";
  if (!isUpgrade(input.current, input.wanted)) {
    return input.wanted === input.current
      ? `You are already on ${PLAN_LABELS[input.wanted]}.`
      : "That is not a change this can make.";
  }
  if ((input.note?.trim().length ?? 0) > MAX_NOTE) return `Keep the note under ${MAX_NOTE} characters.`;
  return null;
}

/**
 * "asked 3 days ago" — how long a request has been sitting there.
 *
 * `now` is an ISO timestamp rather than an epoch because this is worked out
 * on the server and handed to a screen: a component may not read a clock
 * while it renders, so the page reads one once and passes the answer down.
 */
export function waitingFor(request: PlanRequest, now: string): string {
  const then = Date.parse(request.askedAt);
  const at = Date.parse(now);
  if (Number.isNaN(then) || Number.isNaN(at)) return "at some point";
  const hours = Math.floor((at - then) / 3_600_000);
  if (hours < 1) return "in the last hour";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/**
 * What to say about somebody's plan on their own account page.
 *
 * Says what they are on and, when they have asked for something, that the
 * ask is sitting with a person rather than with a machine that has
 * forgotten it.
 */
export function describePlan(plan: AccountPlan, open: PlanRequest | null): string {
  if (open) {
    return `You are on ${PLAN_LABELS[plan]}. You asked about ${PLAN_LABELS[open.wanted]} — we have it, and we will be in touch.`;
  }
  return `You are on ${PLAN_LABELS[plan]}.`;
}
