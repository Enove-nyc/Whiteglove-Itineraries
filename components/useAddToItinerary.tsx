"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { useRequireSignIn } from "@/components/SignInGate";
import { useFocusTrap } from "@/components/useFocusTrap";
import { emptyItinerary, type ItinActivity, type Itinerary } from "@/data/itinerary";

/**
 * Putting one place on one trip — the whole of it, in one place.
 *
 * WHY THIS IS A HOOK AND NOT THREE COPIES. Three surfaces can add a stop to a
 * trip: the suitcase on a detail page, the suitcase on a destination page, and
 * the button on an attraction card. They had three separate implementations,
 * which is how two of them came to be writing a stale browser copy over the
 * account. One implementation now, three call sites.
 *
 * ASK WHICH TRIP, WHEN THERE IS MORE THAN ONE. An account can hold several
 * trips and one of them is "open" in the planner. Adding silently to whichever
 * that happens to be is a guess, and a wrong guess is invisible: the stop lands
 * in a five-day trip you were not looking at and nothing on screen says so. So
 * one trip adds straight away and names itself afterwards; two or more ask
 * first, showing each trip's dates and how many stops it already holds.
 *
 * THE STOP ARRIVES WITHOUT A DAY, ON PURPOSE. Somebody reading about the Forum
 * knows they want it on the trip; they do not yet know it is a Tuesday. An
 * undated stop lands in the planner's "Not scheduled yet" list, where a
 * dropdown puts it on a day. Choosing a day here would put a stop on a date
 * nobody picked, and burying it inside a five-day plan is exactly how it gets
 * lost. The confirmation says where it went and links to the place it is
 * waiting.
 */

export type TripStop = {
  id: string;
  name: string;
  yiddishName?: string;
  address?: string;
  coordinates?: string;
};

type TripChoice = {
  id: string;
  name: string;
  active: boolean;
  stops: number;
  days: number;
  startDate: string;
  endDate: string;
};

type Phase =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "choosing"; trips: TripChoice[]; place: TripStop }
  | { kind: "added"; tripName: string }
  | { kind: "failed" };

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`;

/** A trip's dates in a form that fits on one line, or nothing when unset. */
function whenIsIt(trip: TripChoice): string {
  const short = (date: string) => {
    const t = Date.parse(`${date}T00:00:00Z`);
    return Number.isNaN(t) ? "" : new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  };
  const from = short(trip.startDate);
  const to = short(trip.endDate);
  if (from && to) return `${from} – ${to}`;
  return from || to || "No dates yet";
}

/**
 * Read the trip from the account, append the stop, save it back.
 *
 * READS BEFORE IT WRITES, ALWAYS. Building the new itinerary from anything
 * other than what the account currently holds is how a trip gets overwritten,
 * and it fails silently when it does. If the read fails, nothing is written.
 */
async function appendStop(place: TripStop, tripId?: string): Promise<string | null> {
  const query = tripId ? `?trip=${encodeURIComponent(tripId)}` : "";
  const read = await fetch(`/api/account/itinerary${query}`);
  if (!read.ok) return null;
  const data = (await read.json()) as { itinerary?: Itinerary | null; tripId?: string | null; tripName?: string | null };
  const itin: Itinerary = { ...emptyItinerary(), ...(data.itinerary ?? {}) };

  const activity: ItinActivity = {
    id: uid(),
    name: place.name,
    yiddishName: place.yiddishName,
    address: place.address,
    coordinates: place.coordinates,
    date: "",
    bookedOnSite: false,
  };
  const next: Itinerary = { ...itin, activities: [...(itin.activities ?? []), activity] };

  const saved = await fetch("/api/account/itinerary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itinerary: next, tripId: tripId ?? data.tripId ?? undefined }),
  });
  if (!saved.ok) return null;
  return data.tripName || "your trip";
}

export function useAddToItinerary() {
  const requireSignIn = useRequireSignIn();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const close = useCallback(() => setPhase({ kind: "idle" }), []);
  const dialogRef = useFocusTrap<HTMLDivElement>(phase.kind === "choosing", close);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  const addTo = useCallback(async (place: TripStop, tripId?: string) => {
    setPhase({ kind: "working" });
    try {
      const tripName = await appendStop(place, tripId);
      setPhase(tripName ? { kind: "added", tripName } : { kind: "failed" });
    } catch {
      setPhase({ kind: "failed" });
    }
  }, []);

  const start = useCallback(
    (place: TripStop) => {
      returnFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      requireSignIn(() => {
        void (async () => {
          setPhase({ kind: "working" });
          let trips: TripChoice[] = [];
          try {
            const response = await fetch("/api/account/trips");
            if (response.ok) trips = ((await response.json()) as { trips?: TripChoice[] }).trips ?? [];
          } catch {
            // Asking which trip is a courtesy; not being able to ask is not a
            // reason to refuse. Fall through to the trip they have open.
          }
          if (trips.length > 1) {
            setPhase({ kind: "choosing", trips, place });
            return;
          }
          await addTo(place, trips[0]?.id);
        })();
      }, "Sign in to add this to your itinerary");
    },
    [addTo, requireSignIn],
  );

  const dialog =
    phase.kind === "choosing" ? (
      <div
        className="fixed inset-0 z-[var(--wg-z-modal)] flex items-end justify-center bg-[var(--navy)]/50 p-4 backdrop-blur-[2px] sm:items-center"
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-to-trip-title"
          className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--gold-light)] bg-white p-6 shadow-[0_24px_60px_rgba(16, 47, 53,.20)] sm:p-8"
        >
          <div className="flex items-start justify-between gap-4">
            <h2 id="add-to-trip-title" className="font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]">
              Which trip?
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-[var(--cream-deep)] hover:text-[var(--navy)]"
            >
              ✕
            </button>
          </div>
          <p className="mt-2 text-sm text-stone-600">
            Adding <span className="font-semibold text-[var(--navy)]">{phase.place.name}</span>. It goes on without a day, so you can
            place it when you plan.
          </p>
          <ul className="mt-5 space-y-2">
            {phase.trips.map((trip) => (
              <li key={trip.id}>
                <button
                  type="button"
                  onClick={() => void addTo(phase.place, trip.id)}
                  className="flex w-full flex-col items-start gap-1 rounded-xl border border-[var(--gold-light)] px-4 py-3 text-left transition hover:border-[var(--gold)] hover:bg-[var(--cream-deep)]"
                >
                  <span className="font-semibold text-[var(--navy)]">
                    {trip.name}
                    {trip.active && <span className="ml-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">Open now</span>}
                  </span>
                  <span className="text-xs text-stone-500">
                    {whenIsIt(trip)}
                    {trip.days > 0 && ` · ${trip.days} ${trip.days === 1 ? "day" : "days"}`}
                    {` · ${trip.stops} ${trip.stops === 1 ? "stop" : "stops"}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    ) : null;

  return {
    /** Press this. It gates on sign-in, asks which trip when there are several. */
    start,
    /** Render this somewhere in the component — the chooser, when it is open. */
    dialog,
    phase,
    close,
  };
}

/** The confirmation line, shared so it says the same thing everywhere. */
export function AddedToTrip({ tripName, className = "" }: { tripName: string; className?: string }) {
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm ${className}`}>
      <span className="text-[var(--navy)]">On {tripName}, not on a day yet.</span>
      <Link
        href="/itinerary"
        className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
      >
        Place it on a day →
      </Link>
    </span>
  );
}
