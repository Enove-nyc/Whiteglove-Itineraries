"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SavedPlace } from "@/data/route-utils";

/**
 * The account's own content, in the three sections the page promises:
 * Itineraries, Route, Favorites. One component because all three read the
 * same two answers — the account data and its trips — and asking twice per
 * section would be six requests for two facts.
 *
 * No anonymous preview any more: /account sends a signed-out visitor to sign
 * in before this renders, so the old localStorage fallback (places saved
 * while browsing anonymously) had nobody left to show anything to.
 */

/**
 * One trip in the account. Somebody planning Switzerland next week, Kraków in
 * a fortnight and Poland the month after has three of these, and the account
 * page has to admit they exist — showing one route made the second and third
 * trips findable only from inside the planner.
 */
type Trip = {
  id: string;
  name: string;
  active: boolean;
  stops: number;
  places: number;
  days: number;
  startDate: string;
  endDate: string;
  shared: boolean;
};

/** "2 – 9 August 2026", or "Dates not set yet". */
function tripDates(trip: Trip): string {
  const parse = (d: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d ?? "");
    return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)) : null;
  };
  const from = parse(trip.startDate);
  const to = parse(trip.endDate);
  if (!from) return "Dates not set yet";
  const long = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  if (!to || +to === +from) return long(from);
  const sameMonth = from.getUTCMonth() === to.getUTCMonth() && from.getUTCFullYear() === to.getUTCFullYear();
  return sameMonth ? `${from.getUTCDate()} – ${long(to)}` : `${long(from)} – ${long(to)}`;
}

export default function AccountRoutePanel() {
  const router = useRouter();
  // Null until each answer is known — an account with nothing saved and an
  // account that has not loaded yet are different things, and "Nothing saved
  // yet" over a list somebody spent an hour on would be alarming.
  const [favorites, setFavorites] = useState<SavedPlace[] | null>(null);
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const syncAccount = async () => {
      const response = await fetch("/api/account/me", { cache: "no-store" });
      const data = await response.json().catch(() => null) as { data?: { favorites?: SavedPlace[] } | null } | null;
      if (data?.data) setFavorites(data.data.favorites ?? []);
    };
    const syncTrips = async () => {
      const response = await fetch("/api/account/trips", { cache: "no-store" });
      if (!response.ok) return; // no account store connected
      const data = await response.json().catch(() => null) as { trips?: Trip[] } | null;
      if (data?.trips) setTrips(data.trips);
    };
    syncAccount().catch(() => undefined);
    syncTrips().catch(() => undefined);
  }, []);

  /**
   * Start a genuinely new trip, then open it.
   *
   * This used to be a plain link to the planner, which opened whichever trip
   * was already active — so "New itinerary" showed you the itinerary you
   * already had. Creating the trip is a call the account has to make: it is
   * what mints a blank one and makes it the open one.
   */
  async function newTrip() {
    setOpening("new");
    try {
      const res = await fetch("/api/account/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "Could not start a new itinerary.");
        setOpening(null);
        return;
      }
      setTrips(data.trips);
    } catch {
      setError("Could not reach the server.");
      setOpening(null);
      return;
    }
    router.push("/itinerary");
  }

  // Switching trip and opening the page in one press. Without the switch, the
  // page would open whichever trip was last active rather than the one pressed.
  async function openTrip(id: string, href: string) {
    setOpening(id);
    try {
      await fetch("/api/account/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "switch", id }),
      });
    } catch {
      /* the page still opens; it just opens the trip that was already active */
    }
    router.push(href);
  }

  return (
    <>
      {/* The same trips appear under Itineraries and under Route on purpose —
          a trip has an itinerary AND a route of saved places, and which
          section you press only decides which page opens. */}
      <Section
        id="account-itineraries"
        title="Itineraries"
        action={
          <button
            type="button"
            onClick={newTrip}
            disabled={opening !== null}
            className="min-h-11 shrink-0 border border-[var(--gold)] px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white disabled:opacity-50"
          >
            {opening === "new" ? "Starting…" : "New itinerary"}
          </button>
        }
      >
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        <TripList
          trips={trips}
          empty="No itineraries yet."
          line={(trip) =>
            [tripDates(trip), trip.days > 0 ? `${trip.days} ${trip.days === 1 ? "day" : "days"}` : null, `${trip.stops} ${trip.stops === 1 ? "stop" : "stops"}`]
              .filter(Boolean)
              .join(" · ")
          }
          busy={opening}
          onOpen={(id) => openTrip(id, "/itinerary")}
        />
        <Link
          href="/command-center"
          className="mt-5 inline-block text-xs font-bold uppercase tracking-[0.14em] text-[var(--navy)] transition hover:text-[var(--gold-ink)]"
        >
          Check the trip before you go →
        </Link>
      </Section>

      <Section
        id="account-route"
        title="Route"
        action={
          <Link
            href="/my-route"
            className="flex min-h-11 shrink-0 items-center border border-[var(--gold)] px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white"
          >
            Open My Route
          </Link>
        }
      >
        <TripList
          trips={trips}
          empty="Nothing saved yet."
          line={(trip) => `${trip.places} ${trip.places === 1 ? "place" : "places"} saved${trip.stops > 0 ? ` · ${trip.stops} already on days` : ""}`}
          busy={opening}
          onOpen={(id) => openTrip(id, "/my-route")}
        />
      </Section>

      <Section id="account-favorites" title="Favorites">
        {favorites !== null &&
          (favorites.length === 0 ? (
            <p className="mt-4 text-sm leading-6 text-stone-600">Nothing saved yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--gold-light)] border-t border-[var(--gold-light)]">
              {favorites.map((place) => (
                <li key={place.id} className="py-4">
                  {place.href ? (
                    <Link href={place.href} className="group block">
                      <FavoriteName place={place} />
                    </Link>
                  ) : (
                    <FavoriteName place={place} />
                  )}
                </li>
              ))}
            </ul>
          ))}
      </Section>
    </>
  );
}

