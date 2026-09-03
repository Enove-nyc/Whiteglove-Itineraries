import type { TripAlert } from "@/data/trip-alerts";
import { toneFor, worthLeadingWith, type TripAdvisories } from "@/lib/trip-advisories";

/**
 * WHAT CHANGED SINCE THIS TRIP WAS PLANNED — in one short list, on the page
 * where somebody's trips already are.
 *
 * Two things could already tell a traveller something had moved, and both
 * lived on the command centre: a flight alert, and the State Department's
 * advisory for the countries the trip goes to. Somebody with a trip in three
 * weeks had to go and look, which is the same as not being told.
 *
 * THE KOSHER COPY HAS A THIRD SOURCE AND THIS ONE DOES NOT. There, the owner
 * writes dated notices about places — a restaurant that moved, a minyan
 * running only over Sukkos — and they hang off destination pages. This product
 * has no destination pages and no such notices, so the source is absent rather
 * than stubbed: an empty third list would be a heading with nothing behind it,
 * which is the failure this whole file is arranged to avoid.
 *
 * NOTHING NEW IS KNOWN HERE. This file invents no source and gathers no fresh
 * information: every row is something the site already held, moved to where
 * the question gets asked. That is the whole design. "Relevant current
 * information" is only worth showing where there is real dated information
 * behind it, so when the three sources are quiet this returns an empty list
 * and the panel above it draws nothing — a heading over an empty box is the
 * site claiming to be watching when it is not.
 *
 * WHAT IS NOT SHOWN, RATHER THAN WHAT IS, DECIDES THE SIZE OF IT. An advisory
 * is here only at level 3 or 4 — worthLeadingWith, the same threshold the
 * command centre leads with — because a list that repeats "Level 1: exercise
 * normal precautions" for four countries is a list nobody reads, and the full
 * roll is one link away on the trip's own page. A flight alert somebody has
 * already acknowledged is gone for the same reason.
 *
 * NOTHING IS RE-WORDED. An advisory carries the State Department's own level
 * label and summary; a notice carries the owner's own title and line; an alert
 * carries what the flight-status reading said. This file orders and drops.
 *
 * Pure — the page reads, this decides — so what a traveller is told can be
 * tested without a store, a feed or a session.
 */

/** Which of the two the row came from. Drawn differently, not ranked by it. */
export type TripUpdateSource = "flight" | "advisory";

export type TripUpdate = {
  id: string;
  source: TripUpdateSource;
  /** The tone the row is drawn in, sharing the advisory palette. */
  tone: "ok" | "caution" | "warn" | "danger" | "unknown";
  /** A word or two saying what kind of thing this is — "Flight", "Moved". */
  label: string;
  title: string;
  detail: string;
  /** Where the fuller version of this already lives. */
  href?: string;
  /** True when href leaves the site, so the link can say so. */
  external?: boolean;
};

export type TripUpdateInput = {
  /** Alerts already raised on this trip. Acknowledged ones are dropped here. */
  alerts: readonly TripAlert[];
  /** The advisory roll for the trip's countries, or null when unreadable. */
  advisories: TripAdvisories | null;
  /** Where the fuller version of a flight or advisory row lives. */
  tripHref: string;
};

export function tripUpdates({ alerts, advisories, tripHref }: TripUpdateInput): TripUpdate[] {
  const out: TripUpdate[] = [];

  // A change to a flight first: it is the one thing here that can move by the
  // hour, and the only one somebody may have to act on today.
  for (const alert of alerts) {
    if (alert.acknowledged) continue;
    out.push({
      id: `alert:${alert.id}`,
      source: "flight",
      tone: alert.kind === "flight_cancelled" ? "danger" : "caution",
      label: "Flight",
      title: alert.title,
      detail: alert.note,
      href: tripHref,
    });
  }

  // Then the countries, worst first — tripAdvisories has already sorted them.
  for (const entry of advisories?.countries ?? []) {
    if (!worthLeadingWith(entry.advisory?.level ?? null)) continue;
    const advisory = entry.advisory!;
    out.push({
      id: `advisory:${entry.country.toLowerCase()}`,
      source: "advisory",
      tone: toneFor(advisory.level),
      label: entry.country,
      title: advisory.levelLabel,
      detail: advisory.summary?.trim() || "Published by the US State Department.",
      href: advisory.link || tripHref,
      external: Boolean(advisory.link),
    });
  }

  return out;
}

/**
 * The trip these updates are about: the next one that has not finished yet.
 *
 * A trip whose last day has passed is history, and telling somebody their
 * flight home is delayed a week after they landed is worse than saying
 * nothing. A trip with no dates on it cannot be placed in time at all, so it
 * is not chosen — there is nothing to be current about.
 */
export function nextTripFor<T extends { startDate: string; endDate: string }>(
  trips: readonly T[],
  today: string,
): T | null {
  const dated = trips.filter((t) => t.startDate && t.endDate && t.endDate >= today);
  if (dated.length === 0) return null;
  return [...dated].sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
}
