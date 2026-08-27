import { NextRequest, NextResponse } from "next/server";
import { checkTripFlightStatus, getAccountData, listAllAccounts, withTrips } from "@/lib/account-store";

export const dynamic = "force-dynamic";
// Fans out across every followed trip; give it room past the default budget.
export const maxDuration = 60;

/**
 * Re-checks upcoming flights in the background and pushes any real change to
 * the traveler's phone — the piece that makes a flight alert arrive DURING the
 * trip rather than only the next time the app happens to be opened. Without
 * this the whole status pipeline (lib/account-store.ts checkTripFlightStatus)
 * only ever runs on an app open, which is the one moment a delay is least
 * useful to hear about.
 *
 * Only trips somebody is actually following are checked — a trip with a push
 * subscription — so a plan nobody has the app open on never spends a paid
 * status lookup. checkTripFlightStatus throttles each flight on top of that
 * (see flightRecheckMs), tightening to every twenty minutes only as departure
 * nears, so a run over a quiet fleet does almost nothing.
 *
 * RUN BY VERCEL CRON (see vercel.json), NEVER BY A BROWSER. Authenticated by
 * `CRON_SECRET`, the same fail-closed rule the reminders cron and the billing
 * webhook follow: not configured means refused.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] flight-status ran but CRON_SECRET is not set.");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  let checked = 0;
  let alerted = 0;

  const accounts = await listAllAccounts();
  for (const account of accounts) {
    const data = await getAccountData(account.email);
    const { trips } = withTrips(data);
    for (const trip of trips) {
      // No device following this trip → nobody to push, so nothing to spend a
      // status lookup on. A subscription only exists once someone opened the
      // app and turned notifications on (savePushSubscription).
      if (!trip.pushSubscriptions?.length) continue;
      checked += 1;
      const alerts = await checkTripFlightStatus(account.email, trip.id).catch((error) => {
        console.error("[cron] flight-status check failed", { account: account.email, tripId: trip.id, error });
        return [];
      });
      alerted += alerts.length;
    }
  }

  return NextResponse.json({ ok: true, checked, alerted });
}
