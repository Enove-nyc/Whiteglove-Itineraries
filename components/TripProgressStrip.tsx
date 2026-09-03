"use client";

import { useState, useSyncExternalStore } from "react";
import type { ItinAttachment, ItineraryDay } from "@/data/itinerary";
import { KIND_LABELS, type AttachmentKind } from "@/lib/attachments";
import { followAlong, minutesOfClock, tripProgress, type FollowStop } from "@/lib/trip-progress";
import ExperienceRatingForm from "@/components/ExperienceRatingForm";
import { rateHref } from "@/lib/experience-ratings";

/**
 * The line across the top of a trip: how long until it, then how far into it.
 *
 * The planner laid the days out and then said the same thing on the morning of
 * the flight as it did four months earlier — and the same thing again on the
 * third morning in Kraków, when the only question anybody has is "where am I
 * meant to be now". This is the part that changes with the date.
 *
 * THE CLOCK IS THE TRAVELER'S, NOT THE SERVER'S. Somebody standing in Poland
 * at one in the morning is on a different date from a server in UTC, and being
 * told it is still yesterday while they are getting into the car is exactly
 * when this has to be right. So the date and the time are read from the device
 * through the store below — which also means the server renders nothing and
 * the browser fills it in, rather than the two disagreeing at hydration.
 */

// ---- The clock, as an external store ---------------------------------
//
// A component may not ask what time it is while it renders — the answer
// changes, and React is entitled to render twice. So the clock is subscribed
// to like any other outside thing: it ticks once a minute and the snapshot is
// a plain string, which React compares by value.

const MINUTE = 60_000;
let ticking: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();
let snapshot = "";

function readClock(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  // Local, deliberately: this is where the traveler is standing.
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (!ticking) {
    snapshot = readClock();
    ticking = setInterval(() => {
      const next = readClock();
      if (next === snapshot) return;
      snapshot = next;
      for (const listener of listeners) listener();
    }, MINUTE);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && ticking) {
      clearInterval(ticking);
      ticking = null;
    }
  };
}

function getSnapshot(): string {
  if (!snapshot) snapshot = readClock();
  return snapshot;
}

/** Nothing on the server: it does not know what day it is where the traveler is. */
function getServerSnapshot(): string {
  return "";
}

/** "YYYY-MM-DDTHH:MM" on the traveler's own device, or "" before hydration. */
export function useDeviceClock(): { today: string; nowMinutes: number | null } {
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!value) return { today: "", nowMinutes: null };
  const [today, time] = value.split("T");
  return { today, nowMinutes: minutesOfClock(time) };
}

// ---- The strip -------------------------------------------------------

const cardClass = "rounded-2xl border p-4 shadow-[0_10px_30px_rgba(16, 47, 53,.06)] sm:p-6";

