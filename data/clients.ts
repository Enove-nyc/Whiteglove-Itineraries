// A planner's clients — pure data model + pure transforms, the same
// discipline data/trip-pipeline.ts and data/library.ts keep.
//
// A CLIENT IS NOT ITS OWN RECORD. It is the name already typed onto a trip
// (SavedTrip.client in lib/account-store.ts) — matched the same
// case/whitespace-insensitive way travelerUnitKey groups a family
// (data/itinerary.ts). There is nothing to keep in sync, because there is
// nothing kept twice: rename a client on one trip and the roster reads the
// new name back the next time it's asked, the same way renaming an
// itinerary's title changes what the trip list shows.
//
// WHAT DOES NEED A HOME OF ITS OWN: a note or a preference that belongs to
// the PERSON, not any one trip — "aisle seat, no shellfish" is true on every
// trip they take, not just this one. That's the one thing this file adds
// storage for (ClientProfile, kept in lib/account-store.ts's AccountData
// alongside the library, the same way the library belongs to the account
// rather than one trip).

export function clientKey(name: string): string {
  return name.trim().toLowerCase();
}

export type ClientProfile = {
  /** clientKey() of the name this belongs to. */
  key: string;
  notes?: string;
  preferences?: string;
  updatedAt: string;
};

export function emptyClientProfile(key: string): ClientProfile {
  return { key, updatedAt: new Date().toISOString() };
}

/** The minimum a trip needs to carry for the roster below — never the whole
 *  SavedTrip, so this file stays independent of lib/account-store.ts. */
export type ClientTripFacts = {
  id: string;
  client?: string;
  startDate?: string;
  endDate?: string;
  updatedAt: string;
};

export type ClientSummary = {
  key: string;
  /** As most recently typed — the same name shown everywhere else, not the
   *  lowercased match key. */
  name: string;
  tripCount: number;
  upcomingCount: number;
  /** The newest of the client's trips' own updatedAt — for sorting the roster
   *  by who's been touched most recently, the same as the trip list itself. */
  lastActivityAt: string;
};

/** True once a trip's own dates say it hasn't happened yet, or has no dates
 *  at all — an undated trip is still ahead of the client, not behind them. */
function isUpcoming(trip: ClientTripFacts, today: string): boolean {
  return !trip.endDate || trip.endDate >= today;
}

/**
 * Every distinct client on these trips, newest activity first — trips with
 * no client name at all (an account's own personal trips) are left out
 * entirely, the same way data/itinerary.ts's unitsOf only ever names units
 * that actually exist.
 */
export function clientsFromTrips(trips: ClientTripFacts[], today: string): ClientSummary[] {
  const byKey = new Map<string, ClientSummary>();
  for (const trip of trips) {
    const name = trip.client?.trim();
    if (!name) continue;
    const key = clientKey(name);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        key,
        name,
        tripCount: 1,
        upcomingCount: isUpcoming(trip, today) ? 1 : 0,
        lastActivityAt: trip.updatedAt,
      });
      continue;
    }
    existing.tripCount += 1;
    if (isUpcoming(trip, today)) existing.upcomingCount += 1;
    // The most recently typed spelling wins for display — matching keeps
    // "Cohen Family" and "cohen family" one client; showing whichever was
    // touched last is the same rule the trip list itself uses for a title.
    if (trip.updatedAt > existing.lastActivityAt) {
      existing.name = name;
      existing.lastActivityAt = trip.updatedAt;
    }
  }
  return [...byKey.values()].sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1));
}

/** Every trip belonging to one client, newest first. */
export function tripsForClient<T extends ClientTripFacts>(trips: T[], key: string): T[] {
  return trips.filter((t) => t.client?.trim() && clientKey(t.client) === key).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}
