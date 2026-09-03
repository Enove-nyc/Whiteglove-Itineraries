/**
 * What a trip should tell you without being asked.
 *
 * The command centre answers a question when somebody opens it. An alert is
 * the other direction: the thing that should have caught their eye whether or
 * not they went looking. The two that earn it here are the two that get worse
 * the longer nobody notices.
 *
 * SHABBOS FIRST, always, and not because it is the most likely — because it is
 * the one where finding out late is a different order of problem. A missing
 * shomer number found on the day means a wasted morning. A kever visit planned
 * for Shabbos, found on the day, means somebody has to choose between the
 * plan they made and the day itself, standing in a hotel lobby in Poland.
 *
 * The Shabbos arithmetic is not repeated here — lib/shabbos.ts already does
 * it properly, sunset and candle-lighting from the stop's own coordinates. It
 * is called per stop and the answers are gathered.
 *
 * Nothing here reads a database or the network.
 */

import { shabbosWarning } from "@/lib/shabbos";
import { daysUntil, type StopFacts, type TripReadiness } from "@/lib/command-center";

export type TripAlert = {
  /** 1 shows first and loudest. */
  urgency: 1 | 2 | 3;
  kind: "shabbos" | "leaving-soon" | "no-dates";
  headline: string;
  detail?: string;
  /**
   * WHAT MAKES THIS ALERT THE SAME ALERT TOMORROW.
   *
   * The page recomputes these from scratch every time it is opened, which is
   * right for a page and useless for anything that sends. A daily job needs to
   * tell "the Shabbos clash I already told you about" from "a new one", and it
   * cannot do that from the headline: "You leave in 5 days, and 2 stops still
   * need something" is a different string tomorrow describing the identical
   * situation, and keying on it would mean a notification every morning until
   * departure.
   *
   * So the key is deliberately built from what the alert is ABOUT and never
   * from how many days are left or how it happens to be worded — see each one
   * below for what that means for its own kind.
   */
  key: string;
};

/**
 * Which readiness alerts are worth a notification on somebody's phone.
 *
 * "No dates on the trip yet" is not one: it is a nudge to go and fill
 * something in — true for weeks on end, urgent on none of them, and the one
 * thing here that would arrive as a notification saying, in effect, "you have
 * not finished typing". A page can afford to say that quietly. A notification
 * cannot say it at all without teaching somebody to turn notifications off,
 * and the alerts that matter go with them when they do.
 *
 * NEITHER IS "shabbos", AND THAT IS THIS PRODUCT'S OWN RULE — the one thing in
 * this file that differs from the kosher copy. White Glove Itineraries is a
 * general travel product. The command centre has long shown these clashes on a
 * page somebody chose to open, which is one thing; pushing "your stop is
 * planned for Shabbos" to a phone unbidden is another, and not something a
 * neutral travel product should begin doing on its own. The kosher deployment,
 * whose travellers asked for exactly that, pushes them.
 */
export function pushableAlerts(alerts: readonly TripAlert[]): TripAlert[] {
  return alerts.filter((alert) => alert.kind !== "no-dates" && alert.kind !== "shabbos");
}

export type AlertInput = {
  stops: StopFacts[];
  readiness: TripReadiness;
  /** The itinerary's first day, if it has one. */
  startDate?: string;
  /** YYYY-MM-DD, read once by the caller rather than while rendering. */
  today: string;
  /** The clock time each stop is planned for, by stop id, where one was set. */
  timesById?: Record<string, string | undefined>;
};

export function tripAlerts({ stops, readiness, startDate, today, timesById = {} }: AlertInput): TripAlert[] {
  const alerts: TripAlert[] = [];

  // ---- Shabbos ----------------------------------------------------------
  const clashes = stops
    .map((stop) => {
      if (!stop.plannedDate?.trim()) return null;
      const warning = shabbosWarning(stop.plannedDate, timesById[stop.id], stop.coordinates, stop.name);
      return warning ? { stop, warning } : null;
    })
    .filter((entry): entry is { stop: StopFacts; warning: NonNullable<ReturnType<typeof shabbosWarning>> } => entry !== null);

  const onShabbos = clashes.filter((c) => c.warning.kind === "on-shabbos");
  const nearCandles = clashes.filter((c) => c.warning.kind !== "on-shabbos");

  if (onShabbos.length) {
    alerts.push({
      urgency: 1,
      kind: "shabbos",
      headline:
        onShabbos.length === 1
          ? `${onShabbos[0].stop.name} is planned for Shabbos.`
          : `${onShabbos.length} stops are planned for Shabbos.`,
      detail: onShabbos.map((c) => c.stop.name).join(", "),
      // The stops themselves, sorted so their order on the itinerary cannot
      // change the key. Moving one off Shabbos and leaving another on it IS a
      // different alert and should be said again; nothing else here is.
      key: `shabbos:on:${onShabbos.map((c) => c.stop.id).sort().join(",")}`,
    });
  }

  if (nearCandles.length) {
    alerts.push({
      urgency: 2,
      kind: "shabbos",
      headline:
        nearCandles.length === 1
          ? `${nearCandles[0].stop.name} is on erev Shabbos.`
          : `${nearCandles.length} stops are on erev Shabbos.`,
      // The specific times where they could be worked out — a Friday at 15:00
      // in Kraków in December is a different problem from one in June, and the
      // candle-lighting time is the thing that says which.
      detail: nearCandles
        .map((c) => (c.warning.candleLighting ? `${c.stop.name} — candles ${c.warning.candleLighting}` : c.stop.name))
        .join(" · "),
      key: `shabbos:erev:${nearCandles.map((c) => c.stop.id).sort().join(",")}`,
    });
  }

  // ---- Leaving soon, with something unresolved --------------------------
  const leaving = daysUntil(startDate, today);
  const unresolved = readiness.needsAttention.length;
  if (unresolved > 0 && leaving && leaving !== "under way") {
    const soon = leaving === "today" || leaving === "tomorrow" || /^in \d+ days$/.test(leaving);
    alerts.push({
      urgency: soon ? 1 : 3,
      kind: "leaving-soon",
      headline: `You leave ${leaving}, and ${unresolved} ${unresolved === 1 ? "stop still needs" : "stops still need"} something.`,
      detail: readiness.needsAttention.map((r) => r.stop.name).join(", "),
      // ONE KEY FOR THE WHOLE TRIP, carrying neither the countdown nor which
      // stops are outstanding. Both change constantly — the countdown every
      // day, the stop list every time one is sorted out — and either in the
      // key would turn "you have loose ends" into a notification every
      // morning, or one for each stop they fix. Said once; the page carries
      // the running detail, which is what a page is for.
      key: "leaving-soon",
    });
  }

  // ---- No dates at all --------------------------------------------------
  //
  // Quietest of the three, and only when NOTHING is dated. One undated stop
  // among five is a decision not yet made; five out of five means the Shabbos
  // check above could not run at all, and that is worth saying plainly rather
  // than leaving as a silence somebody reads as "no problems".
  if (stops.length > 0 && stops.every((stop) => !stop.plannedDate?.trim())) {
    alerts.push({
      urgency: 3,
      kind: "no-dates",
      headline: "No dates on the trip yet, so nothing has been checked against Shabbos.",
      detail: "Put a date on each stop and this page will tell you what falls on Shabbos or close to candle-lighting.",
      key: "no-dates",
    });
  }

  return alerts.sort((a, b) => a.urgency - b.urgency);
}
