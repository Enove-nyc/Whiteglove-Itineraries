// Itinerary model + pure planning helpers (shared by the builder, the print
// view, and the account store). No DB or browser APIs here.

import { AIRPORTS } from "@/data/airports";
import { bandFor, BUILT_IN_ASSUMPTIONS, clockToMins, type PlannerAssumptions, usableDayHours } from "@/data/planner-assumptions";
import { coordinatesToPoint } from "@/data/route-utils";

/**
 * What an itinerary holds about a file, which is deliberately not the file.
 *
 * Structural rather than imported from lib/, the same as everything else here
 * — this file is the day-by-day arithmetic and holds no knowledge of stores,
 * uploads or who may read what.
 */
export type ItinAttachment = {
  id: string;
  kind: string;
  name: string;
  contentType: string;
  bytes: number;
  addedAt: string;
  note?: string;
  /**
   * Whether the traveler this trip was sent to may open it.
   *
   * ABSENT MEANS NO, and every file uploaded before this existed is therefore
   * private, which is the only safe way round: a flag that defaulted to shared
   * would have published a folder of documents nobody chose to publish.
   *
   * The adviser turns it on per file, one at a time. A boarding pass is for
   * the person boarding; a supplier invoice with the commission on it is not,
   * and both live in the same list. See lib/attachments.ts.
   */
  shared?: boolean;
};

export type LodgingType = "hotel" | "overnight-transit" | "other";

export type ItinLodging = {
  id: string;
  type: LodgingType;
  name: string;
  address?: string;
  coordinates?: string;
  phone?: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD (for overnight-transit, the morning after)
  notes?: string;
  bookedOnSite?: boolean;
  /**
   * The booking reference the hotel or airline gave them.
   *
   * Kept because it is the one thing a traveler standing at a desk actually
   * needs to read out, and the confirmation email it came in is the hardest
   * thing to find on a phone with one bar of signal.
   */
  confirmation?: string;
  /**
   * Boarding passes, tickets, booking confirmations.
   *
   * A reference only — a name, a size and an id. The file itself is kept
   * against the account that uploaded it (lib/attachment-store.ts) and served
   * only to them, because an itinerary is saved, shared and printed as
   * ordinary JSON and a pass baked into it would travel everywhere the trip
   * travels. Stripped entirely from anything that leaves the account; see
   * withoutAttachments in lib/attachments.ts.
   */
  attachments?: ItinAttachment[];
};

/**
 * A place the plane touches down on the way, without the journey being over.
 *
 * A connection is one journey, not two flights. Entering it as two made the
 * planner think the traveler had landed and had a day in the connecting city,
 * and on a red-eye it put a night in the wrong place entirely.
 */
export type FlightStop = {
  /** The connecting airport, e.g. "WAW" or "Warsaw (WAW)". */
  airport: string;
  arriveTime?: string; // HH:MM — when this leg lands
  departTime?: string; // HH:MM — when the onward leg leaves
  /** True when the onward leg leaves the following day. */
  overnight?: boolean;
  notes?: string; // terminal change, long layover, visa needed to leave airside
  /**
   * Set only when this connection was read from a SECOND flight the traveler
   * entered — the id of that flight, so the planner can offer to edit the leg
   * that continues the journey rather than only the one that started it.
   */
  legId?: string;
};

export type ItinFlight = {
  id: string;
  airline?: string;
  flightNo?: string;
  /** Where the journey starts. Not a connecting airport — see `stops`. */
  from: string;
  /** Where the journey ends. */
  to: string;
  date: string; // YYYY-MM-DD (departure date)
  departTime?: string; // HH:MM
  arriveTime?: string; // HH:MM — arrival at the FINAL destination
  arriveDate?: string; // YYYY-MM-DD if it lands the next day (red-eye)
  /** Connections along the way, in order. */
  stops?: FlightStop[];
  notes?: string;
  bookedOnSite?: boolean;
  /** The airline's booking reference. See ItinLodging.confirmation. */
  confirmation?: string;
  /**
   * Boarding passes, tickets, booking confirmations.
   *
   * A reference only — a name, a size and an id. The file itself is kept
   * against the account that uploaded it (lib/attachment-store.ts) and served
   * only to them, because an itinerary is saved, shared and printed as
   * ordinary JSON and a pass baked into it would travel everywhere the trip
   * travels. Stripped entirely from anything that leaves the account; see
   * withoutAttachments in lib/attachments.ts.
   */
  attachments?: ItinAttachment[];
};

/** "JFK → WAW → KRK" — the whole journey, connections included. */
export function flightRouteLabel(flight: ItinFlight): string {
  return [flight.from, ...(flight.stops ?? []).map((s) => s.airport), flight.to].filter(Boolean).join(" → ");
}

/** How long the traveler is on the ground at a connection, in minutes. */
export function layoverMinutes(stop: FlightStop): number | null {
  const inn = timeToMins(stop.arriveTime);
  const out = timeToMins(stop.departTime);
  if (inn === null || out === null) return null;
  const raw = out - inn;
  // A connection that departs at or before it arrives ran past midnight.
  return raw > 0 ? raw : raw + 24 * 60;
}

/** True when any part of the journey is spent airside overnight. */
export function hasOvernightLayover(flight: ItinFlight): boolean {
  return (flight.stops ?? []).some((s) => s.overnight || (layoverMinutes(s) ?? 0) >= 8 * 60);
}

export type ItinActivity = {
  id: string;
  name: string;
  yiddishName?: string;
  address?: string;
  coordinates?: string;
  /** YYYY-MM-DD. Empty means "not scheduled yet" — the planner will place it. */
  date: string;
  startTime?: string; // HH:MM
  durationMins?: number;
  /** Position within the day. Lower comes first; set by reordering or planning. */
  order?: number;
  href?: string; // link (our kever page, a booking page, a map…)
  phone?: string; // contact number for this stop
  keverSlug?: string; // set when picked from our kever directory
  /** Country this stop is in, when we know it. Used to flag border crossings. */
  country?: string;
  notes?: string;
  bookedOnSite?: boolean;
  /**
   * Boarding passes, tickets, booking confirmations.
   *
   * A reference only — a name, a size and an id. The file itself is kept
   * against the account that uploaded it (lib/attachment-store.ts) and served
   * only to them, because an itinerary is saved, shared and printed as
   * ordinary JSON and a pass baked into it would travel everywhere the trip
   * travels. Stripped entirely from anything that leaves the account; see
   * withoutAttachments in lib/attachments.ts.
   */
  attachments?: ItinAttachment[];
};

/**
 * Someone travelling on this trip.
 *
 * Not the same thing as sharing the itinerary. A collaborator is another
 * account that can open and edit the plan; a traveler is a person who is
 * actually going — a child, a parent, a spouse — who may well have no account
 * at all. A family trip needs the second without needing the first.
 */
