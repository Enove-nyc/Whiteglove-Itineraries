"use client";

import DateField from "@/components/DateField";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRequireSignIn } from "@/components/SignInGate";
import { directionsUrl, movePlace, optimizeRoute, type SavedPlace } from "@/data/route-utils";
import { type Crossing, describeCrossing } from "@/lib/border-crossings";
import { borderCrossings } from "@/lib/borders";
import { shabbosWarning } from "@/lib/shabbos";

type AccountSnapshot = {
  email: string;
  route: SavedPlace[];
  favorites: SavedPlace[];
};

const routeKey = "whiteGloveMyRoute";
const favoritesKey = "whiteGloveFavorites";
const read = (key: string) => {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]") as SavedPlace[];
  } catch {
    return [];
  }
};

export default function MyRouteDashboard({
  crossings: known = [],
  today = "",
}: {
  /** Which crossings are on each border, and what has been checked on them. */
  crossings?: Crossing[];
  /** Read on the server, so nothing asks what day it is mid-render. */
  today?: string;
}) {
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const [route, setRoute] = useState<SavedPlace[]>([]);
  const [, setFavorites] = useState<SavedPlace[]>([]);
  const requireSignIn = useRequireSignIn();

  useEffect(() => {
    const syncLocal = () => {
      setRoute(read(routeKey));
      setFavorites(read(favoritesKey));
    };

    const syncRemote = async () => {
      const response = await fetch("/api/account/me", { cache: "no-store" });
      const data = await response.json().catch(() => null) as { account?: { email?: string }; data?: { route?: SavedPlace[]; favorites?: SavedPlace[] } | null } | null;
      if (data?.account?.email && data.data) {
        setAccount({
          email: data.account.email,
          route: data.data.route ?? [],
          favorites: data.data.favorites ?? [],
        });
      }
    };

    syncLocal();
    syncRemote().catch(() => undefined);
    window.addEventListener("whiteglove-route", syncLocal);
    return () => window.removeEventListener("whiteglove-route", syncLocal);
  }, []);

  const activeRoute = account?.route ?? route;
  const optimized = optimizeRoute(activeRoute);
  // Worked out on the order that will actually be driven, not the order they
  // happened to be saved in.
  const crossings = borderCrossings(optimized, today ? { crossings: known, today } : undefined);
  const shabbos = optimized
    .map((place) => (place.plannedDate ? shabbosWarning(place.plannedDate, undefined, place.coordinates, place.name) : null))
    .filter((warning): warning is NonNullable<typeof warning> => warning !== null);
  const openDirections = () => {
    const url = directionsUrl(optimized);
    if (url) window.open(url, "_blank", "noreferrer");
  };

  const save = (next: SavedPlace[]) => {
    requireSignIn(() => {
      localStorage.setItem(routeKey, JSON.stringify(next));
      window.dispatchEvent(new Event("whiteglove-route"));
      void fetch("/api/account/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: "route", action: "replace", items: next }),
      });
    }, "Sign in to save");
  };

  const remove = (id: string) => save(activeRoute.filter((place) => place.id !== id));

  const setPlannedDate = (id: string, plannedDate: string) =>
    save(activeRoute.map((place) => (place.id === id ? { ...place, plannedDate } : place)));

  /**
   * Moving a stop by hand.
   *
   * Buttons rather than dragging. Dragging is nice with a mouse and unusable
   * with a keyboard or a screen reader, and this is a list somebody reorders
   * standing in an airport on a phone. The order it moves within is the
   * optimised one on screen, which is the order they are actually looking at.
   */
  const move = (id: string, direction: -1 | 1) => save(movePlace(optimized, id, direction));

  return (
    <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
      <h1 className="font-[family-name:var(--font-display)] text-5xl leading-tight text-[var(--navy)] sm:text-6xl">My Route</h1>

      {activeRoute.length === 0 ? (
        <div className="wg-card mt-12 border border-[var(--gold-light)] bg-[#FAF8F3] p-6 sm:p-8">
          {/* "No stops" over a button marked "Add" told somebody who had just
              arrived neither what a route is nor what it is for. Two lines and
              the same one button. */}
          <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Your route is empty.</p>
          <p className="mt-2 max-w-xl leading-7 text-stone-600">
            A route is the order you drive them in — add the towns, kevarim and places you want to reach and it works
            out the driving between them. Use <span className="font-semibold text-[var(--navy)]">Add to Route</span> on
            any of them.
          </p>
          <Link href="/stops" className="mt-6 inline-block bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] text-white">Browse towns and kevarim</Link>
        </div>
      ) : (
        <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_.6fr]">
          <div className="wg-card border border-[var(--gold-light)] bg-[#FAF8F3] p-6 sm:p-9">
            <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Saved places</h2>
            <ol className="mt-7 space-y-4">
              {optimized.map((place, index) => (
                <li key={place.id} className="flex items-start gap-4 border-t border-[var(--gold-light)] pt-4 first:border-t-0 first:pt-0">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--navy)] text-xs font-bold text-white">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{place.name}{place.yiddishName && <span className="ml-2 text-lg text-stone-500">{place.yiddishName}</span>}</p>
                    <p className="mt-1 text-sm leading-6 text-stone-600">{place.address}</p>
                    <label className="mt-3 flex max-w-xs items-center gap-3 text-xs font-bold uppercase tracking-[0.1em] text-[var(--gold-ink)]">Fixed date<DateField value={place.plannedDate ?? ""} onChange={(v) => setPlannedDate(place.id, v)} className="border border-[var(--gold-light)] bg-white px-2 py-1 text-sm font-normal tracking-normal text-[var(--navy)]" ariaLabel="Fixed date" /></label>
                    {place.anchor && (
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--navy)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)]">
                        <span aria-hidden="true">⚓</span>
                        {place.anchor === "start" ? "Route starts here" : "Route ends here"}
                      </p>
                    )}
                    {place.plannedDate && <p className="mt-2 text-xs font-semibold text-[var(--navy)]">This stop is held in place for {place.plannedDate}.</p>}
                    {(() => {
                      const warning = place.plannedDate ? shabbosWarning(place.plannedDate, undefined, place.coordinates, "This stop") : null;
                      return warning ? (
                        <p className="mt-2 rounded-md border-l-4 border-[var(--gold)] bg-[var(--cream)] px-3 py-2 text-xs leading-5 text-[var(--navy)]">
                          <strong>Shabbos:</strong> {warning.message}
                        </p>
                      ) : null;
                    })()}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => move(place.id, -1)}
                        disabled={index === 0 || Boolean(place.anchor) || Boolean(optimized[index - 1]?.anchor)}
                        aria-label={`Move ${place.name} earlier`}
                        className="flex h-11 w-11 items-center justify-center rounded-md border border-[var(--gold-light)] text-[var(--navy)] transition hover:border-[var(--gold)] hover:bg-[var(--cream-deep)] disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(place.id, 1)}
                        disabled={index === optimized.length - 1 || Boolean(place.anchor) || Boolean(optimized[index + 1]?.anchor)}
                        aria-label={`Move ${place.name} later`}
                        className="flex h-11 w-11 items-center justify-center rounded-md border border-[var(--gold-light)] text-[var(--navy)] transition hover:border-[var(--gold)] hover:bg-[var(--cream-deep)] disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        ↓
                      </button>
                    </div>
                    <button onClick={() => remove(place.id)} className="inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-[0.1em] text-stone-500 hover:text-[var(--navy)]">Remove</button>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <aside className="border border-[var(--gold-light)] bg-[var(--cream-deep)] p-7">
            <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Optimize the flexible stops.</h2>
            <p className="mt-4 leading-7 text-stone-600">Stops with a fixed date stay in place; the rest are ordered by distance.</p>
            <button type="button" disabled={activeRoute.length < 2} onClick={openDirections} className="mt-7 w-full bg-[var(--navy)] px-5 py-4 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--gold)] disabled:cursor-not-allowed disabled:opacity-50">Open optimized route in maps</button>
            <Link href="/itinerary" className="mt-3 block w-full border border-[var(--gold)] px-5 py-4 text-center text-xs font-bold uppercase tracking-[0.14em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white">Build a full day-by-day itinerary →</Link>

            {/* The two things a driving time does not tell you: the queue at
                the border, and the deadline that cannot move. */}
            {(crossings.length > 0 || shabbos.length > 0) && (
              <div className="mt-7 border-t border-[var(--gold)] pt-6">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Before you fix these dates</p>
                <ul className="mt-3 space-y-3">
                  {crossings.map((crossing) => (
                    <li key={`${crossing.fromPlace}-${crossing.toPlace}`} className="text-sm leading-6 text-stone-700">
                      <span aria-hidden="true">{crossing.major ? "⚠" : "•"}</span>{" "}
                      <strong className="text-[var(--navy)]">{crossing.from} → {crossing.to}.</strong>{" "}
                      {crossing.message.replace(/^Border crossing between [^.]+\. /, "")}
                      {/* Which crossings are actually on this border, and what
                          was found at them the last time anybody looked. The
                          sentence above never depends on this — a border takes
                          hours whether or not somebody checked this week. */}
                      {crossing.advice?.latest && (
                        <span className="mt-1 block font-semibold text-[var(--navy)]">{crossing.advice.latest}</span>
                      )}
                      {crossing.advice && crossing.advice.crossings.length > 0 && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-[var(--gold-ink)]">
                            {crossing.advice.crossings.length} crossing{crossing.advice.crossings.length === 1 ? "" : "s"} on this border
                          </summary>
                          <ul className="mt-2 space-y-2 border-l border-[var(--gold-light)] pl-3">
                            {crossing.advice.crossings.map((point) => (
                              <li key={point.id}>
                                <span className="font-semibold text-[var(--navy)]">{point.name}</span>{" "}
                                <span className="text-stone-600">{describeCrossing(point, today)}</span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </li>
                  ))}
                  {shabbos.map((warning) => (
                    <li key={warning.message} className="text-sm leading-6 text-stone-700">
                      <span aria-hidden="true">⚠</span> <strong className="text-[var(--navy)]">Shabbos.</strong> {warning.message}
                      {warning.candleLighting && " Check the town's own time before you rely on it."}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      )}

    </section>
  );
}
