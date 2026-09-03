"use client";

import Link from "next/link";
import { useBookingLink } from "@/components/BookingLinkProvider";
import { useRequireSignIn } from "@/components/SignInGate";
import { IconButton, IconLink } from "@/components/icons/IconAction";
import { bookingHref } from "@/lib/booking-access";
import { useCallback, useState, useSyncExternalStore } from "react";
import { placeDirectionsUrl, placeRole, withPlaceFirst, withPlaceLast, type SavedPlace } from "@/data/route-utils";
import { useSignedIn } from "@/lib/use-signed-in";
import { AddedToTrip, useAddToItinerary } from "@/components/useAddToItinerary";

/**
 * Everything you can do with a destination, in one bar, on every destination
 * page.
 *
 * The guides were good pages that dead-ended: you could read everything about
 * Lizhensk and the only thing the page let you do was save it. Planning
 * happened somewhere else, and you had to go and find it. So the actions the
 * planner needs now live where the reading happens — add it, make it the start
 * or the end of the route, put it on the trip, see what else is near it, find
 * the airport, send it to somebody.
 *
 * The same bar on every page, in the same order, so it is learned once.
 */

const ROUTE_KEY = "whiteGloveMyRoute";
const FAVORITES_KEY = "whiteGloveFavorites";

export type NearbyAirport = { code: string; name: string; km: string; directionsUrl: string };


const NONE: SavedPlace[] = [];

/**
 * Parsed once per distinct stored value.
 *
 * useSyncExternalStore compares snapshots by identity, so parsing afresh on
 * every read would hand React a new array each time and it would re-render
 * forever.
 */
const parsed = new Map<string, { raw: string; value: SavedPlace[] }>();

function read(key: string): SavedPlace[] {
  if (typeof window === "undefined") return NONE;
  const raw = localStorage.getItem(key) || "[]";
  const cached = parsed.get(key);
  if (cached && cached.raw === raw) return cached.value;
  let value: SavedPlace[] = NONE;
  try {
    const list = JSON.parse(raw);
    if (Array.isArray(list)) value = list as SavedPlace[];
  } catch {
    /* a corrupt entry is an empty route, not a crash */
  }
  parsed.set(key, { raw, value });
  return value;
}

/**
 * The saved route and favourites, read from storage rather than copied into
 * state.
 *
 * Copying them into state in an effect meant this bar could disagree with the
 * rest of the page — save something in the header and these buttons still said
 * "Add". Subscribing means every copy of the bar, and the route count in the
 * header, are looking at the same thing. `storage` covers the other tab.
 */
function subscribe(onChange: () => void) {
  window.addEventListener("whiteglove-route", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("whiteglove-route", onChange);
    window.removeEventListener("storage", onChange);
  };
}

function useSavedPlaces(key: string): SavedPlace[] {
  const snapshot = useCallback(() => read(key), [key]);
  // The server has no storage; an empty route is what it renders, and the
  // real one arrives on hydration.
  return useSyncExternalStore(subscribe, snapshot, () => NONE);
}

function write(key: string, places: SavedPlace[]) {
  localStorage.setItem(key, JSON.stringify(places));
  // The route dashboard and the header count listen for this.
  window.dispatchEvent(new Event("whiteglove-route"));
}

const base =
  "inline-flex min-h-11 items-center justify-center rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.11em] transition";
const done = `${base} border-[var(--navy)] bg-[var(--navy)] text-white`;
const quiet = `${base} border-[var(--gold-light)] text-stone-600 hover:border-[var(--gold)] hover:text-[var(--navy)]`;

type Nearby = { name: string; yiddishName?: string; href: string; km: number };

