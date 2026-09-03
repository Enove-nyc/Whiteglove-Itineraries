/**
 * A Trip Pass — bought once, spent on ONE trip.
 *
 * WHY A PASS AND NOT A PLAN. The pass used to be a plan: buying it set the
 * account to `one_trip` and every trip on that account opened in the White
 * Glove app forever. One purchase, unlimited trips, which is not what the
 * thing is called and not what it is sold as. A pass is now a token the
 * account holds: it is bought unattached, and it is SPENT on the one trip the
 * traveller is actually taking. Two trips is two passes.
 *
 * The Stripe product behind it is still the `one_trip` plan — that key is
 * stored on live accounts and sent to Stripe, so it does not move. What
 * changed is what a completed purchase grants: a pass, not an account-wide
 * entitlement.
 *
 * SPENDING IS PERMANENT. There is no un-spending and no moving a pass from one
 * trip to another; if it could move, $9 would buy every trip in sequence and
 * the pass would be a plan again wearing a different word. The rules live here
 * rather than in the store so they can be read and tested without Redis.
 */

export type TripPass = {
  /** Random, opaque. Only ever used to tell two passes apart. */
  id: string;
  /** When the money moved, ISO. */
  boughtAt: string;
  /** The one trip it opens. Null until it is spent. */
  tripId: string | null;
  /** When it was spent, ISO. Null alongside a null tripId. */
  spentAt: string | null;
};

/** Passes bought and not yet attached to a trip. */
export function unspentPasses(passes: TripPass[]): TripPass[] {
  return passes.filter((pass) => !pass.tripId);
}

/** The pass on this trip, if the account has spent one here. */
export function passForTrip(passes: TripPass[], tripId: string): TripPass | null {
  if (!tripId) return null;
  return passes.find((pass) => pass.tripId === tripId) ?? null;
}

/** Whether this trip is already covered — the question every gate asks. */
export function tripHasPass(passes: TripPass[], tripId: string): boolean {
  return passForTrip(passes, tripId) !== null;
}

export type SpendResult =
  | { ok: true; passes: TripPass[]; spent: TripPass }
  /** `already` means this trip was covered before the call — not a failure. */
  | { ok: false; reason: "none_left" | "already"; passes: TripPass[] };

/**
 * Attach the oldest unspent pass to a trip.
 *
 * OLDEST FIRST is arbitrary but has to be decided somewhere: passes are
 * identical, and picking deterministically means the same call twice cannot
 * produce two different accounts. Spending on a trip that already has one is
 * refused rather than silently burning a second pass on it.
 */
export function spendPassOn(passes: TripPass[], tripId: string, now: string): SpendResult {
  if (!tripId) return { ok: false, reason: "none_left", passes };
  if (tripHasPass(passes, tripId)) return { ok: false, reason: "already", passes };
  const ordered = unspentPasses(passes).sort((a, b) => a.boughtAt.localeCompare(b.boughtAt));
  const oldest = ordered[0];
  if (!oldest) return { ok: false, reason: "none_left", passes };
  const spent: TripPass = { ...oldest, tripId, spentAt: now };
  return { ok: true, spent, passes: passes.map((pass) => (pass.id === oldest.id ? spent : pass)) };
}

/**
 * A pass whose trip has since been deleted is released, not lost.
 *
 * The firm rule above is about a traveller MOVING a pass to dodge paying
 * twice. A trip that no longer exists is not that: it is a pass with nothing
 * behind it, and keeping it spent would mean somebody paid for an app they can
 * never open. Called with the trip ids the account still has.
 */
export function releaseOrphaned(passes: TripPass[], liveTripIds: readonly string[]): TripPass[] {
  const live = new Set(liveTripIds);
  return passes.map((pass) => (pass.tripId && !live.has(pass.tripId) ? { ...pass, tripId: null, spentAt: null } : pass));
}

/** How the account page says what somebody holds. Never a price — see AGENTS.md. */
export function describePasses(passes: TripPass[]): string {
  const spare = unspentPasses(passes).length;
  if (passes.length === 0) return "";
  if (spare === 0) return "Every Trip Pass you have bought is on a trip.";
  return spare === 1 ? "You have one Trip Pass to use." : `You have ${spare} Trip Passes to use.`;
}