export type ItinTraveler = {
  id: string;
  name: string;
  kind?: "adult" | "child" | "infant";
  /** Passport notes, seat preference, dietary needs — whatever matters. */
  notes?: string;
  /** A contact for this one person — where their own app link, if any, is sent. */
  email?: string;
  phone?: string;
  /**
   * Whether the planner has given this person their OWN door into the trip
   * app — a link scoped to them, not the one shared trip-wide link every
   * traveler on a family or group trip would otherwise be handed alike.
   * Absent/false is the normal case: most trips still use the one link.
   * The token itself lives server-side (lib/account-store.ts), the same way
   * a trip's own share token does — never here, since this record travels
   * with the itinerary and a token baked into it would leak wherever a copy
   * of the trip goes.
   */
  hasOwnAccess?: boolean;
  /**
   * Free text — "Smith family", "Cohen group" — travelers sharing this exact
   * text (trimmed, case-insensitive) are one unit for privacy and, on a trip
   * with a payment balance, for splitting it. Blank means this traveler is
   * their own unit; see travelerUnitKey/unitMates below. Not a separate list
   * of units to manage — a unit is just whatever the planner typed, matched.
   */
  family?: string;
};

/** Re-exported shape; the rules live in lib/day-progress.ts. */
export type DayAdjustment = {
  stopId: string;
  deltaMins: number;
  at: string;
  kind: "done" | "longer";
};

export type Itinerary = {
  title: string;
  /** Superseded by `travelers`; kept so older saved trips still read. */
  travelerName?: string;
  travelers?: ItinTraveler[];
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  flights: ItinFlight[];
  lodging: ItinLodging[];
  activities: ItinActivity[];
  /**
   * Real road driving minutes per leg, keyed "fromCoords>toCoords", filled in
   * from the routing service. Used instead of the straight-line estimate.
   */
  roadTimes?: Record<string, number>;
  /**
   * Which engine produced each road time. "google" is a traffic-aware Google
   * Routes answer — the number Google Maps itself would give. "osrm" is the
   * open router, which assumes empty roads and so runs optimistic. Kept so the
   * planner can label the two differently instead of passing an estimate off
   * as a Maps time.
   */
  roadTimeSources?: Record<string, "google" | "osrm">;
  /**
   * What actually happened on the day, against what was planned — a fast
   * border, a kever that took longer. See lib/day-progress.ts.
   *
   * On the itinerary rather than in a store of its own because it belongs to
   * the trip and travels with it: a shared trip should show the group where
   * the day stands, and a trip put on another device should not forget that
   * this morning's border took twenty minutes.
   */
  adjustments?: DayAdjustment[];
  /**
   * Whether the person planning is going themselves.
   *
   * Asked once, because it decides something concrete: if they are going, they
   * belong on the traveler list and in the head count for rooms and seats, and
   * making them type their own name is asking a question we know the answer to.
   * Somebody arranging for a friend should not be added at all.
   *
   * Absent on trips saved before it was asked, which reads as "not yet asked".
   */
  bookingFor?: "self" | "someone-else";
  /** When the traveler gets going each morning, HH:MM. Drives arrival times. */
  dayStartTime?: string;
  /**
   * Whether each day carries its zmanim.
   *
   * On the itinerary rather than in the browser, for the same reason the day's
   * adjustments are: it belongs to the trip. Somebody who turned the times on
   * while planning wants them on the phone they are actually travelling with,
   * and everyone sharing a trip is keeping the same Shabbos.
   *
   * Absent on trips saved before it was offered, which reads as off.
   */
  showZmanim?: boolean;
  /**
   * Who shares which room — family / group planning only.
   *
   * Optional on older trips. See lib/trip-collaboration.ts.
   */
  rooms?: Array<{ id: string; label: string; travelerIds: string[] }>;
  notes?: string;
  /**
   * A practical note for one day of the trip, keyed by that day's date —
   * "enter through the side door", where to eat, where to park. The
   * White Glove app's Guide tab (components/companion/CompanionApp.tsx),
   * written by the advisor and read by the traveler. Kosher/Shabbos content is
   * a separate, account-level opt-in layer folded into the same Guide section
   * — see lib/app-prefs-store.ts and lib/companion-trip.ts — not part of this.
   */
  guideNotes?: Record<string, string>;
  updatedAt?: string;
};

/** Key for one leg of travel — matches lib/road-times.ts. */
export function travelLegKey(from?: string, to?: string): string {
  return `${(from ?? "").trim()}>${(to ?? "").trim()}`;
}

export function emptyItinerary(): Itinerary {
  return { title: "My trip", travelerName: "", travelers: [], startDate: "", endDate: "", flights: [], lodging: [], activities: [], notes: "" };
}

// ---- Travelers -------------------------------------------------------

/**
 * The people on this trip. Trips saved before the planner could hold more than
 * one name kept a single `travelerName`; that is read as the first traveler so
 * nobody's existing itinerary loses the name they typed.
 */
export function travelersOf(itin: Itinerary): ItinTraveler[] {
  if (itin.travelers?.length) return itin.travelers;
  const legacy = itin.travelerName?.trim();
  return legacy ? [{ id: "legacy-traveler", name: legacy, kind: "adult" }] : [];
}

export function travelerCount(itin: Itinerary): number {
  return travelersOf(itin).length;
}