function Stop({ label, stop, tone }: { label: string; stop: FollowStop; tone: "now" | "next" }) {
  return (
    <div className={`min-w-0 flex-1 border-l-2 pl-3 ${tone === "now" ? "border-[var(--gold)]" : "border-[var(--gold-light)]"}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">{label}</p>
      <p className="mt-1 font-semibold leading-6 text-[var(--navy)]">{stop.name}</p>
      <p className="text-sm leading-6 text-stone-600">
        {[stop.arrivalTime && `from ${stop.arrivalTime}`, stop.departureTime && `until ${stop.departureTime}`]
          .filter(Boolean)
          .join(" ")}
        {stop.address ? `${stop.arrivalTime || stop.departureTime ? " · " : ""}${stop.address}` : ""}
      </p>
    </div>
  );
}

export default function TripProgressStrip({
  startDate,
  endDate,
  days,
  documentsToday = [],
  onGoToToday,
  tripId,
  tripTitle,
}: {
  startDate?: string;
  endDate?: string;
  /** The trip laid out, so the day you are on can be followed. */
  days: ItineraryDay[];
  /**
   * The passes and tickets needed today.
   *
   * Here rather than only on the stop they hang from, because at half past
   * five at the airport the question is "give me the pass" and not "which day
   * did I put it on". Passed in, so this component knows nothing about how a
   * file is stored or who may open it.
   */
  documentsToday?: ItinAttachment[];
  /** Scroll the day open, when today is one of the days on screen. */
  onGoToToday?: (date: string) => void;
  /** When set, a finished trip can be rated in place. */
  tripId?: string;
  tripTitle?: string;
}) {
  const { today, nowMinutes } = useDeviceClock();
  const progress = tripProgress({ startDate, endDate, today });
  const [rateOpen, setRateOpen] = useState(false);

  // Nothing to count and nothing to follow. The planner already tells somebody
  // to choose their dates; a second empty panel saying it is noise.
  if (progress.phase === "no-dates" && !progress.totalDays) return null;

  const todayDay = progress.followDate ? days.find((day) => day.date === progress.followDate) : undefined;
  const follow = todayDay
    ? followAlong({
        stops: todayDay.activities.map((activity) => ({
          id: activity.id,
          name: activity.name,
          address: activity.address,
          coordinates: activity.coordinates,
          arrivalTime: activity.arrivalTime,
          departureTime: activity.departureTime,
        })),
        nowMinutes,
      })
    : null;

  const during = progress.phase === "during";
  const tone = during
    ? "border-[var(--gold)] bg-[#FAF8F3]"
    : progress.phase === "after"
      ? "border-[var(--gold-light)] bg-[var(--surface)]"
      : "border-[var(--gold-light)] bg-[var(--surface)]";

  return (
    <section className={`${cardClass} ${tone}`} aria-label="Where this trip stands">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">
            {during ? "You are on this trip" : progress.phase === "after" ? "Been and gone" : "Counting down"}
          </p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--navy)] sm:text-4xl">
            {progress.headline}
          </p>
          {progress.detail && <p className="mt-1 text-sm leading-6 text-stone-600">{progress.detail}</p>}
        </div>

        {during && todayDay && onGoToToday && (
          <button
            type="button"
            onClick={() => onGoToToday(todayDay.date)}
            className="min-h-11 shrink-0 rounded-full border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.1em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]"
          >
            Open today
          </button>
        )}
        {progress.phase === "after" && tripId && !rateOpen && (
          <button
            type="button"
            onClick={() => setRateOpen(true)}
            className="min-h-11 shrink-0 rounded-full border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.1em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]"
          >
            Rate White Glove
          </button>
        )}
        {progress.phase === "after" && !tripId && (
          <a
            href={rateHref({ kind: "trip", ref: "finished", label: tripTitle?.trim() || "Your trip" })}
            className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.1em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]"
          >
            Rate White Glove
          </a>
        )}
      </div>

      {progress.phase === "after" && rateOpen && tripId && (
        <ExperienceRatingForm
          kind="trip"
          refId={tripId}
          label={tripTitle?.trim() || "Your trip"}
          compact
        />
      )}

      {/* A bar only while the trip is on. Before it, there is no progress to
          draw; after it, there is nothing left to say. */}
      {during && progress.dayNumber && (
        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--gold-light)]">
            <div
              className="h-full rounded-full bg-[var(--gold)]"
              style={{ width: `${Math.round((progress.dayNumber / progress.totalDays) * 100)}%` }}
            />
          </div>
          <p className="sr-only">
            Day {progress.dayNumber} of {progress.totalDays}.
          </p>
        </div>
      )}

      {during && follow && (
        <div className="mt-5 border-t border-[var(--gold-light)] pt-4">
          <p className="font-semibold leading-7 text-[var(--navy)]">{follow.says}</p>

          {(follow.now || follow.next) && (
            <div className="mt-3 flex flex-col gap-4 sm:flex-row">
              {follow.now && <Stop label="Now" stop={follow.now} tone="now" />}
              {follow.next && <Stop label={follow.now ? "After that" : "Next"} stop={follow.next} tone="next" />}
            </div>
          )}

          {follow.timedCount > 0 && (
            <p className="mt-3 text-sm text-stone-600">
              {follow.doneCount} of {follow.timedCount} done today.
            </p>
          )}

          {/* Said, never placed on the clock. The planner could not work a time
              out for these, and inventing one would send somebody to a kever
              the plan never said they would be at. */}
          {follow.untimed.length > 0 && (
            <p className="mt-2 text-sm leading-6 text-stone-500">
              Also today, with no time worked out: {follow.untimed.map((stop) => stop.name).join(", ")}.
            </p>
          )}

          {todayDay?.lodging && (
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Tonight: {todayDay.lodging.name}
              {todayDay.lodging.address ? ` — ${todayDay.lodging.address}` : ""}.
            </p>
          )}

          {/* One tap from the top of the page on the morning it is needed. */}
          {documentsToday.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">On your phone today</span>
              {documentsToday.map((document) => (
                <a
                  key={document.id}
                  href={`/api/account/attachments?id=${encodeURIComponent(document.id)}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex min-h-11 items-center rounded-full border border-[var(--gold)] bg-white px-3.5 text-xs font-bold text-[var(--navy)] transition hover:bg-[var(--cream-deep)]"
                >
                  <span aria-hidden="true" className="mr-1.5">📎</span>
                  {KIND_LABELS[document.kind as AttachmentKind]?.label ?? "File"}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
