// A trip's own activity feed — what actually happened, in order. Pure data
// model; the entries themselves are written by lib/account-store.ts at the
// same moment as the action they record (a payment succeeding, a client
// answering a proposal or an add-on, a planner moving a trip's stage), the
// same "log it where it happens" discipline the itinerary's own comment
// notification already uses.
//
// APPEND-ONLY, LIKE THE PAYMENT LEDGER. An entry is never edited or removed
// once written — it is the record of what happened, not a status that can
// be toggled back. Capped to the most recent entries (see MAX_ACTIVITY
// below) so an old trip's feed can't grow without bound; the oldest simply
// fall off, the same trade a chat log or a print history already makes.

export type ActivityKind =
  | "proposal_sent"
  | "proposal_approved"
  | "proposal_changes_requested"
  | "payment_received"
  | "addon_accepted"
  | "addon_declined"
  | "stage_changed";

export type ActivityEntry = {
  id: string;
  kind: ActivityKind;
  message: string;
  at: string; // ISO timestamp
};

/** Kept as a plain number here (not an env-configurable limit) — this bounds
 *  one trip's own feed, not the account's storage as a whole. */
export const MAX_ACTIVITY = 100;

/** Append one entry, oldest falling off the front past MAX_ACTIVITY. */
export function withActivity(entries: ActivityEntry[], entry: ActivityEntry): ActivityEntry[] {
  const next = [...entries, entry];
  return next.length > MAX_ACTIVITY ? next.slice(next.length - MAX_ACTIVITY) : next;
}

/** Most recent first — how a feed is read, even though it's stored oldest-first. */
export function recentActivity(entries: ActivityEntry[]): ActivityEntry[] {
  return [...entries].reverse();
}
