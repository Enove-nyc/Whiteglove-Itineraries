"use client";

import { useEffect, useMemo, useState } from "react";
import { coordinatesToPoint, placeMapUrl } from "@/data/route-utils";
import { BRAND_ORIGIN, brandForHost } from "@/lib/site-brand-core";
import type { ItinActivity } from "@/data/itinerary";
import {
  curatedKosherPlacesNear,
  searchCuratedKosherPlaces,
  type CuratedKosherPlace,
  type CuratedKosherPlaceNearby,
} from "@/lib/curated-kosher";
import HechsherBadge from "@/components/HechsherBadge";
import { useRequireSignIn } from "@/components/SignInGate";
import { hechsherOf, useHechsherim } from "@/lib/use-hechsherim";

const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`);

function formatKm(km?: number) {
  if (km === undefined) return "";
  const mi = km * 0.621371;
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km · ${Math.round(mi)} mi`;
}

/**
 * Add one kosher place to the traveler's trip.
 *
 * THE TRIP IS READ FROM THE ACCOUNT, NOT FROM THE BROWSER. This used to open
 * localStorage, append to whatever it found and write it back, which meant a
 * signed-out visitor could "add to my trip" all afternoon into a trip that
 * existed nowhere but that browser. The caller gates on sign-in; this reads
 * the account's own trip so the stop lands on the real one.
 */
async function addKosherToTrip(place: CuratedKosherPlace): Promise<boolean> {
  try {
    const res = await fetch("/api/account/itinerary", { cache: "no-store" });
    if (!res.ok) return false;
    const data = await res.json();
    const itinerary = data?.itinerary ?? { title: "My trip", startDate: "", endDate: "", flights: [], lodging: [], activities: [] };
    const activity: ItinActivity = {
      id: uid(),
      name: place.name,
      address: place.address,
      coordinates: place.lat === undefined || place.lng === undefined ? undefined : `${place.lat}, ${place.lng}`,
      date: itinerary.startDate || "",
      notes: [place.category, place.diet].filter(Boolean).join(" · ") || "Kosher",
      bookedOnSite: false,
    };
    itinerary.activities = [...(itinerary.activities ?? []), activity];
    const saved = await fetch("/api/account/itinerary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itinerary }),
    });
    return saved.ok;
  } catch {
    return false;
  }
}

export default function KosherNearby({
  coordinates,
  query,
  radiusKm = 8,
  limit = 12,
  showAddToTrip = false,
  heading = "Kosher food nearby",
}: {
  coordinates?: string;
  query?: string;
  radiusKm?: number;
  limit?: number;
  /** Retained for existing callers; curated results are available immediately. */
  autoLoad?: boolean;
  showAddToTrip?: boolean;
  heading?: string;
}) {
  const point = useMemo(() => coordinatesToPoint(coordinates), [coordinates]);
  const [added, setAdded] = useState<Record<string, boolean>>({});
  // A failed "Add to my trip" used to be silent; this flags the one that
  // failed so its button can say so and invite a retry.
  const [addFailed, setAddFailed] = useState<Record<string, boolean>>({});
  // This card is also used inside the itinerary builder, reachable on the
  // itineraries domain — where /kosher does not exist (middleware.ts sends
  // guide-only paths to the kosher site). A same-tab link there would bounce
  // the visitor off-domain mid-build, which also breaks out of an installed
  // itineraries app entirely, so it opens the kosher site in a new tab there
  // instead of navigating away from the trip being built.
  const [itineraries, setItineraries] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") setItineraries(brandForHost(window.location.hostname) === "itineraries");
  }, []);
  const requireSignIn = useRequireSignIn();
  const places = useMemo<CuratedKosherPlaceNearby[]>(() => {
    if (query?.trim()) return searchCuratedKosherPlaces(query);
    return point ? curatedKosherPlacesNear(point, radiusKm) : [];
  }, [point, query, radiusKm]);
  const shown = useMemo(() => places.slice(0, limit), [places, limit]);
  const { statuses: confirmed, agencies } = useHechsherim(useMemo(() => shown.map((place) => place.id), [shown]));

  if (!point && !query?.trim()) return null;

  return (
    <div className="border border-[var(--gold-light)] bg-[#fcfaf6] p-5">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">{heading}</p>

      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">
          {query?.trim()
            ? "No White Glove kosher listings match that search."
            : `No White Glove kosher listings are within ${radiusKm} km of here.`}{" "}
          <a
            href={itineraries ? `${BRAND_ORIGIN.kosher}/kosher` : "/kosher"}
            {...(itineraries ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="underline decoration-[var(--gold)] underline-offset-2"
          >
            Browse the kosher food finder.
          </a>
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--gold-light)]">
          {shown.map((place) => {
            const hechsher = hechsherOf(confirmed, place, agencies);
            const coordinatesForMap =
              place.lat === undefined || place.lng === undefined ? undefined : `${place.lat}, ${place.lng}`;
            return (
              <li key={place.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-[family-name:var(--font-display)] text-lg text-[var(--navy)]">{place.name}</span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gold-ink)]">
                    {[place.category, place.diet, formatKm(place.km)].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-stone-600">{[place.city, place.country, place.address].filter(Boolean).join(" — ")}</p>
                {hechsher.state !== "unverified" && (
                  <div className="mt-1.5">
                    <HechsherBadge status={hechsher} size="sm" agencies={agencies} />
                  </div>
                )}
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {coordinatesForMap && (
                    <a
                      href={placeMapUrl(place.address, coordinatesForMap)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2"
                    >
                      Open in Maps →
                    </a>
                  )}
                  {place.phone && <a href={`tel:${place.phone.replace(/[^\d+]/g, "")}`} className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">Call {place.phone}</a>}
                  {place.website && <a href={place.website} target="_blank" rel="noreferrer" className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">Website →</a>}
                  {showAddToTrip && (
                    <button
                      type="button"
                      onClick={() =>
                        requireSignIn(async () => {
                          if (await addKosherToTrip(place)) {
                            setAdded((current) => ({ ...current, [place.id]: true }));
                            setAddFailed((current) => ({ ...current, [place.id]: false }));
                          } else {
                            setAddFailed((current) => ({ ...current, [place.id]: true }));
                          }
                        }, "Sign in to add to your trip")
                      }
                      className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2"
                    >
                      {added[place.id] ? "Added ✓" : addFailed[place.id] ? "Couldn’t add — try again" : "Add to my trip"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {shown.length > 0 && (
        <p className="mt-3 text-[11px] leading-5 text-stone-500">
          White Glove listings use published locations and editorially maintained details. Confirm current supervision directly before you go.
        </p>
      )}
    </div>
  );
}