/** "Sarah, Dovid and 2 children" — for the header and the printed itinerary. */
export function travelerSummary(itin: Itinerary): string {
  const people = travelersOf(itin);
  if (!people.length) return "";
  const adults = people.filter((p) => (p.kind ?? "adult") === "adult");
  const children = people.filter((p) => p.kind === "child");
  const infants = people.filter((p) => p.kind === "infant");
  const names = adults.map((p) => p.name).filter(Boolean);
  const parts: string[] = [];
  if (names.length === 1) parts.push(names[0]);
  else if (names.length > 1) parts.push(`${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
  if (children.length) parts.push(`${children.length} ${children.length === 1 ? "child" : "children"}`);
  if (infants.length) parts.push(`${infants.length} ${infants.length === 1 ? "infant" : "infants"}`);
  return parts.join(", ");
}

/**
 * This traveler's unit key — everyone sharing the same trimmed, lowercased
 * `family` text is one unit; a traveler with none is their own, solo unit.
 * Used for both privacy (unitMates/redactForTraveler below) and, on a trip
 * with a payment balance, for splitting it per family rather than per head.
 */
export function travelerUnitKey(t: ItinTraveler): string {
  const family = t.family?.trim().toLowerCase();
  return family ? `family:${family}` : `solo:${t.id}`;
}

/**
 * Every distinct unit on this trip — one entry per family, plus one per solo
 * traveler — in the order each first appears. For building a payment split or
 * a family-by-family roster; not stored anywhere, always derived fresh from
 * the travelers themselves so it can never drift out of sync with them.
 */
export function unitsOf(itin: Itinerary): Array<{ unitKey: string; label: string }> {
  const seen = new Map<string, string>();
  for (const t of travelersOf(itin)) {
    const key = travelerUnitKey(t);
    if (!seen.has(key)) seen.set(key, t.family?.trim() || t.name);
  }
  return [...seen.entries()].map(([unitKey, label]) => ({ unitKey, label }));
}

/** Every traveler sharing this one's unit, this one included. */
export function unitMates(itin: Itinerary, travelerId: string): ItinTraveler[] {
  const travelers = travelersOf(itin);
  const me = travelers.find((t) => t.id === travelerId);
  if (!me) return [];
  const key = travelerUnitKey(me);
  return travelers.filter((t) => travelerUnitKey(t) === key);
}

/**
 * This itinerary, as one traveler's own unit may see it: the shared trip
 * itself (flights, lodging, activities — one party, one schedule) stays
 * whole, but every OTHER unit's private notes, email and phone are stripped.
 * The roster still shows who else is on the trip — name and kind are not
 * secret — only what the planner wrote about them is.
 *
 * This is the one place "do not expose one traveler's private information to
 * another unless explicitly intended" is enforced: intent is reading as
 * whichever travelers the planner put in the same family/unit together.
 */
export function redactForTraveler(itin: Itinerary, viewerTravelerId: string): Itinerary {
  const mine = new Set(unitMates(itin, viewerTravelerId).map((t) => t.id));
  const travelers = (itin.travelers ?? []).map((t) =>
    mine.has(t.id) ? t : { id: t.id, name: t.name, kind: t.kind, family: t.family },
  );
  return { ...itin, travelers };
}

// ---- Date helpers (UTC-noon to dodge DST/timezone drift) --------------

function toUTC(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

export function eachDate(startDate: string, endDate: string): string[] {
  const start = toUTC(startDate);
  const end = toUTC(endDate);
  if (start === null || end === null || end < start) return [];
  const out: string[] = [];
  const dayMs = 24 * 60 * 60 * 1000;
  for (let t = start; t <= end && out.length < 400; t += dayMs) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export function formatDateLong(date: string): string {
  const t = toUTC(date);
  if (t === null) return date;
  return new Date(t).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function nextDate(date: string): string {
  const t = toUTC(date);
  if (t === null) return date;
  return new Date(t + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Straight-line distance (km) between two coordinate strings, or null.
export function kmBetween(a?: string, b?: string): number | null {
  const p = coordinatesToPoint(a);
  const q = coordinatesToPoint(b);
  if (!p || !q) return null;
  const rad = (v: number) => (v * Math.PI) / 180;
  const dLat = rad(q.lat - p.lat);
  const dLng = rad(q.lng - p.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(p.lat)) * Math.cos(rad(q.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function formatKm(km: number | null): string | null {
  if (km === null) return null;
  const miles = km * 0.621371;
  if (km < 1) return `${Math.round(km * 1000)} m · ${(miles).toFixed(1)} mi`;
  return `${Math.round(km)} km · ${Math.round(miles)} mi`;
}

// ---- Day-by-day assembly + checks ------------------------------------

export type DayActivity = ItinActivity & {
  distanceFromPrev: number | null;
  /** Travel time from the previous stop, in minutes. */
  travelMinutesFromPrev: number | null;
  /** True when the time came from real road routing, not the estimate. */
  travelIsMeasured?: boolean;
  /** Which engine produced it — see Itinerary.roadTimeSources. */
  travelSource?: "google" | "osrm";
  /** Worked-out clock time the traveler reaches this stop, HH:MM. */
  arrivalTime?: string;
  /** …and leaves it. */
  departureTime?: string;
  /** True when the schedule only works by arriving after the stated start time. */
  arrivesLate?: boolean;
};

export type ItineraryDay = {
  date: string;
  label: string;
  index: number;
  /** Journeys, not legs — a connection entered as two flights reads as one. */
  flightsDeparting: ItinJourney[];
  flightsArriving: ItinJourney[];
  lodging: ItinLodging | null; // where they sleep THIS night
  activities: DayActivity[];
  warnings: string[];
  freeHours: number | null;
  /** Estimated hours of ground travel this day (transfers + between stops). */
  travelHours: number;
  /** Of that, minutes spent at a border rather than driving. */
  borderMinutes: number;
  /** Every ground leg of the day, in order — airport/hotel transfers included. */
  travelLegs: TravelLeg[];
  /** Where the day begins — last night's hotel, or the airport you landed at. */
  startsFrom?: string;
  /** Clock time the day begins, HH:MM. */
  startTime?: string;
  /** Clock time the traveler is back at the hotel / at the airport. */
  endTime?: string;
  /** The flight the traveler spends this night on, if any. */
  overnightFlight?: ItinFlight | null;
};

// How long a day is, how long a stop takes, and how fast the driving goes are
// now in data/planner-assumptions.ts, where the owner's admin screen can change
// them. BUILT_IN_ASSUMPTIONS holds exactly the figures that used to be written
// here, so every caller that passes nothing behaves as it always did.

// Beyond this, an airport isn't a ground transfer for the day — it's the other
// end of a flight (guards against "driving" from Krakow to JFK).
const MAX_AIRPORT_TRANSFER_KM = 300;

/**
 * The last-resort travel figure, used only when routing could not be reached.
 *
 * Roads are never straight, so scale the straight-line distance up, then apply
 * a speed that reflects the leg (short hops are slow town driving; long legs
 * run closer to highway speed), plus a fixed allowance for parking and getting
 * going.
 *
 * The built-in speeds are deliberately on the cautious side. An estimate that
 * runs slightly long costs a traveler nothing; one that runs short hands them
 * free hours that do not exist and a kever they arrive at after it has closed.
 * Every number derived from this is shown with a "≈" and never called a Maps
 * time.
 */
export function estimateTravelMinutes(
  straightLineKm: number | null,
  assume: PlannerAssumptions = BUILT_IN_ASSUMPTIONS,
): number | null {
  if (straightLineKm === null || !Number.isFinite(straightLineKm)) return null;
  if (straightLineKm <= 0.05) return 0; // same spot
  const roadKm = straightLineKm * assume.detourFactor;
  // Town crawl, back road, cross-country road, motorway — one list, shared with
  // the admin screen, so a leg cannot be labelled with a band it is not driven at.
  const kmh = assume[bandFor(straightLineKm, assume).key];
  return Math.round((roadKm / kmh) * 60 + assume.transferMins);
}

/**
 * How long this stop takes when nobody has said.
 *
 * A beis hachaim gets its own figure, because it is the one kind of stop the
 * data can actually tell apart — `keverSlug` is set when the stop came from our
 * directory — and because it is the one whose length is least like the others.
 */
export function defaultStopMins(a: ItinActivity, assume: PlannerAssumptions = BUILT_IN_ASSUMPTIONS): number {
  return a.keverSlug ? assume.keverMins : assume.stopMins;
}

/** How long a stop takes: what the traveller typed, else the default above. */
export function stopMinutes(a: ItinActivity, assume: PlannerAssumptions = BUILT_IN_ASSUMPTIONS): number {
  return a.durationMins ?? defaultStopMins(a, assume);
}

/** "1 h 25 m" / "45 min" for a minute count. */
export function formatDuration(mins: number | null): string | null {
  if (mins === null || !Number.isFinite(mins)) return null;
  const total = Math.round(mins);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} m` : `${h} h`;
}

/** Coordinates for a flight's airport label ("New York (JFK)", "KBP", …). */
function airportCoordsFor(label?: string): string | null {
  if (!label) return null;
  const tokens = label.toUpperCase().match(/[A-Z]{3}/g) ?? [];
  for (const token of tokens) {
    const airport = AIRPORTS.find((a) => a.code === token);
    if (airport) return `${airport.lat}, ${airport.lng}`;
  }
  return null;
}

/** One leg of a day's travel — between stops, or to/from lodging or an airport. */
export type TravelLeg = {
  kind: "arrive-airport" | "from-lodging" | "stop" | "to-lodging" | "depart-airport";
  label: string;
  minutes: number;
  km: number | null;
  fromCoordinates?: string;
  toCoordinates?: string;
  /** True when the time is a real road time rather than an estimate. */
  measured?: boolean;
  /** Which engine produced it — see Itinerary.roadTimeSources. */
  source?: "google" | "osrm";
  /**
   * Time at a border on this leg, counted INSIDE `minutes` above.
   *
   * Kept separately as well as inside, because the two are different advice:
   * five hours of driving means leave early, and two hours of queue means
   * leave early AND that going at six in the morning may save one of them.
   */
  borderMinutes?: number;
  /** How the border reads — which crossing, and whether anybody checked it. */
  borderSays?: string;
};

function timeToMins(t?: string): number | null {
  const m = t && /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function minsToTime(mins: number): string {
  const wrapped = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

/**
 * The date a flight actually lands.
 *
 * `arriveDate` is optional and almost nobody fills it in, so a red-eye used to
 * be listed as arriving on the day it left. When the arrival time is at or
 * before the departure time the flight crossed midnight, and that is enough to
 * place it on the following day. A late departure with no arrival time is left
 * alone — we know the night is spent aboard, but not what day it lands, and
 * guessing a date would put the landing on the wrong page.
 */
export function flightArrivalDate(flight: ItinFlight): string {
  if (flight.arriveDate) return flight.arriveDate;
  // A connection held overnight lands the traveler on a later day even when
  // the final arrival time looks earlier in the clock than the departure.
  if (hasOvernightLayover(flight)) return nextDate(flight.date);
  const depart = timeToMins(flight.departTime);
  const arrive = timeToMins(flight.arriveTime);
  if (depart !== null && arrive !== null && arrive <= depart) return nextDate(flight.date);
  return flight.date;
}

/**
 * What the planner has worked out about a flight crossing a night.
 *
 * The rules live in flightArrivalDate() and overnightFlightFor(); this puts a
 * sentence around them. A traveler should not have to know that leaving the
 * arrival-date box empty still gets them the right day — they should be told
 * what was worked out, and be able to correct it when it is wrong.
 */
export type OvernightReading = {
  /** The date it lands, whether stated or worked out. */
  arrivalDate: string;
  /** True when the night is spent getting there. */
  overnight: boolean;
  /** False when the traveler told us outright. */
  detected: boolean;
  /** One line saying what was worked out, and why. */
  note?: string;
};

export function readOvernightFlight(flight: ItinFlight): OvernightReading {
  const arrivalDate = flightArrivalDate(flight);
  const landsLater = arrivalDate > flight.date;

  if (flight.arriveDate && flight.arriveDate > flight.date) {
    return { arrivalDate, overnight: true, detected: false, note: `You have said it lands on ${formatDateLong(arrivalDate)}.` };
  }

  const held = (flight.stops ?? []).find((s) => s.overnight || (layoverMinutes(s) ?? 0) >= 8 * 60);
  if (held) {
    const hours = layoverMinutes(held);
    const wait = hours ? ` — about ${Math.round(hours / 60)} hours` : "";
    return {
      arrivalDate,
      overnight: true,
      detected: true,
      note: `The connection in ${held.airport || "the connecting airport"} is held overnight${wait}, so this journey lands on ${formatDateLong(arrivalDate)}. No hotel is needed on the way.`,
    };
  }

  const depart = timeToMins(flight.departTime);
  const arrive = timeToMins(flight.arriveTime);

  if (depart !== null && arrive !== null && arrive <= depart) {
    return {
      arrivalDate,
      overnight: true,
      detected: true,
      note: `Lands at ${flight.arriveTime}, earlier in the day than it leaves at ${flight.departTime} — so it crosses midnight and lands on ${formatDateLong(arrivalDate)}. That night counts as slept aboard.`,
    };
  }

  // Leaving late enough that the night is spent in the air, but with no
  // landing time we cannot say which day it lands — and putting the landing on
  // the wrong page is worse than leaving it where it is.
  if (depart !== null && depart >= 21 * 60) {
    return {
      arrivalDate,
      overnight: true,
      detected: true,
      note: `Leaves at ${flight.departTime}, so the night is spent in the air. Add the landing time and the day it arrives will be worked out too.`,
    };
  }

  return { arrivalDate, overnight: landsLater, detected: landsLater };
}

/**
 * The flight that carries the traveler through the night that begins on
 * `date`, if there is one.
 *
 * A red-eye is a place to sleep. The planner used to notice this only when the
 * traveler had filled in an arrival DATE, which almost nobody does — so an
 * overnight flight still drew "No place to sleep this night". Now the arrival
 * time is enough: landing at or before the hour you left means you landed the
 * next day, and a departure late in the evening means the night is spent in
 * the air either way.
 */
export function overnightFlightFor(itin: Itinerary, date: string, journeys?: ItinJourney[]): ItinFlight | null {
  const LATE_DEPARTURE_MINS = 21 * 60; // 21:00
  // Whole journeys, not single legs: a JFK → AMS → KRK ticket entered as two
  // flights spends its night on the first leg, and the second leg leaving
  // Amsterdam in the morning is not a night in the air of its own.
  for (const flight of journeys ?? readJourneys(itin)) {
    if (flight.date !== date) continue;
    // Stated outright: it lands on a later date.
    if (flight.arriveDate && flight.arriveDate > flight.date) return flight;
    // Held at a connection overnight — the night is spent in transit.
    if (hasOvernightLayover(flight)) return flight;
    const depart = timeToMins(flight.departTime);
    const arrive = timeToMins(flight.arriveTime);
    // Lands at or before the hour it left — it crossed midnight.
    if (depart !== null && arrive !== null && arrive <= depart) return flight;
    // Leaves late enough that the night is spent aboard.
    if (depart !== null && depart >= LATE_DEPARTURE_MINS) return flight;
  }
  return null;
}

// ---- A connection entered as two flights -------------------------------
//
// Nobody books "JFK → Kraków". They book a ticket that happens to route through
// Amsterdam, and when they copy it into the planner they copy what the airline
// showed them: two flights, JFK → AMS and AMS → KRK.
//
// Read literally that is two journeys. It made the planner believe the traveler
// landed in Amsterdam, had the whole of the next day free there, and then flew
// out again at the end of it — so the day showed a free day in a city the
// traveler never leaves the airport of, and asked where they were sleeping.
//
// So the two are read back together. The tests are deliberately narrow: the
// second leg has to start from the airport the first one landed at, it has to
// leave after that landing, and the wait has to be short enough to be a
// connection rather than a visit. A booked hotel or a planned stop in the
// connecting city says plainly that it IS a visit, and then they stay apart.
//
// Nothing is rewritten. Both flights stay exactly as they were entered, and
// both stay editable — this only changes how they are read.

const CONNECTION_LIMIT_MINS = 24 * 60; // over a day on the ground is a stopover, not a connection

/**
 * One journey, and the flight records it was read from.
 *
 * It is an ItinFlight, so everything that already draws a flight draws this
 * unchanged. `legs` has more than one entry only when a connection was entered
 * as separate flights.
 */
export type ItinJourney = ItinFlight & { legs: ItinFlight[] };

/**
 * The airport a label names, as one comparable key.
 *
 * The picker writes "Amsterdam (AMS)", the flight lookup writes "AMS", and
 * somebody typing fast writes "Amsterdam". Those are one airport. Anything not
 * recognised is compared as written rather than guessed at — matching a
 * three-letter run inside a name would make "Bordeaux" an airport code.
 */
function airportKey(label?: string): string {
  const upper = (label ?? "").trim().toUpperCase();
  if (!upper) return "";
  const parenthesised = /\(([A-Z]{3})\)/.exec(upper);
  if (parenthesised && AIRPORTS.some((a) => a.code === parenthesised[1])) return parenthesised[1];
  if (/^[A-Z]{3}$/.test(upper) && AIRPORTS.some((a) => a.code === upper)) return upper;
  const named = AIRPORTS.find((a) => a.city.toUpperCase() === upper || a.name.toUpperCase() === upper);
  if (named) return named.code;
  return upper.replace(/\s+/g, " ");
}

/** Days since the epoch, so two dates can be compared as numbers. */
function dayNumber(date?: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((date ?? "").trim());
  return m ? Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000) : null;
}

/** A date and a clock time as one number of minutes, for comparing across days. */
function momentMins(date?: string, time?: string): number | null {
  const day = dayNumber(date);
  const mins = timeToMins(time);
  return day === null || mins === null ? null : day * 1440 + mins;
}

/**
 * Does `next` continue `leg`, or is it a separate flight?
 *
 * Returns the minutes on the ground when it continues, `null` when it does not.
 * A connection whose times are not filled in still counts if the onward leg
 * leaves on the day the first one lands — the wait is then unknown, not absent.
 */
function connectionMinutes(leg: ItinFlight, next: ItinFlight): number | null | undefined {
  const via = airportKey(leg.to);
  if (!via || via !== airportKey(next.from)) return undefined;

  const landsOn = flightArrivalDate(leg);
  const landed = momentMins(landsOn, leg.arriveTime);
  const leaves = momentMins(next.date, next.departTime);

  if (landed !== null && leaves !== null) {
    const wait = leaves - landed;
    if (wait < 0 || wait > CONNECTION_LIMIT_MINS) return undefined;
    return wait;
  }
  // Times missing on one side: the same day is the most we can go on.
  if (!landsOn || landsOn !== next.date) return undefined;
  return null;
}

/**
 * A night booked, or a stop planned, in the connecting city while the traveler
 * would supposedly be waiting airside. Either one means it is a visit.
 *
 * Both tests need a night or a whole day inside the wait before they mean
 * anything. A ticket that lands at 07:30 and leaves again at 10:45 the same
 * morning has neither, and the hotel checking in that day is the one at the
 * far end of the journey — reading it as a room in the connecting city was
 * exactly what stopped a real Amsterdam connection from being recognised.
 */
function staysOver(itin: Itinerary, leg: ItinFlight, next: ItinFlight): boolean {
  const from = flightArrivalDate(leg);
  const to = next.date;
  if (!from || !to || from === to) return false;
  // A room booked for the night that starts on the day the traveler lands.
  const sleeping = itin.lodging.some((l) => l.type !== "overnight-transit" && l.checkIn >= from && l.checkIn < to);
  if (sleeping) return true;
  // A stop planned on a day that falls WHOLLY inside the wait. A stop on the
  // landing day or the departure day could be anywhere, so it proves nothing.
  return itin.activities.some((a) => a.date && a.date > from && a.date < to);
}

/** The airline and number of a leg — "KL 1361" — for the connection note. */
function legLabel(flight: ItinFlight): string {
  return [flight.airline, flight.flightNo].filter(Boolean).join(" ").trim();
}

/** Fold connecting legs into the single journey they make. */
function foldLegs(legs: ItinFlight[]): ItinJourney {
  const first = legs[0];
  const last = legs[legs.length - 1];
  const stops: FlightStop[] = [];
  legs.forEach((leg, i) => {
    // Connections the traveler recorded inside a leg stay where they were.
    for (const stop of leg.stops ?? []) stops.push(stop);
    const next = legs[i + 1];
    if (!next) return;
    const onward = legLabel(next);
    stops.push({
      airport: leg.to,
      arriveTime: leg.arriveTime,
      departTime: next.departTime,
      overnight: flightArrivalDate(leg) !== next.date,
      // Nothing the traveler typed on the second leg is lost — its flight
      // number and its booking reference are what they read out at the desk.
      notes: [onward ? `then ${onward}` : null, next.confirmation ? `ref ${next.confirmation}` : null, next.notes]
        .filter(Boolean)
        .join(" · ") || undefined,
      legId: next.id,
    });
  });
  const landsOn = flightArrivalDate(last);
  return {
    ...first,
    to: last.to,
    arriveTime: last.arriveTime,
    arriveDate: landsOn !== first.date ? landsOn : undefined,
    stops,
    legs,
  };
}

/**
 * The trip's flights, with connections entered separately read as one journey.
 *
 * Everything derived from a trip goes through this — the day cards, the printed
 * itinerary, where the traveler sleeps. The stored flights are untouched.
 */
export function readJourneys(itin: Itinerary): ItinJourney[] {
  // Earliest departure first, so a leg is only ever joined to one that follows
  // it. Flights with no date sort last and simply never connect to anything.
  const ordered = [...itin.flights]
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (momentMins(a.f.date, a.f.departTime ?? "00:00") ?? Infinity) - (momentMins(b.f.date, b.f.departTime ?? "00:00") ?? Infinity) || a.i - b.i)
    .map((x) => x.f);

  const taken = new Set<string>();
  const journeys: ItinJourney[] = [];
  for (const flight of ordered) {
    if (taken.has(flight.id)) continue;
    taken.add(flight.id);
    const legs = [flight];
    for (;;) {
      const last = legs[legs.length - 1];
      const next = ordered.find(
        (c) => !taken.has(c.id) && connectionMinutes(last, c) !== undefined && !staysOver(itin, last, c),
      );
      if (!next) break;
      taken.add(next.id);
      legs.push(next);
    }
    journeys.push(legs.length === 1 ? { ...flight, legs } : foldLegs(legs));
  }
  // Back into the order the traveler entered them, so nothing jumps about.
  const position = new Map(itin.flights.map((f, i) => [f.id, i]));
  return journeys.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
}

/** The lodging covering the night that begins on `date` (you sleep here). */
export function lodgingForNight(itin: Itinerary, date: string): ItinLodging | null {
  // Hotels/other: checkIn <= date < checkOut.
  const stay = itin.lodging.find((l) => l.type !== "overnight-transit" && l.checkIn <= date && date < l.checkOut);
  if (stay) return stay;
  // Overnight transit: covers the night of its checkIn date.
  return itin.lodging.find((l) => l.type === "overnight-transit" && l.checkIn === date) ?? null;
}

/**
 * The order stops appear in a day: an explicit position first (set by
 * reordering or route planning), then by clock time, then as entered.
 */
export function sortDayActivities(acts: ItinActivity[]): ItinActivity[] {
  return acts
    .map((a, i) => ({ a, i }))
    .sort((x, y) => {
      const ox = x.a.order ?? Number.POSITIVE_INFINITY;
      const oy = y.a.order ?? Number.POSITIVE_INFINITY;
      if (ox !== oy) return ox - oy;
      const tx = timeToMins(x.a.startTime) ?? Number.POSITIVE_INFINITY;
      const ty = timeToMins(y.a.startTime) ?? Number.POSITIVE_INFINITY;
      if (tx !== ty) return tx - ty;
      return x.i - y.i;
    })
    .map((x) => x.a);
}

/** Stops that have no date yet — the planner can place these on a day. */
export function unscheduledActivities(itin: Itinerary): ItinActivity[] {
  return itin.activities.filter((a) => !a.date);
}

/**
 * One end of a ground leg, as far as a border is concerned.
 *
 * An address is enough — everything on this site ends its address with the
 * country. Deliberately structural rather than importing from lib/: this file
 * holds no knowledge of which countries border which, and should not start.
 */
export type BorderEnd = { name?: string; address?: string; coordinates?: string; country?: string };

/** Supplied by the caller, which is the side that knows about crossings. */
export type BorderCostFn = (from: BorderEnd, to: BorderEnd) => { minutes: number; says: string };

const NO_BORDER_COST = { minutes: 0, says: "" };

function borderOnLeg(
  borderCostFor: BorderCostFn | undefined,
  from?: BorderEnd,
  to?: BorderEnd,
): { minutes: number; says: string } {
  if (!borderCostFor || !from || !to) return NO_BORDER_COST;
  const cost = borderCostFor(from, to);
  return cost.minutes > 0 ? cost : NO_BORDER_COST;
}

/**
 * `borderCostFor` folds the time at a border into the driving.
 *
 * Optional, because the crossings are read on the server and every caller that
 * only wants the days laid out should not have to fetch them. Without it the
 * planner behaves exactly as it did — the border is warned about further down
 * and not counted, which is what it did before this existed.
 *
 * `assume` is the owner's set of planning figures (see
 * data/planner-assumptions.ts). Also optional, and the built-in defaults are
 * exactly the numbers this file used to carry, so a caller that passes nothing
 * gets the behaviour it always had. IT MUST BE THE SAME SET EVERYWHERE a trip
 * is shown: the planner, the shared link and the printed copy reading different
 * figures would have one trip saying three different things about the same day.
 */
export function buildDays(
  itin: Itinerary,
  borderCostFor?: BorderCostFn,
  assume: PlannerAssumptions = BUILT_IN_ASSUMPTIONS,
): ItineraryDay[] {
  const usableDay = usableDayHours(assume);
  const defaultDayStartMins = clockToMins(assume.dayStart) ?? 8 * 60;
  const lateFinishMins = clockToMins(assume.lateFinish) ?? 21 * 60;
  const dates = eachDate(itin.startDate, itin.endDate);
  // Worked out once for the whole trip, not per day: whether two flights are
  // one journey depends on both of them, and on where the traveler sleeps.
  const journeys = readJourneys(itin);
  return dates.map((date, index) => {
    const dayActs = sortDayActivities(itin.activities.filter((a) => a.date === date));
    // Prefer a real measured road time when we have one for this leg.
    const roadMinutes = (from?: string, to?: string) => itin.roadTimes?.[travelLegKey(from, to)];
    const roadSource = (from?: string, to?: string) => itin.roadTimeSources?.[travelLegKey(from, to)];
    const withDistance: DayActivity[] = dayActs.map((a, i) => {
      if (i === 0) return { ...a, distanceFromPrev: null, travelMinutesFromPrev: null };
      const prev = dayActs[i - 1];
      const distanceFromPrev = kmBetween(prev.coordinates, a.coordinates);
      const measured = roadMinutes(prev.coordinates, a.coordinates);
      return {
        ...a,
        distanceFromPrev,
        travelMinutesFromPrev: measured ?? estimateTravelMinutes(distanceFromPrev, assume),
        travelIsMeasured: measured !== undefined,
        travelSource: roadSource(prev.coordinates, a.coordinates),
      };
    });

    const flightsDeparting = journeys.filter((f) => f.date === date);
    const flightsArriving = journeys.filter((f) => flightArrivalDate(f) === date);
    const lodging = lodgingForNight(itin, date);
    const isLastDay = index === dates.length - 1;

    // --- Every ground leg of the day, not just stop-to-stop ---------------
    // Morning: from the airport you land at, else from last night's hotel.
    // Evening: to the airport you fly out of, else back to tonight's hotel.
    const prevNightLodging = index > 0 ? lodgingForNight(itin, dates[index - 1]) : null;
    const firstStop = withDistance[0];
    const lastStop = withDistance[withDistance.length - 1];

    // A same-day flight appears as both arriving and departing, so an airport is
    // only a real ground transfer if it is actually near the day's stops —
    // otherwise we would "drive" from Krakow to JFK. Pick the nearest candidate
    // within a sane driving distance.
    const nearestAirportTo = (candidates: Array<string | undefined>, stopCoordinates?: string): string | null => {
      let best: { coords: string; km: number } | null = null;
      for (const label of candidates) {
        const coords = airportCoordsFor(label);
        const km = kmBetween(coords ?? undefined, stopCoordinates);
        if (coords && km !== null && km <= MAX_AIRPORT_TRANSFER_KM && (!best || km < best.km)) best = { coords, km };
      }
      return best?.coords ?? null;
    };
    const arrivalAirport = nearestAirportTo(flightsArriving.map((f) => f.to), firstStop?.coordinates);
    const departureAirport = nearestAirportTo(flightsDeparting.map((f) => f.from), lastStop?.coordinates);
    const arrivalAirportLabel = flightsArriving.find((f) => airportCoordsFor(f.to) === arrivalAirport)?.to;
    const departureAirportLabel = flightsDeparting.find((f) => airportCoordsFor(f.from) === departureAirport)?.from;

    const leg = (
      kind: TravelLeg["kind"],
      label: string,
      from?: string,
      to?: string,
      fromPlace?: BorderEnd,
      toPlace?: BorderEnd,
    ): TravelLeg | null => {
      const km = kmBetween(from, to);
      const measured = roadMinutes(from, to);
      const minutes = measured ?? estimateTravelMinutes(km, assume);
      if (km === null || minutes === null || minutes <= 0) return null;
      const border = borderOnLeg(borderCostFor, fromPlace, toPlace);
      return {
        kind,
        label,
        minutes: minutes + border.minutes,
        km,
        fromCoordinates: from,
        toCoordinates: to,
        measured: measured !== undefined,
        source: roadSource(from, to),
        ...(border.minutes ? { borderMinutes: border.minutes, borderSays: border.says } : {}),
      };
    };

    const travelLegs: TravelLeg[] = [];
    if (firstStop) {
      if (arrivalAirport) {
        const l = leg("arrive-airport", `Airport ${arrivalAirportLabel} → ${firstStop.name}`, arrivalAirport, firstStop.coordinates);
        if (l) travelLegs.push(l);
      } else if (prevNightLodging?.coordinates) {
        const l = leg("from-lodging", `${prevNightLodging.name || "Hotel"} → ${firstStop.name}`, prevNightLodging.coordinates, firstStop.coordinates, prevNightLodging, firstStop);
        if (l) travelLegs.push(l);
      }
    }
    withDistance.forEach((a, i) => {
      if (i === 0 || a.travelMinutesFromPrev === null || a.travelMinutesFromPrev <= 0) return;
      const border = borderOnLeg(borderCostFor, withDistance[i - 1], a);
      // Counted inside the leg AND inside the stop's own travel time, so the
      // clock that works out arrival times moves by it too. A border that is
      // in the day's total but not in the arrival times would put somebody at
      // a kever two hours before they can be there.
      a.travelMinutesFromPrev += border.minutes;
      travelLegs.push({
        kind: "stop",
        label: `${withDistance[i - 1].name} → ${a.name}`,
        minutes: a.travelMinutesFromPrev,
        km: a.distanceFromPrev,
        fromCoordinates: withDistance[i - 1].coordinates,
        toCoordinates: a.coordinates,
        measured: a.travelIsMeasured,
        source: a.travelSource,
        ...(border.minutes ? { borderMinutes: border.minutes, borderSays: border.says } : {}),
      });
    });
    if (lastStop) {
      if (departureAirport) {
        const l = leg("depart-airport", `${lastStop.name} → airport ${departureAirportLabel}`, lastStop.coordinates, departureAirport);
        if (l) travelLegs.push(l);
      } else if (lodging?.coordinates && lodging.type !== "overnight-transit") {
        const l = leg("to-lodging", `${lastStop.name} → ${lodging.name || "hotel"}`, lastStop.coordinates, lodging.coordinates, lastStop, lodging);
        if (l) travelLegs.push(l);
      }
    }

    // All of it is real time that isn't free.
    const travelMins = travelLegs.reduce((sum, l) => sum + l.minutes, 0);
    const travelHours = Math.round((travelMins / 60) * 10) / 10;
    const borderMinutes = travelLegs.reduce((sum, l) => sum + (l.borderMinutes ?? 0), 0);

    // --- What time you actually get there --------------------------------
    // Roll a clock forward from the moment the day starts: leave the hotel (or
    // the airport you landed at), drive, arrive, spend time at the stop, drive
    // on. A stop with its own start time holds the clock until then — you wait
    // rather than arrive early — and if the drive means you cannot make it,
    // the arrival is marked late instead of being quietly moved.
    const startsFrom = arrivalAirport
      ? `airport ${arrivalAirportLabel ?? ""}`.trim()
      : prevNightLodging
        ? prevNightLodging.name || "last night's hotel"
        : undefined;
    // You cannot set off before you have landed. When the day begins at an
    // airport, it begins when the plane does — not at the traveler's usual
    // morning hour.
    const landedAt = arrivalAirport
      ? flightsArriving.map((f) => timeToMins(f.arriveTime)).filter((v): v is number => v !== null).sort((a, b) => a - b)[0] ?? null
      : null;
    const dayStart = Math.max(timeToMins(itin.dayStartTime) ?? defaultDayStartMins, landedAt ?? 0);
    let clock = dayStart;
    const openingLeg = travelLegs.find((l) => l.kind === "arrive-airport" || l.kind === "from-lodging");
    if (openingLeg) clock += openingLeg.minutes;

    withDistance.forEach((a, i) => {
      if (i > 0) clock += a.travelMinutesFromPrev ?? 0;
      const stated = timeToMins(a.startTime);
      if (stated !== null) {
        a.arrivesLate = clock > stated;
        // Waiting is fine; being late is not, and pretending otherwise would
        // make every later stop on the day wrong too.
        clock = Math.max(clock, stated);
      }
      a.arrivalTime = minsToTime(clock);
      clock += stopMinutes(a, assume);
      a.departureTime = minsToTime(clock);
    });
    const closingLeg = travelLegs.find((l) => l.kind === "to-lodging" || l.kind === "depart-airport");
    if (closingLeg) clock += closingLeg.minutes;
    const dayEnd = clock;

    const warnings: string[] = [];
    // A red-eye IS the night's accommodation.
    const overnightFlight = overnightFlightFor(itin, date, journeys);
    // Missing place to sleep (skip the last day — you usually fly home).
    if (!lodging && !isLastDay && !overnightFlight) {
      warnings.push("No place to sleep this night — add a hotel, or mark an overnight bus/flight.");
    }
    if (landedAt !== null && withDistance.length) {
      // Deliberately not folded into the clock: how long a border, baggage and
      // a car-hire desk take varies far too much to put a number on, and an
      // invented one would be worse than none.
      warnings.push(
        `This day starts from the airport at ${minsToTime(dayStart)}, the moment the flight lands — it does not include clearing passport control, baggage, or collecting a car. Add that time yourself before relying on the arrival times below.`,
      );
    }
    if (withDistance.length) {
      const late = withDistance.filter((a) => a.arrivesLate);
      if (late.length) {
        warnings.push(
          `Running late: leaving at ${minsToTime(dayStart)} you reach ${late[0].name} after its ${late[0].startTime} start. Start earlier, drop a stop, or move it to another day.`,
        );
      } else if (dayEnd > lateFinishMins) {
        warnings.push(
          `This day finishes around ${minsToTime(dayEnd)} — later than most kevarim and hotels expect. Consider starting earlier or moving a stop.`,
        );
      }
    }
    const travelDay = flightsDeparting.length > 0 || flightsArriving.length > 0;
    const isEmpty = dayActs.length === 0 && !travelDay;

    // Free hours: the usable window minus time at the stops AND the time it
    // takes to get between them. Ignoring the driving is what used to report a
    // packed, spread-out day as mostly free.
    const scheduled = dayActs.reduce((sum, a) => sum + stopMinutes(a, assume) / 60, 0);
    const committed = scheduled + travelHours;
    const freeHours = dayActs.length
      ? Math.max(0, Math.round((usableDay - committed) * 10) / 10)
      : travelDay
        ? null
        : usableDay;

    const hasTransfer = travelLegs.some((l) => l.kind !== "stop");
    const travelNote = travelHours >= 0.5 ? ` (after about ${travelHours} h of driving${hasTransfer ? ", including transfers" : " between stops"})` : "";

    // Per-leg checks first: a day whose timing already doesn't work must not
    // also be told it has room for another stop.
    const legWarnings: string[] = [];
    let hasTimingConflict = false;
    const timed = dayActs.filter((a) => timeToMins(a.startTime) !== null);
    for (let i = 1; i < timed.length; i += 1) {
      const prevStart = timeToMins(timed[i - 1].startTime) ?? 0;
      const prevEnd = prevStart + stopMinutes(timed[i - 1], assume);
      const nextStart = timeToMins(timed[i].startTime) ?? 0;
      const legMins = roadMinutes(timed[i - 1].coordinates, timed[i].coordinates) ?? estimateTravelMinutes(kmBetween(timed[i - 1].coordinates, timed[i].coordinates), assume) ?? 0;
      const gapHours = Math.round(((nextStart - prevEnd - legMins) / 60) * 10) / 10;
      if (nextStart - prevEnd < legMins) {
        // Not enough time to make it there — a scheduling conflict, not free time.
        hasTimingConflict = true;
        legWarnings.push(`Tight timing: leaving ${timed[i - 1].name} and driving roughly ${formatDuration(legMins)} does not leave enough time before ${timed[i].name} starts at ${timed[i].startTime}.`);
      } else if (gapHours >= assume.gapHoursWorthMentioning) {
        // A "gap" that is really a long drive is not offered as free time.
        legWarnings.push(`About ${gapHours} free hours after ${timed[i - 1].name} (not counting the ~${formatDuration(legMins)} drive), with nothing planned until ${timed[i].name} — room for another stop.`);
      }
    }

    // If stops have no location we cannot measure the driving between them, and
    // silently counting it as zero is what makes a packed day look wide open.
    // Say so instead of quietly overstating the free time.
    const missingLocation = dayActs.filter((a) => !coordinatesToPoint(a.coordinates));
    if (dayActs.length > 1 && missingLocation.length > 0) {
      const names = missingLocation.slice(0, 3).map((a) => a.name).join(", ");
      warnings.push(
        `Travel time is not counted for ${missingLocation.length} stop${missingLocation.length > 1 ? "s" : ""} (${names}${missingLocation.length > 3 ? "…" : ""}) because ${missingLocation.length > 1 ? "they have" : "it has"} no location yet — pick the address from the dropdown, or use "Plan my route" to look them up. Until then the free hours below are too high.`,
      );
    }

    // A day that crosses a border. No routing engine — Google Maps included —
    // puts the queue at the crossing into its driving time, and on the frontiers
    // this site sends people over that queue is routinely the longest part of
    // the day. Flag it rather than fold a made-up number into the total.
    const crossings: string[] = [];
    for (let i = 1; i < dayActs.length; i += 1) {
      const from = dayActs[i - 1].country?.trim();
      const to = dayActs[i].country?.trim();
      if (from && to && from !== to) {
        const pair = `${from} → ${to}`;
        if (!crossings.includes(pair)) crossings.push(pair);
      }
    }
    if (crossings.length) {
      warnings.push(
        `This day crosses a border (${crossings.join(", ")}). The driving times below do not include waiting at the crossing, which can add anywhere from minutes to several hours — check the current wait before you commit to the day's timings.`,
      );
    }

    if (isEmpty) {
      warnings.push(`Nothing planned yet — about ${usableDay} hours open. Add stops, or get ideas for the free time below.`);
    } else if (committed > usableDay) {
      const over = Math.round((committed - usableDay) * 10) / 10;
      warnings.push(`This day is over-packed — about ${Math.round(scheduled * 10) / 10} h at the stops plus roughly ${travelHours} h of driving is about ${over} h more than a ${usableDay}-hour day. Consider moving a stop to another day.`);
    } else if (!hasTimingConflict && missingLocation.length === 0 && freeHours !== null && freeHours >= assume.freeHoursWorthMentioning) {
      warnings.push(`About ${freeHours} free hours this day${travelNote} — room for another stop.`);
    }
    warnings.push(...legWarnings);

    return {
      date,
      label: formatDateLong(date),
      index,
      flightsDeparting,
      flightsArriving,
      lodging,
      activities: withDistance,
      warnings,
      freeHours,
      travelHours,
      borderMinutes,
      travelLegs,
      startsFrom,
      startTime: minsToTime(dayStart),
      endTime: withDistance.length ? minsToTime(dayEnd) : undefined,
      overnightFlight,
    };
  });
}

export type ItinerarySummary = {
  nights: number;
  nightsWithoutLodging: number;
  emptyDays: number;
  totalWarnings: number;
  /** Estimated driving hours between stops across the whole trip. */
  travelHours: number;
  /** Days where stops + driving exceed the usable day. */
  overpackedDays: number;
};

export function summarize(days: ItineraryDay[]): ItinerarySummary {
  const nights = Math.max(0, days.length - 1);
  let nightsWithoutLodging = 0;
  let emptyDays = 0;
  let totalWarnings = 0;
  let travelHours = 0;
  let overpackedDays = 0;
  days.forEach((day) => {
    // Count the same nights the day cards flag (red-eye flights / overnight
    // transit already suppress the warning), so the summary stays consistent.
    if (day.warnings.some((w) => w.startsWith("No place to sleep"))) nightsWithoutLodging += 1;
    if (day.activities.length === 0 && day.flightsDeparting.length === 0 && day.flightsArriving.length === 0) emptyDays += 1;
    if (day.warnings.some((w) => w.startsWith("This day is over-packed"))) overpackedDays += 1;
    travelHours += day.travelHours;
    totalWarnings += day.warnings.length;
  });
  return { nights, nightsWithoutLodging, emptyDays, totalWarnings, travelHours: Math.round(travelHours * 10) / 10, overpackedDays };
}
