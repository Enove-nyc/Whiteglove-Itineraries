import { NextRequest, NextResponse } from "next/server";
import {
  getAccountData,
  listAllAccounts,
  markAlertsPushed,
  pushToAccountSubscribers,
  withTrips,
} from "@/lib/account-store";
import { stopsForTrip } from "@/lib/command-center-data";
import { tripReadiness } from "@/lib/command-center";
import { pushableAlerts, tripAlerts, type TripAlert } from "@/lib/trip-alerts";
import { daysUntil } from "@/lib/command-center";
import { sendTripAlertsEmail } from "@/lib/email";
import { isPhoneIdentity } from "@/lib/identity";

export const dynamic = "force-dynamic";

/**
 * How far ahead a trip has to be before this bothers looking at it.
 *
 * The command centre is a page about the last few weeks before travelling.
 * Nothing here is news a year out, and walking every trip in the database
 * every night to work out that somebody's 2028 trip still has no shomer
 * number would cost a database read per stop for an answer nobody wants yet.
 */
const HORIZON_DAYS = 45;

/** Days from `today` to `date`, or null if either is missing or unparseable. */
function daysBetween(date: string | undefined, today: string): number | null {
  if (!date?.trim()) return null;
  const from = Date.parse(`${today}T00:00:00Z`);
  const to = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

/**
 * What to say on the evening before, when there is nothing wrong to report.
 *
 * The first stop, because "where am I meant to be" is the only question that
 * evening, and a notification saying merely "your trip starts tomorrow" tells
 * somebody something they already know.
 */
function startsTomorrowBody(stops: readonly { name: string }[]): string {
  const first = stops[0]?.name;
  return first ? `First stop: ${first}. Everything is in the app.` : "Everything is in the app.";
}

/** One notification, however many alerts this trip turned up. */
function payloadFor(tripName: string, alerts: readonly TripAlert[]) {
  if (alerts.length === 1) return { title: alerts[0].headline, body: tripName };
  return { title: `${alerts.length} things to look at`, body: `${tripName} — ${alerts.map((a) => a.headline).join(" ")}` };
}

/**
 * Sends the traveller their OWN trip's readiness alerts — the Shabbos clash,
 * the loose ends as departure gets close — to the devices they turned on at
 * /command-center.
 *
 * WHY THIS EXISTS AT ALL. Everything the command centre knows, it has always
 * known; it just waited to be asked. The two alerts it leads with are the two
 * that get worse the longer nobody notices, and a kever visit planned for
 * Shabbos found three weeks out is a different problem from the same one found
 * standing in a hotel lobby in Poland. A page cannot help with that. This can.
 *
 * SEPARATE FROM trip-reminders ON PURPOSE, though both run daily. That one is
 * an ADVISOR's message to their CLIENT, gated on the plan that lets somebody
 * serve clients at all, landing in a chat thread. This is the account owner
 * being told about their own trip, open to anybody signed in, landing on their
 * own phone. Folding them together would mean one plan check standing in front
 * of two audiences, which is exactly the sort of thing that quietly starts
 * gating the wrong one.
 *
 * ONCE PER ALERT, NOT ONCE PER DAY. The alerts are recomputed from nothing
 * every run, so without a memory this would send the same Shabbos clash every
 * morning until it was fixed — and the person would turn notifications off,
 * taking the useful ones with them. markAlertsPushed records each alert's
 * stable key (see lib/trip-alerts.ts) and this skips anything already there.
 *
 * Same secret and same fail-closed rule as the reminders endpoint: not
 * configured means refused.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] trip-alerts ran but CRON_SECRET is not set.");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const origin = request.nextUrl.origin;
  let considered = 0;
  let pushed = 0;
  let emailed = 0;

  for (const account of await listAllAccounts()) {
    const data = await getAccountData(account.email);
    /**
     * No way to reach them at all. Skip before doing any of the work below —
     * reading a trip's stops costs a database read per kever, and there is no
     * point paying it to compute alerts with nowhere to go.
     *
     * This used to mean "no push subscription", which was right while a phone
     * was the only channel. Email needs nothing turned on, so the test is now
     * whether there is ANY door: a device they subscribed, or an address. Only
     * somebody signed in with a phone number has neither, and they are the
     * one case this still skips for the same reason as before.
     */
    const canPush = Boolean(data.pushSubscriptions?.length);
    const canEmail = !isPhoneIdentity(account.email);
    if (!canPush && !canEmail) continue;

    for (const trip of withTrips(data).trips) {
      const startDate = trip.itinerary?.startDate;
      const away = daysBetween(startDate, today);
      // A trip with no dates is skipped rather than reported: the one alert it
      // would raise is "no dates yet", which pushableAlerts drops anyway.
      if (away === null || away < 0 || away > HORIZON_DAYS) continue;

      considered += 1;
      const stops = await stopsForTrip(trip.itinerary);
      if (!stops.length) continue;

      const alerts = pushableAlerts(
        tripAlerts({
          stops,
          readiness: tripReadiness(stops),
          startDate,
          today,
          timesById: Object.fromEntries((trip.itinerary.activities ?? []).map((a) => [a.id, a.startTime])),
        }),
      );
      const already = trip.alertsPushed ?? {};
      const fresh = alerts.filter((alert) => !already[alert.key]);

      /**
       * "Your trip starts tomorrow."
       *
       * Not a readiness alert and deliberately not one: tripAlerts is about
       * things that are WRONG, and a trip starting is the opposite. Putting it
       * there would draw it on the command centre as a warning box beside the
       * Shabbos clash, next to a countdown already saying the same thing in
       * the right voice.
       *
       * It is here because this is the job that already knows how far away
       * every trip is and already has somewhere to send it — and because the
       * countdown, until now, only ever spoke to somebody who opened the page.
       * The night before is the one evening it is worth saying without being
       * asked.
       *
       * Keyed like everything else, so it goes once. `away` is whole days from
       * today, so this is the calendar day before departure rather than a
       * rolling twenty-four hours.
       */
      const eve = away === 1 && !already["starts-tomorrow"];
      if (!fresh.length && !eve) continue;

      // Marked first, then pushed — the same order as the client reminders,
      // and for the same reason. A push that fails costs one notification; a
      // mark that waited on it and never happened would send this alert again
      // tomorrow, and every morning after.
      const name = trip.name || trip.itinerary.title || "Your trip";
      const keys = fresh.map((a) => a.key);
      if (eve) keys.push("starts-tomorrow");
      await markAlertsPushed(account.email, trip.id, keys, today);

      // One notification, not two. Somebody whose trip starts tomorrow AND
      // still has a stop with nobody to let them in should be woken once, with
      // both facts, on the evening they can still do something about either.
      pushed += await pushToAccountSubscribers(account.email, {
        ...(eve && !fresh.length
          ? { title: `${name} starts tomorrow`, body: startsTomorrowBody(stops) }
          : eve
            ? { title: `${name} starts tomorrow`, body: fresh.map((a) => a.headline).join(" ") }
            : payloadFor(name, fresh)),
        url: "/command-center",
      });

      /**
       * And by email, which needs nothing turned on.
       *
       * Both channels rather than one or the other: a notification is easy to
       * dismiss on a lock screen and gone, and these are the two alerts that
       * get worse the longer nobody notices. The keys above make it once per
       * alert whatever the channel, so a trip raises a handful over its whole
       * life rather than a message a day.
       *
       * The readiness alerts only. A trip starting tomorrow is a good enough
       * reason to buzz a phone and not a good enough reason to send somebody
       * an email about a date they chose.
       */
      if (canEmail && fresh.length) {
        const sent = await sendTripAlertsEmail(account.email, {
          tripTitle: name,
          leaving: daysUntil(startDate, today) ?? undefined,
          alerts: fresh.map((alert) => ({ headline: alert.headline, detail: alert.detail })),
          url: new URL("/command-center", origin).toString(),
        }).catch(() => false);
        if (sent) emailed += 1;
      }
    }
  }

  return NextResponse.json({ ok: true, considered, pushed, emailed });
}
