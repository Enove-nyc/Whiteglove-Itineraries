import "server-only";

import { getTripAlerts, getTripItinerary, getTrips } from "@/lib/account-store";
import { stopsForTrip } from "@/lib/command-center-data";
import { fetchAdvisories } from "@/lib/travel-advisories";
import { tripAdvisories } from "@/lib/trip-advisories";
import { nextTripFor, tripUpdates, type TripUpdate } from "@/lib/trip-updates";

/**
 * The reading half of trip updates: the stores and the one feed.
 *
 * Kept apart from lib/trip-updates.ts, which touches nothing, for the same
 * reason lib/command-center-data.ts is kept apart from lib/command-center.ts —
 * the rules that decide what a traveller is told stay testable without a
 * session, a database or a government feed being available.
 *
 * NEVER THROWS. Every read here is best-effort: a trip that will not load, a
 * feed that times out, a Redis that is not configured. Each of those makes
 * this quieter, never broken, because the panel above it is an extra on a page
 * that has its own job.
 */
export async function tripUpdatesFor(
  email: string,
  today: string,
): Promise<{ trip: { id: string; name: string } | null; updates: TripUpdate[] }> {
  const none = { trip: null, updates: [] };
  if (!email) return none;

  const trips = await getTrips(email).catch(() => []);
  const next = nextTripFor(trips, today);
  if (!next) return none;

  const loaded = await getTripItinerary(email, next.id).catch(() => null);
  if (!loaded) return none;

  const stops = await stopsForTrip(loaded.itinerary).catch(() => []);
  const [alerts, feed] = await Promise.all([
    getTripAlerts(email, next.id).catch(() => []),
    fetchAdvisories(),
  ]);

  const advisories = feed.available ? tripAdvisories(stops, feed.advisories) : null;

  return {
    trip: { id: next.id, name: next.name },
    // The trip's own page, where all three of these already live in full.
    updates: tripUpdates({ alerts, advisories, tripHref: "/command-center" }),
  };
}
