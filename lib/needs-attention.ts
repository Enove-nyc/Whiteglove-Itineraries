import type { ReminderReason } from "@/data/trip-reminders";

/**
 * One thing that needs attention, and the ONE thing to press about it.
 *
 * WHAT THIS FIXES. The pipeline told a planner six different things could need
 * doing — a proposal gone quiet, a payment due, add-ons waiting on an answer, a
 * trip starting unconfirmed — and gave them something to press for exactly one
 * of the six. The other five were a sentence with a flag in front of it. The
 * planner read "2 add-ons still waiting on an answer", agreed, and then had to
 * work out for themselves which screen answers add-ons.
 *
 * ONE ACTION, NOT A LIST, and the type is what enforces it: `action` is a
 * single value, so there is no way to express "here are four things you could
 * do", which is how a work queue turns back into a menu. If a second action
 * ever genuinely belongs on an item, that is a decision to make deliberately,
 * not something that arrives because the field happened to be an array.
 *
 * A RECORD OVER THE UNION, NOT A LOOKUP WITH A FALLBACK. Adding a reminder
 * reason to data/trip-reminders.ts and forgetting it here is a compile error
 * rather than an item that silently renders with no action — which is the
 * state five of the six were already in.
 *
 * WHY THE PATHS ARE THE THREE THE ROW ALREADY OPENS. The pipeline card carries
 * "Open itinerary", "Proposal" and "Payments" buttons that already resolve to
 * the right trip. Sending an attention item anywhere else would mean inventing
 * a route, and the honest answer for all five is a screen that exists.
 */

/** Where a pipeline row can already take a planner, for the trip it is about. */
export type AttentionPath = "/itinerary" | "/proposal" | "/payments";

export type AttentionAction =
  /** Open one of the trip's own screens. */
  | { kind: "open"; label: string; path: AttentionPath }
  /**
   * Handled where it is read, because leaving the page would lose the point.
   * The rating request asks for an address and sends — a screen of its own for
   * one field would be worse than the flag it replaces.
   */
  | { kind: "inline"; label: string; control: "rating-request" };

export const REMINDER_ACTION: Record<ReminderReason, AttentionAction> = {
  // "Sent 5 days ago with no response" — the follow-up is on the proposal.
  proposal_stale: { kind: "open", label: "Open the proposal", path: "/proposal" },
  // "Expires in 2 days" — same screen, where the date can be moved.
  proposal_expiring: { kind: "open", label: "Open the proposal", path: "/proposal" },
  // The client asked for changes. Reading what they asked for is the work.
  proposal_changes_requested: { kind: "open", label: "Read what they asked for", path: "/proposal" },
  // They said yes, and the option they agreed to is still not on the
  // itinerary. The Convert button lives on the proposal.
  proposal_approved_not_converted: { kind: "open", label: "Convert to itinerary", path: "/proposal" },
  // A scheduled instalment coming due. Payments is where the schedule lives.
  payment_due_soon: { kind: "open", label: "Open payments", path: "/payments" },
  // Add-ons are offered and answered as part of the proposal, so that is where
  // a planner chases one that has been waiting.
  addon_pending: { kind: "open", label: "Open the proposal", path: "/proposal" },
  // "Starts in 9 days — nothing confirmed yet." The itinerary is the thing
  // that is not confirmed.
  trip_soon_unconfirmed: { kind: "open", label: "Open the itinerary", path: "/itinerary" },
  // The one that already had an action, kept as it was.
  trip_completed_no_rating_sent: { kind: "inline", label: "Send a rating request", control: "rating-request" },
};

/** The action for a reminder. Total by construction — see the note above. */
export function actionForReminder(reason: ReminderReason): AttentionAction {
  return REMINDER_ACTION[reason];
}

/**
 * WHICH OF THE THREE PILES AN ITEM BELONGS IN.
 *
 * The pipeline offered eight views along the top — Board, Upcoming, Currently
 * traveling, Awaiting approval, Changes requiring attention, Unread messages,
 * Payment due, Needs a nudge — and four of those eight mean the same thing:
 * something needs the advisor. So the first question anybody opens this screen
 * with, "what needs me today?", was answered in four places and led with none
 * of them; the default view was a board of every trip they have.
 *
 * Four queues competing is not four times the information. It is one question
 * asked four ways, and an advisor who has to check all four to be sure.
 *
 * THE SPLIT THAT MATTERS IS NOT BY FEATURE, IT IS BY WHOSE MOVE IT IS.
 * "The client asked for changes" and "the client has not replied in five days"
 * are both proposal items and they are nothing alike: one is work sitting on
 * the advisor's desk, the other is a reason to chase somebody. Sorting by
 * which system raised the item puts those two together and separates each of
 * them from the thing it actually resembles.
 */
export type AttentionGroup =
  /** The advisor's own move. Nothing happens until they do something. */
  | "needs_you"
  /** Done for now, sitting with the client. Chase it, or leave it. */
  | "waiting_on_client"
  /** Nothing wrong — near enough to want an eye on it. */
  | "upcoming";

export const GROUP_LABEL: Record<AttentionGroup, string> = {
  needs_you: "Needs you",
  waiting_on_client: "Waiting on the client",
  upcoming: "Coming up",
};

/** Read in this order, because the first pile is the only one that blocks. */
export const GROUP_ORDER: AttentionGroup[] = ["needs_you", "waiting_on_client", "upcoming"];

/**
 * A Record over the union again, for the same reason as REMINDER_ACTION above:
 * a new reason that nobody grouped is a compile error rather than an item that
 * quietly lands in whichever pile is first.
 */
export const REMINDER_GROUP: Record<ReminderReason, AttentionGroup> = {
  // Sent, and nothing came back. Chasing is the only move, and it is theirs.
  proposal_stale: "waiting_on_client",
  // Still theirs — but the clock is the reason to say something today.
  proposal_expiring: "waiting_on_client",
  // They asked. Until the advisor reads it and answers, nothing moves.
  proposal_changes_requested: "needs_you",
  // They already said yes. The gap between yes and the itinerary is the
  // advisor's, and it is the one that does not look like a problem.
  proposal_approved_not_converted: "needs_you",
  // Their money, their deadline.
  payment_due_soon: "waiting_on_client",
  // Offered, unanswered. Theirs.
  addon_pending: "waiting_on_client",
  // Nobody is waiting on the client to confirm the advisor's own bookings.
  trip_soon_unconfirmed: "needs_you",
  // Trip's over; sending the request is the advisor's move.
  trip_completed_no_rating_sent: "needs_you",
};

export function groupForReminder(reason: ReminderReason): AttentionGroup {
  return REMINDER_GROUP[reason];
}
