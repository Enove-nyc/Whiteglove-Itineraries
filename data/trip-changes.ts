// Turning an edit to the plan into something worth telling a traveler.
//
// The Changes screen already carries live flight-status alerts
// (data/trip-alerts.ts). This is the other half: when the plan ITSELF moves —
// a flight added, a hotel swapped, a day's stop retimed — the person the trip
// was shared with should see that too, not only an airline's delay.
//
// Pure data in, plain sentences out. No store, no clock, no ids minted here —
// the caller (lib/account-store.ts) owns when this runs and what it does with
// the result. Same discipline as every other data/*.ts file.
//
// DELIBERATELY COARSE. It reports THAT a flight or a stay or a day changed,
// not every field within it — a traveler wants "your Tuesday dinner moved",
// not a field-by-field diff, and the app shows the new plan in full anyway.
// It also ignores the bookkeeping a traveler never sees: road times, day
// progress, attachments, coordinates, free-text notes.

import type { Itinerary, ItinActivity, ItinFlight, ItinLodging } from "@/data/itinerary";
import { flightRouteLabel } from "@/data/itinerary";

export type ItineraryChange = { title: string; note: string };

/** "abc" → keyed lookup, tolerant of a missing list. */
function byId<T extends { id: string }>(rows: T[] | undefined): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows ?? []) if (row?.id) map.set(row.id, row);
  return map;
}

function flightChanged(a: ItinFlight, b: ItinFlight): boolean {
  return (
    a.from !== b.from ||
    a.to !== b.to ||
    a.date !== b.date ||
    // Optional fields normalized to "" so an undefined→"" flip from re-saved
    // form state does not read as a real change and record a phantom alert.
    (a.departTime ?? "") !== (b.departTime ?? "") ||
    (a.arriveTime ?? "") !== (b.arriveTime ?? "") ||
    (a.arriveDate ?? "") !== (b.arriveDate ?? "") ||
    (a.flightNo ?? "") !== (b.flightNo ?? "") ||
    (a.airline ?? "") !== (b.airline ?? "")
  );
}

function lodgingChanged(a: ItinLodging, b: ItinLodging): boolean {
  return (
    a.name !== b.name ||
    a.checkIn !== b.checkIn ||
    a.checkOut !== b.checkOut ||
    (a.address ?? "") !== (b.address ?? "")
  );
}

/** A stop moved if its name, day or start time changed — not a reorder within
 *  the same day, which is not worth a notification. */
function activityMoved(a: ItinActivity, b: ItinActivity): boolean {
  return a.name !== b.name || a.date !== b.date || (a.startTime ?? "") !== (b.startTime ?? "");
}

/** Compare each keyed list and push a phrase for every added / removed /
 *  changed row, using `label` for the human name of a row. */
function diffList<T extends { id: string }>(
  prev: T[] | undefined,
  next: T[] | undefined,
  changed: (a: T, b: T) => boolean,
  label: (row: T) => string,
  noun: string,
  out: string[],
): void {
  const before = byId(prev);
  const after = byId(next);
  for (const [id, row] of after) {
    const was = before.get(id);
    if (!was) out.push(`${label(row)} added`);
    else if (changed(was, row)) out.push(`${label(row)} updated`);
  }
  for (const [id, row] of before) {
    if (!after.has(id)) out.push(`${label(row)} removed`);
  }
  void noun;
}

function flightLabel(f: ItinFlight): string {
  const route = flightRouteLabel(f) || "Flight";
  return `Flight ${route}`;
}

function upperFirst(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * What changed between two versions of the same trip, as a traveler would
 * read it. Returns null when nothing traveler-facing changed (a save that only
 * touched road times, notes, attachments or the like), so the caller can stay
 * silent rather than announce a non-change.
 *
 * `prev` undefined means there is no earlier version to compare against — the
 * very first save of a trip — and is deliberately silent: a trip appearing is
 * not a change to it.
 */
export function summarizeItineraryChange(
  prev: Itinerary | undefined,
  next: Itinerary,
): ItineraryChange | null {
  if (!prev) return null;

  const phrases: string[] = [];
  diffList(prev.flights, next.flights, flightChanged, flightLabel, "flight", phrases);
  diffList(prev.lodging, next.lodging, lodgingChanged, (l) => l.name?.trim() || "A place to stay", "stay", phrases);
  diffList(prev.activities, next.activities, activityMoved, (a) => a.name?.trim() || "A stop", "stop", phrases);

  if (prev.startDate !== next.startDate || prev.endDate !== next.endDate) {
    phrases.push("Trip dates changed");
  }

  if (phrases.length === 0) return null;

  const note =
    phrases.length === 1
      ? `${upperFirst(phrases[0])}.`
      : phrases.length <= 3
        ? `${phrases.map(upperFirst).join("; ")}.`
        : `${phrases.slice(0, 3).map(upperFirst).join("; ")}; and ${phrases.length - 3} more.`;

  return { title: "Trip updated", note };
}
