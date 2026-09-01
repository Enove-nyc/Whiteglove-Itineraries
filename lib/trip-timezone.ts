import { timeZoneAt } from "@/lib/place-lookup";
import type { Itinerary } from "@/data/itinerary";

/**
 * WHICH CLOCK A TRIP IS READ IN.
 *
 * "Last opened today at 9:42 AM" has to mean the traveller's today, not the
 * server's: a trip in Tokyo opened at 08:00 there is not yesterday because a
 * server in California says so.
 *
 * Taken from where the trip actually is — the first stop with coordinates,
 * through the same tz-lookup path the zmanim already use, so this adds no new
 * source of truth. A trip with no coordinates yet falls back to UTC, which is
 * what the rest of the trip-facing code pins to deliberately.
 *
 * Its own module, with no next/headers in it, so the account store can call it
 * without dragging a request context into places that have none.
 */
export function tripTimeZone(itinerary: Itinerary | undefined): string {
  for (const activity of itinerary?.activities ?? []) {
    const raw = activity.coordinates?.trim();
    if (!raw) continue;
    const [lat, lon] = raw.split(",").map((n) => Number(n.trim()));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    try {
      const zone = timeZoneAt(lat, lon);
      if (zone) return zone;
    } catch {
      // tz-lookup throws on out-of-range coordinates. UTC is the answer then.
    }
  }
  return "UTC";
}
