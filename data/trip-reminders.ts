// NOT lib/trip-reminders.ts. That one decides whether an automatic reminder
// is due to be SENT TO A CLIENT (departure, balance owed) and is driven by a
// cron; this one derives what needs the PLANNER's own attention and sends
// nothing at all. Same word, two audiences — the tests are split the same
// way: tests/trip-reminders.test.ts covers that module, tests/
// pipeline-nudges.test.ts covers this one.
//
// Automated workflows — what needs a planner's attention on a trip, worked
// out fresh from what the trip already carries. THE SAME "DERIVED, NOT
// STORED" DISCIPLINE data/trip-pipeline.ts already keeps for a trip's stage:
// nothing here is a flag a planner sets or clears by hand, so it can never
// go stale the way a checkbox nobody remembered to update would. Read this
// on the pipeline the same moment the stage itself is worked out, and a
// planner never has to open a trip to find out it needs a nudge.

import type { Proposal } from "@/data/proposal";
import type { TripBalance } from "@/data/trip-payments";
import { outstandingCents } from "@/data/trip-payments";
import type { AddonItem } from "@/data/trip-addons";
import { pendingAddons } from "@/data/trip-addons";
import type { TripStage } from "@/data/trip-pipeline";

export type ReminderReason =
  | "proposal_stale"
  | "proposal_expiring"
  | "proposal_changes_requested"
  | "proposal_approved_not_converted"
  | "payment_due_soon"
  | "addon_pending"
  | "trip_soon_unconfirmed"
  | "trip_completed_no_rating_sent";

export type TripReminder = { reason: ReminderReason; message: string };

/** Calendar days between two YYYY-MM-DD strings — negative when `to` is past. */
function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

const STALE_PROPOSAL_DAYS = 3;
const EXPIRING_PROPOSAL_DAYS = 2;
const PAYMENT_DUE_SOON_DAYS = 7;
const STALE_ADDON_DAYS = 5;
const TRIP_SOON_DAYS = 14;
/** A rating request stops being nudged this long after the trip ends — a
 *  trip from two years ago isn't worth surfacing on the pipeline forever. */
const RATING_REQUEST_WINDOW_DAYS = 30;

/**
 * Every reminder worth a planner's attention on this trip, right now.
 * `today` is caller-supplied (the server's date), so this stays a pure
 * function a test can call at any date.
 */
export function tripReminders(
  trip: {
    stage: TripStage;
    proposal?: Proposal;
    balance?: TripBalance;
    addons?: AddonItem[];
    startDate?: string;
    endDate?: string;
    ratingRequestSentAt?: string;
  },
  today: string,
): TripReminder[] {
  const out: TripReminder[] = [];
  const proposal = trip.proposal;

  if (proposal && (proposal.status === "sent" || proposal.status === "viewed")) {
    const since = proposal.sentAt?.slice(0, 10);
    if (since && daysBetween(since, today) >= STALE_PROPOSAL_DAYS) {
      out.push({ reason: "proposal_stale", message: `Sent ${daysBetween(since, today)} days ago with no response — worth a follow-up.` });
    }
    if (proposal.expiresAt && proposal.expiresAt >= today && daysBetween(today, proposal.expiresAt) <= EXPIRING_PROPOSAL_DAYS) {
      out.push({ reason: "proposal_expiring", message: `Expires ${proposal.expiresAt === today ? "today" : `in ${daysBetween(today, proposal.expiresAt)} days`}.` });
    }
  }

  /**
   * THE TWO THINGS A CLIENT DOES, AND WHAT THEY COST WHEN NOBODY IS TOLD.
   *
   * The proposal already lets a client compare options, pick one, or ask for
   * changes; the planner already has a Convert button. What was missing was
   * the bit in between — the client acts, and nothing on the pipeline says so.
   *
   * APPROVED IS THE WORSE OF THE TWO, because it does not look like a problem.
   * tripStage() moves an approved trip straight to "Confirmed", so the board
   * reads as settled while convertProposalToItinerary has never run: the
   * agreed option is not on the itinerary, and the itinerary is what the
   * traveler actually opens. A trip that says Confirmed and carries the
   * pre-agreement plan is worse than one that says it needs attention.
   *
   * CHANGES REQUESTED had a badge and nothing to press. Same reason, said out
   * loud, so it arrives with the action beside it like everything else.
   */
  if (proposal?.status === "approved") {
    out.push({
      reason: "proposal_approved_not_converted",
      message: "Approved — the agreed option is not on the itinerary yet.",
    });
  }

  if (proposal?.status === "changes_requested") {
    out.push({ reason: "proposal_changes_requested", message: "Changes requested — waiting on you." });
  }

  if (trip.balance) {
    const owed = outstandingCents(trip.balance);
    if (owed > 0) {
      const dueSoon = trip.balance.schedule.find((s) => s.dueDate && s.dueDate >= today && daysBetween(today, s.dueDate) <= PAYMENT_DUE_SOON_DAYS);
      if (dueSoon) {
        out.push({ reason: "payment_due_soon", message: `"${dueSoon.label}" due ${dueSoon.dueDate === today ? "today" : `in ${daysBetween(today, dueSoon.dueDate!)} days`}.` });
      }
    }
  }

  if (trip.addons) {
    const pending = pendingAddons(trip.addons).filter((a) => daysBetween(a.createdAt.slice(0, 10), today) >= STALE_ADDON_DAYS);
    if (pending.length > 0) {
      out.push({ reason: "addon_pending", message: `${pending.length} add-on${pending.length === 1 ? "" : "s"} still waiting on an answer.` });
    }
  }

  if (trip.startDate && trip.startDate >= today && daysBetween(today, trip.startDate) <= TRIP_SOON_DAYS) {
    if (trip.stage !== "confirmed" && trip.stage !== "traveling" && trip.stage !== "completed") {
      out.push({ reason: "trip_soon_unconfirmed", message: `Starts in ${daysBetween(today, trip.startDate)} days — nothing confirmed yet.` });
    }
  }

  if (trip.stage === "completed" && !trip.ratingRequestSentAt && trip.endDate && daysBetween(trip.endDate, today) <= RATING_REQUEST_WINDOW_DAYS) {
    out.push({ reason: "trip_completed_no_rating_sent", message: "Trip's over — send a rating request." });
  }

  return out;
}
