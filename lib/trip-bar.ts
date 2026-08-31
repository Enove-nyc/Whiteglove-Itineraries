import type { AccountPlan } from "@/lib/account-plans";
import { tripPlacesFor, type TripPlace } from "@/lib/account-places";

/**
 * WHICH TRIP AM I ON, AND WHERE ELSE CAN I GO ON IT.
 *
 * The advisor's work on one trip is spread across six separate top-level
 * pages, each of which operates on whichever trip happens to be open on the
 * account. Nothing on any of them said which trip that was, and there was no
 * way to get from Payments to Proposals except back out through the global
 * menu and in again.
 *
 * So somebody with twenty clients, halfway through the Harpers' Rome trip, had
 * to carry "the open trip is the Harpers" in their head across every screen —
 * and the one screen that names a trip, the pipeline, is the one they had to
 * leave to reach any of this.
 *
 * THIS FILE IS THE SENTENCE, NOT THE BAR. Everything here is pure: it takes a
 * trip and a plan and returns what to print. The component that draws it does
 * the reading and no thinking, which is why the awkward cases below can be
 * tested at all — none of them needs a browser, an account, or a store, and
 * this container has none of the three.
 */

/** What the bar needs off a trip. A subset of SavedTrip, so a test can build one. */
export type TripForBar = {
  name?: string;
  /** Who it is for, when that is somebody else. Empty for one's own trip. */
  client?: string;
  itinerary?: { title?: string; startDate?: string; endDate?: string };
};

export type TripBar = {
  /** Who it is for, or null when the trip is the account holder's own. */
  client: string | null;
  /** The trip's own name. Never empty — see tripBarTitle. */
  title: string;
  /** "25 Oct – 1 Nov 2026", or null when the trip has no dates yet. */
  dates: string | null;
  /** Where else this plan can go on this trip. */
  places: TripPlace[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A YYYY-MM-DD as {y, m, d}, or null when it is not one. */
function parts(date: string | undefined): { y: number; m: number; d: number } | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { y: Number(m[1]), m: month, d: day };
}

/**
 * The dates, as short as they can be said without losing anything.
 *
 * A trip inside one month says the month once — "25–29 Oct 2026" — and one
 * that crosses a year says both. A trip with only a start date says the start
 * date; half a range is still worth knowing, and "25 Oct – " is not.
 */
export function tripBarDates(itinerary: TripForBar["itinerary"]): string | null {
  const from = parts(itinerary?.startDate);
  const to = parts(itinerary?.endDate);
  if (!from && !to) return null;
  if (!from) return `Until ${MONTHS[to!.m - 1]} ${to!.d}, ${to!.y}`;
  if (!to) return `From ${from.d} ${MONTHS[from.m - 1]} ${from.y}`;

  if (from.y === to.y && from.m === to.m) {
    if (from.d === to.d) return `${from.d} ${MONTHS[from.m - 1]} ${from.y}`;
    return `${from.d}–${to.d} ${MONTHS[from.m - 1]} ${from.y}`;
  }
  if (from.y === to.y) return `${from.d} ${MONTHS[from.m - 1]} – ${to.d} ${MONTHS[to.m - 1]} ${from.y}`;
  return `${from.d} ${MONTHS[from.m - 1]} ${from.y} – ${to.d} ${MONTHS[to.m - 1]} ${to.y}`;
}

/**
 * The trip's name.
 *
 * The saved name first, then the itinerary's own title, and "This trip" only
 * when both are blank — which happens, because a trip is created before it is
 * named. A bar with an empty space where the name goes is worse than one that
 * admits the trip has no name yet.
 */
export function tripBarTitle(trip: TripForBar): string {
  return trip.name?.trim() || trip.itinerary?.title?.trim() || "This trip";
}

/**
 * Everything the bar prints, or null when there is nothing worth printing.
 *
 * NULL WHEN THE PLAN HAS ONE DOOR. A traveller planning their own trip can
 * reach exactly one of these screens, the itinerary, and a navigation bar
 * offering the page you are already on is furniture. The bar is for somebody
 * moving between a trip's screens, which is what a plan with clients does.
 */
export function tripBar(trip: TripForBar | null | undefined, plan: AccountPlan | undefined): TripBar | null {
  if (!trip) return null;
  const places = tripPlacesFor(plan);
  if (places.length < 2) return null;
  return {
    client: trip.client?.trim() || null,
    title: tripBarTitle(trip),
    dates: tripBarDates(trip.itinerary),
    places,
  };
}

/**
 * THE LINE UNDER A TRIP'S NAME IN THE LIST.
 *
 * The list of trips said: "3 stops · 8 days · in 2 months · 5 saved · client
 * code created". Five facts, and the one an advisor picks a trip out of a list
 * by — WHEN IT IS — was not among them. "8 days" is not a date and "in 2
 * months" is not a date; twenty trips sorted by neither is twenty rows you
 * have to open to tell apart.
 *
 * Two of the five were not worth the room either. "5 saved" is saved places,
 * which is a count of something that lives inside the trip and means nothing
 * from outside it. "client code created" is the name of a database field: what
 * an advisor wants to know is whether the client can open their app, which is
 * what it now says.
 *
 * So the dates lead, and the rest is what actually distinguishes one trip from
 * another.
 */
export function tripRowMeta(
  trip: {
    stops?: number;
    days?: number;
    startDate?: string;
    endDate?: string;
    shareId?: string;
  },
  /** Already-phrased countdown from countdownPhrase, or null. */
  countdown: string | null,
): string {
  const dates = tripBarDates({ startDate: trip.startDate, endDate: trip.endDate });
  const stops = trip.stops ?? 0;
  return [
    // WHEN, first, because that is what tells two trips apart at a glance.
    dates ?? "No dates yet",
    trip.days ? `${trip.days} ${trip.days === 1 ? "day" : "days"}` : "",
    stops ? `${stops} ${stops === 1 ? "stop" : "stops"}` : "",
    countdown ?? "",
    // Whether the client can open their app — not the name of the field that
    // makes it true.
    trip.shareId ? "client can open it" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
