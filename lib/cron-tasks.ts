import { getPlan } from "@/lib/account-plan-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { appendChat, type CompanionChatMessage } from "@/lib/companion-chat-store";
import { checkTripFlightStatus, getAccountData, listAllAccounts, markReminderSent, withTrips } from "@/lib/account-store";
import {
  balanceDueReminderDue,
  balanceDueReminderText,
  departureReminderDue,
  departureReminderText,
} from "@/lib/trip-reminders";

// The scheduled trip work, as plain functions — the sweep over flights and the
// daily client reminders. They live here, apart from any one trigger, because
// this app now runs as a persistent server on Railway rather than Vercel's
// per-request functions: the in-process scheduler (lib/cron-scheduler.ts, from
// instrumentation.ts) calls these on a timer, and the /api/cron/* routes call
// the very same functions for a manual or external run. One body, two doors.
//
// Both are safe to run again and again: a flight is throttled per its own last
// reading (flightRecheckMs), and a reminder is one-shot per trip (markReminderSent).

/**
 * Whether `message` actually landed in the thread — `appendChat` no-ops and
 * returns `[]` when the chat store is unreachable, but a caller that never
 * checked would markReminderSent anyway, and these reminders are ONE-SHOT: a
 * "sent" mark that was never really sent means a client silently never sees it.
 * `at` is unique per message, so finding it in the thread that comes back is
 * the same proof appendChat's own callers rely on.
 */
async function wasDelivered(shareId: string, message: CompanionChatMessage): Promise<boolean> {
  const thread = await appendChat(shareId, message);
  return thread.some((m) => m.from === message.from && m.at === message.at);
}

/**
 * Re-check the upcoming flights of every FOLLOWED trip and push whatever real
 * change comes out of it. "Followed" means a live push subscription exists —
 * so a trip nobody has the app open on never spends a paid status lookup, and
 * checkTripFlightStatus throttles each flight on top of that.
 */
export async function runFlightStatusSweep(): Promise<{ checked: number; alerted: number }> {
  let checked = 0;
  let alerted = 0;
  const accounts = await listAllAccounts();
  for (const account of accounts) {
    const data = await getAccountData(account.email);
    const { trips } = withTrips(data);
    for (const trip of trips) {
      if (!trip.pushSubscriptions?.length) continue;
      checked += 1;
      const alerts = await checkTripFlightStatus(account.email, trip.id).catch((error) => {
        console.error("[cron] flight-status check failed", { account: account.email, tripId: trip.id, error });
        return [];
      });
      alerted += alerts.length;
    }
  }
  return { checked, alerted };
}

/**
 * Send the automatic client reminders lib/trip-reminders.ts decides are due —
 * "you're leaving soon", "a balance is still due" — into each trip's own chat
 * thread. Only accounts on a plan that serves clients, re-read fresh so a
 * lapsed subscription cannot still send. `today` is a YYYY-MM-DD date.
 */
export async function runTripReminders(today: string): Promise<{ sent: number }> {
  let sent = 0;
  const accounts = await listAllAccounts();
  for (const account of accounts.filter((a) => mayServeCompanionClients(a.plan))) {
    // listAllAccounts' `plan` is a snapshot from the scan — read it fresh here
    // too, since a lapsed subscription between the scan and now must not send.
    if (!mayServeCompanionClients(await getPlan(account.email))) continue;

    const data = await getAccountData(account.email);
    const { trips } = withTrips(data);
    for (const trip of trips) {
      const reminderTrip = {
        name: trip.name,
        client: trip.client,
        startDate: trip.itinerary?.startDate,
        endDate: trip.itinerary?.endDate,
        autoReminders: trip.autoReminders,
        shareId: trip.shareId,
        balance: trip.balance,
        remindersSent: trip.remindersSent,
      };
      if (!trip.shareId) continue;

      if (departureReminderDue(reminderTrip, today)) {
        const message: CompanionChatMessage = { from: "advisor", kind: "text", text: departureReminderText(reminderTrip), at: new Date().toISOString() };
        if (await wasDelivered(trip.shareId, message)) {
          await markReminderSent(account.email, trip.id, "departure", today);
          sent += 1;
        } else {
          console.error("[cron] trip-reminders: departure reminder did not save, will retry next run", { account: account.email, tripId: trip.id });
        }
      }
      if (balanceDueReminderDue(reminderTrip, today)) {
        const message: CompanionChatMessage = { from: "advisor", kind: "text", text: balanceDueReminderText(reminderTrip), at: new Date().toISOString() };
        if (await wasDelivered(trip.shareId, message)) {
          await markReminderSent(account.email, trip.id, "balanceDue", today);
          sent += 1;
        } else {
          console.error("[cron] trip-reminders: balance-due reminder did not save, will retry next run", { account: account.email, tripId: trip.id });
        }
      }
    }
  }
  return { sent };
}