function FavoriteName({ place }: { place: SavedPlace }) {
  return (
    <>
      <p className="font-[family-name:var(--font-display)] text-[var(--navy)] transition group-hover:text-[var(--gold-ink)]">
        {place.yiddishName && <span dir="rtl" lang="yi" className="block text-2xl leading-tight">{place.yiddishName}</span>}
        <span className="mt-1 block text-base">{place.name}</span>
      </p>
      {place.address && <p className="mt-1 text-sm text-stone-600">{place.address}</p>}
    </>
  );
}

/** One of the page's areas: a heading, one action, and its content. */
function Section({ id, title, action, children }: {
  id: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-8 rounded-lg border border-[var(--gold-light)] bg-[#FAF8F3] p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id={id} className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** The account's trips, each with a way in. `empty` stands in once the answer
 *  is known to be none; before that the section stays quiet. */
function TripList({ trips, empty, line, busy, onOpen }: {
  trips: Trip[] | null;
  empty: string;
  line: (trip: Trip) => string;
  busy: string | null;
  onOpen: (id: string) => void;
}) {
  if (trips === null) return null;
  if (trips.length === 0) return <p className="mt-4 text-sm leading-6 text-stone-600">{empty}</p>;
  return (
    <ul className="mt-4 divide-y divide-[var(--gold-light)] border-t border-[var(--gold-light)]">
      {trips.map((trip) => (
        <li key={trip.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="min-w-0">
            <p className="font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">
              {trip.name}
              {trip.active && <span className="ml-2 align-middle text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">Open now</span>}
              {trip.shared && <span className="ml-2 align-middle text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">Shared</span>}
            </p>
            <p className="mt-1 text-sm text-stone-600">{line(trip)}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpen(trip.id)}
            disabled={busy !== null}
            className="min-h-11 shrink-0 border border-[var(--gold-light)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:border-[var(--gold)] hover:bg-[var(--cream-deep)] disabled:opacity-50"
          >
            {busy === trip.id ? "Opening…" : trip.active ? "Edit" : "Switch and edit"}
          </button>
        </li>
      ))}
    </ul>
  );
}
