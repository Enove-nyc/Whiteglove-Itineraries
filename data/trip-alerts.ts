// Live travel information — a flight's real status, and the trip alerts that
// come out of a meaningful change in it. Pure data model + pure transforms,
// the same discipline every other data/*.ts file here keeps.
//
// DO NOT FLOOD CHANGES WITH INSIGNIFICANT UPDATES. alertsFromStatusChange
// below is the one place that decides what counts as worth telling somebody
// about — a flight going from "scheduled" to "on-time" is not news; a 30+
// minute delay, a cancellation, or an actual gate/terminal change is.

export type FlightStatusValue = "scheduled" | "on-time" | "delayed" | "cancelled" | "diverted" | "departed" | "landed" | "unknown";

/** What was last read from the flight-status provider for one flight. */
export type FlightStatusSnapshot = {
  flightId: string;
  status: FlightStatusValue;
  departureGate?: string;
  departureTerminal?: string;
  arrivalGate?: string;
  arrivalTerminal?: string;
  /** Minutes late against the scheduled departure; absent/0 means on time. */
  delayMinutes?: number;
  checkedAt: string; // ISO timestamp
};

export type TripAlertKind =
  | "flight_delay"
  | "flight_cancelled"
  | "flight_diverted"
  | "gate_change"
  | "terminal_change"
  /** The advisor changed the plan itself — a flight, a stay, a day. Not a
   *  live-status reading like the others; see data/trip-changes.ts. */
  | "itinerary_update"
  /** Something the advisor sent the traveler by hand — "your driver is running
   *  twenty minutes late" — that no data feed would ever produce on its own. */
  | "advisor_alert";

export type TripAlert = {
  id: string;
  kind: TripAlertKind;
  /** The flight a live-status alert is about. Absent on itinerary_update,
   *  which is about the plan rather than any one flight. */
  flightId?: string;
  title: string;
  note: string;
  createdAt: string; // ISO timestamp
  acknowledged: boolean;
};

/** Below this, a delay is not worth an alert — see the file note above. */
const SIGNIFICANT_DELAY_MINUTES = 30;

const RECHECK_RELAXED_MS = 3 * 60 * 60 * 1000;
const RECHECK_IMMINENT_MS = 20 * 60 * 1000;
/** Within a day of departure, a flight earns the tighter cadence. */
const IMMINENT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * How long to leave a flight's status alone before reading it again, given how
 * close it is to departure. A flight leaving within a day is worth a fresh look
 * every twenty minutes — that is the window an airline actually moves a gate or
 * calls a delay in. One still days out does not need more than a few times a
 * day, which keeps the paid status lookups down to what matters. `flightDate`
 * is a YYYY-MM-DD departure date; `now` is epoch ms.
 */
export function flightRecheckMs(flightDate: string, now: number): number {
  const depart = Date.parse(`${flightDate}T00:00:00Z`);
  if (Number.isNaN(depart)) return RECHECK_RELAXED_MS;
  return depart - now <= IMMINENT_WINDOW_MS ? RECHECK_IMMINENT_MS : RECHECK_RELAXED_MS;
}

/**
 * What changed between two readings of the same flight's status, worth
 * telling somebody about. Returns an empty array for "nothing significant
 * changed" — a same-status recheck, or a delay under the threshold, is not
 * silently upgraded into an alert just because it is now known.
 */
export function alertsFromStatusChange(
  flightLabel: string,
  previous: FlightStatusSnapshot | undefined,
  next: FlightStatusSnapshot,
  idFor: () => string,
): TripAlert[] {
  const out: TripAlert[] = [];
  const now = next.checkedAt;

  if (next.status === "cancelled" && previous?.status !== "cancelled") {
    out.push({ id: idFor(), kind: "flight_cancelled", flightId: next.flightId, title: `${flightLabel} cancelled`, note: "The airline has cancelled this flight.", createdAt: now, acknowledged: false });
  } else if (next.status === "diverted" && previous?.status !== "diverted") {
    out.push({ id: idFor(), kind: "flight_diverted", flightId: next.flightId, title: `${flightLabel} diverted`, note: "This flight has been diverted from its original destination.", createdAt: now, acknowledged: false });
  } else if ((next.delayMinutes ?? 0) >= SIGNIFICANT_DELAY_MINUTES && (next.delayMinutes ?? 0) !== (previous?.delayMinutes ?? 0)) {
    out.push({
      id: idFor(),
      kind: "flight_delay",
      flightId: next.flightId,
      title: `${flightLabel} delayed`,
      note: `Now running about ${next.delayMinutes} minutes late.`,
      createdAt: now,
      acknowledged: false,
    });
  }

  if (next.departureGate && previous?.departureGate && next.departureGate !== previous.departureGate) {
    out.push({ id: idFor(), kind: "gate_change", flightId: next.flightId, title: `${flightLabel} gate changed`, note: `Now departing from gate ${next.departureGate}.`, createdAt: now, acknowledged: false });
  }
  if (next.departureTerminal && previous?.departureTerminal && next.departureTerminal !== previous.departureTerminal) {
    out.push({ id: idFor(), kind: "terminal_change", flightId: next.flightId, title: `${flightLabel} terminal changed`, note: `Now departing from terminal ${next.departureTerminal}.`, createdAt: now, acknowledged: false });
  }

  return out;
}