export default function DestinationActions({
  place,
  airports = [],
}: {
  place: SavedPlace;
  /** Worked out on the server, where the airport list already lives. */
  airports?: NearbyAirport[];
}) {
  const signedIn = useSignedIn();
  const requireSignIn = useRequireSignIn();
  const booking = useBookingLink();
  const route = useSavedPlaces(ROUTE_KEY);
  const favorites = useSavedPlaces(FAVORITES_KEY);
  const favorite = favorites.some((item) => item.id === place.id);
  // One implementation of adding a stop, shared with the attraction
  // cards: it reads the account, and asks which trip when the account
  // holds more than one.
  const trip = useAddToItinerary();
  const [panel, setPanel] = useState<"nearby" | "airports" | null>(null);
  const [nearby, setNearby] = useState<Nearby[] | null>(null);
  const [shared, setShared] = useState("");

  const role = placeRole(route, place.id);

  const saveRoute = (next: SavedPlace[]) => {
    write(ROUTE_KEY, next);
    void fetch("/api/account/places", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection: "route", action: "replace", items: next }),
    }).catch(() => undefined);
  };

  const toggleRoute = () =>
    saveRoute(role === "absent" ? [...route, place] : route.filter((item) => item.id !== place.id));

  const toggleFavorite = () => {
    const next = favorite ? favorites.filter((item) => item.id !== place.id) : [...favorites, place];
    write(FAVORITES_KEY, next);
    void fetch("/api/account/places", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection: "favorites", action: "toggle", place }),
    }).catch(() => undefined);
  };


  const openNearby = async () => {
    setPanel(panel === "nearby" ? null : "nearby");
    if (nearby || !place.coordinates) return;
    try {
      const response = await fetch(`/api/itinerary/nearby?coordinates=${encodeURIComponent(place.coordinates)}&exclude=${encodeURIComponent(place.name)}`);
      const data = await response.json();
      setNearby(Array.isArray(data.suggestions) ? data.suggestions : []);
    } catch {
      setNearby([]);
    }
  };

  const share = async () => {
    const url = typeof window !== "undefined" ? new URL(place.href ?? "/", window.location.origin).toString() : "";
    const payload = { title: place.name, text: `${place.name} — White Glove Kosher Travel`, url };
    // The phone's own share sheet where there is one; the clipboard where
    // there is not. Both end with the person holding a link.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(payload);
        return;
      } catch {
        // Dismissed, or refused. Fall through to the clipboard rather than
        // leaving the button having done nothing.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared("Link copied.");
    } catch {
      setShared(url);
    }
  };

  return (
    <div className="mt-6">
      {/* The familiar actions as icons — the same set, in the same order, as
          every other detail surface (see components/DetailActionRow.tsx):
          directions, share, favorite, route, itinerary. Each carries an
          accessible name and a desktop tooltip; none is a bare symbol. The
          suitcase flips its name once the place is on the trip. */}
      <div className="flex flex-wrap items-center gap-1">
        {(place.address || place.coordinates) && (
          <IconLink icon="directions" label="Directions" href={placeDirectionsUrl(place.address, place.coordinates)} />
        )}
        <IconButton icon="share" label="Share" onClick={() => void share()} />
        {/* Still asking whether they are signed in — a moment of nothing
            beats flashing the wrong state at somebody. Pressed signed out,
            each save opens the sign-in dialog and completes itself on
            success. See components/SignInGate.tsx. */}
        {signedIn !== null && (
          <>
            <IconButton
              icon={favorite ? "heart-filled" : "heart"}
              label={favorite ? "Remove favorite" : "Favorite"}
              active={favorite}
              onClick={() => requireSignIn(toggleFavorite, "Sign in to save")}
            />
            <IconButton
              icon="route"
              label={role === "absent" ? "Add to Route" : "Remove from Route"}
              active={role !== "absent"}
              onClick={() => requireSignIn(toggleRoute, "Sign in to add to Route")}
            />
            {trip.phase.kind === "added" ? (
              <IconLink icon="suitcase" label="View itinerary" href="/itinerary" active />
            ) : (
              <IconButton
                icon="suitcase"
                label={trip.phase.kind === "working" ? "Adding to itinerary" : "Add to itinerary"}
                onClick={() => trip.start(place)}
              />
            )}
          </>
        )}
      </div>

      {/* An icon that changes colour does not say which of several trips the
          stop landed on. This does. */}
      {trip.phase.kind === "added" && (
        <p className="mt-2" role="status">
          <AddedToTrip tripName={trip.phase.tripName} />
        </p>
      )}
      {trip.phase.kind === "failed" && (
        <p className="mt-2 text-sm font-semibold text-[var(--navy)]" role="status">
          That did not save — try again.
        </p>
      )}
      {trip.dialog}

      {/* The planner-specific extras keep their words: "start the route
          here" has no familiar icon, and an unfamiliar icon is a guess. */}
      <div className="mt-3 flex flex-wrap gap-2">
        {signedIn !== null && (
          <>
            <button
              type="button"
              onClick={() => requireSignIn(() => saveRoute(withPlaceFirst(route, place)), "Sign in to set the start of your Route")}
              className={role === "start" ? done : quiet}
              aria-pressed={role === "start"}
            >
              {role === "start" ? "✓ Starts here" : "Start route here"}
            </button>
            <button
              type="button"
              onClick={() => requireSignIn(() => saveRoute(withPlaceLast(route, place)), "Sign in to set the end of your Route")}
              className={role === "end" ? done : quiet}
              aria-pressed={role === "end"}
            >
              {role === "end" ? "✓ Ends here" : "End route here"}
            </button>
          </>
        )}

        {/* These need no account — they are reading, not saving. */}
        {place.coordinates && (
          <button type="button" onClick={openNearby} className={quiet} aria-expanded={panel === "nearby"}>
            Nearby destinations
          </button>
        )}
        {airports.length > 0 && (
          <button type="button" onClick={() => setPanel(panel === "airports" ? null : "airports")} className={quiet} aria-expanded={panel === "airports"}>
            Nearest airport
          </button>
        )}
      </div>

      {shared && <p className="mt-3 text-sm font-semibold text-[var(--navy)]">{shared}</p>}

      {panel === "nearby" && (
        <div className="mt-4 rounded-2xl border border-[var(--gold-light)] bg-[#FAF8F3] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">Also near {place.name}</p>
          {nearby === null ? (
            <p className="mt-2 text-sm text-stone-500">Looking…</p>
          ) : nearby.length === 0 ? (
            <p className="mt-2 text-sm text-stone-600">Nothing else of ours within a reasonable drive of here.</p>
          ) : (
            <ul className="mt-3 space-y-1">
              {nearby.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="flex min-h-11 items-center justify-between gap-3 rounded-md px-2 text-sm text-[var(--navy)] hover:bg-[var(--cream-deep)]">
                    <span>{item.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-stone-500">{Math.round(item.km)} km</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {panel === "airports" && (
        <div className="mt-4 rounded-2xl border border-[var(--gold-light)] bg-[#FAF8F3] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">Flying in</p>
          <ul className="mt-3 space-y-1">
            {airports.map((airport) => (
              <li key={airport.code} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-[var(--navy)]">
                  <strong>{airport.code}</strong> — {airport.name} {airport.km && <span className="text-stone-500">({airport.km})</span>}
                </span>
                <span className="flex gap-2">
                  <a href={airport.directionsUrl} target="_blank" rel="noreferrer" className={quiet}>
                    Driving time
                  </a>
                  <Link href={bookingHref(booking, { type: "flights", to: airport.code })} className={quiet}>
                    Find flights
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
