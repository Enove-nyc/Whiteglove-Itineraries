/**
 * A real planner itinerary, shaped for the White Glove app.
 *
 * The app (components/companion/CompanionApp.tsx) renders a CompanionTrip. The
 * planner stores an Itinerary (data/itinerary.ts). This is the one place that
 * turns the second into the first, reading the very same day-by-day plan the
 * printed copy and the shared link read — buildDays() — so the trip on the
 * phone is the trip on paper, not a second telling of it.
 *
 * WHAT IT DOES NOT INVENT. The concierge side of the app — the advisor thread,
 * the held-for-you weather swap, the "handled for you" log — is left off a
 * wired trip (concierge: false). Nothing is put in an advisor's mouth that no
 * advisor said. What a real trip carries is what the planner actually holds:
 * the days, the stops, the flights and stay in the wallet, and who is going.
 *
 * THE KOSHER-AND-SHABBOS LAYER IS OFF UNTIL THE ACCOUNT TURNS IT ON
 * (AppPrefs.kosherFeatures, lib/app-prefs-store.ts — a settings switch on the
 * account page). Off, this file behaves exactly as a plain itinerary tool.
 * On, candle-lighting, when Shabbos ends, and the site's own kosher listings
 * near the trip are worked out here and carried on `days[].shabbosLabel` /
 * `shabbosNote` and `guideSections` — never invented when the layer is off,
 * and never computed at all (no zmanim call, no kosher lookup) when it is,
 * see lib/companion-build.ts.
 */

import {
  type Itinerary,
  type ItineraryDay,
  travelerSummary,
  travelersOf,
} from "@/data/itinerary";
import type { ZmanimDay } from "@/lib/zmanim-day";
import type {
  CompanionDay,
  CompanionGuideSection,
  CompanionItem,
  CompanionKind,
  CompanionTrip,
  CompanionWalletGroup,
  CompanionWalletRow,
} from "@/data/companion-demo";

/**
 * A kosher place near the trip, flattened to just what the guide shows.
 *
 * Built from lib/curated-kosher.ts (the site's own listings) with the
 * hechsher already spelled for a reader — kept a plain shape here so the
 * mapper stays a pure transform a test can call with a hand-made list.
 */
export type CompanionKosherNearby = {
  name: string;
  city: string;
  kind: string;
  diet?: string;
  /** The hechsher, already put into words. */
  hechsher: string;
  km: number;
};

export type CompanionLayer = {
  /** One worked-out ZmanimDay per date (candle-lighting, tzeis, occasion). */
  zmanimByDate?: Record<string, ZmanimDay>;
  /** The site's kosher listings near where the trip is, nearest first. */
  kosher?: CompanionKosherNearby[];
};

/* ---- small date helpers (UTC-noon, like the rest of the planner) -------- */

function atNoon(dateISO: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
}

function fmt(dateISO: string, opts: Intl.DateTimeFormatOptions): string {
  const dt = atNoon(dateISO);
  if (!dt) return "";
  return dt.toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

/** "25 October – 1 November 2026", trimming the year off the first when shared. */
function formatRange(start: string, end: string): string {
  const s = atNoon(start);
  const e = atNoon(end);
  if (!s || !e) return "";
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  const startStr = fmt(start, { day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) });
  const endStr = fmt(end, { day: "numeric", month: "long", year: "numeric" });
  return `${startStr} – ${endStr}`;
}

/** Minutes past midnight for an HH:MM, or a large number so blanks sort last. */
function minutesOf(time?: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : 100000;
}

/* ---- the Shabbos layer, read off worked-out zmanim ---------------------- */

/** The first time carrying this id across a day's blocks, or null. */
function zmanTime(zday: ZmanimDay | undefined, id: string): string | null {
  if (!zday) return null;
  for (const block of zday.blocks) {
    const found = block.entries.find((e) => e.id === id && e.time);
    if (found?.time) return found.time;
  }
  return null;
}

/** The name of the place a day's evening times were worked out for. */
function zmanPlace(zday: ZmanimDay | undefined): string {
  if (!zday) return "";
  const evening = zday.blocks.find((b) => b.span === "evening") ?? zday.blocks[zday.blocks.length - 1];
  return evening?.placeName ?? "";
}

/** The Shabbos / erev-Shabbos label and note for a day, from real times. */
function shabbosFromZmanim(zday: ZmanimDay | undefined): { label: string; note: string } | null {
  if (!zday) return null;
  const candle = zmanTime(zday, "candle-lighting");
  const tzeis = zmanTime(zday, "tzeit");
  const occasion = zday.occasion || "Shabbos";
  if (candle) {
    return {
      label: `Candle-lighting ${candle}`,
      note: `${occasion} begins this evening — the day is built to finish before it comes in.`,
    };
  }
  if (zday.occasion === "Shabbos" || zday.restDay) {
    return {
      label: "Shabbos",
      note: tzeis
        ? `Nothing is scheduled — everything is where you are staying. Shabbos ends about ${tzeis}.`
        : "Nothing is scheduled — everything is where you are staying.",
    };
  }
  return null;
}

/* ---- the mapping -------------------------------------------------------- */

// Everything the planner holds as a stop today is a place you go to on foot —
// a kever or a shul no less so — so every activity maps to one kind. When the
// planner learns to mark a meal or a rest, this is where that branch lands.
const STOP_KIND: CompanionKind = "sight";

/** The short label under a day in the eight-day strip. */
function shortLabel(day: ItineraryDay, index: number, lastIndex: number, kosher: boolean): string {
  if (day.flightsArriving.length && index === 0) return "Arrive";
  if (day.flightsDeparting.length && index === lastIndex) return "Home";
  if (day.flightsDeparting.length && index === 0) return "Fly out";
  const first = day.activities[0];
  if (first) return first.name.split(/[,(]/)[0].trim().slice(0, 12);
  // Only the kosher-and-Shabbos layer knows to call an empty Saturday
  // "Shabbos" rather than just "Open" — off, this is a plain itinerary.
  if (kosher && atNoon(day.date)?.getUTCDay() === 6) return "Shabbos";
  return "Open";
}

function itemsForDay(day: ItineraryDay, kosher: boolean): CompanionItem[] {
  const items: CompanionItem[] = [];

  for (const f of day.flightsArriving) {
    items.push({
      time: f.arriveTime ?? "",
      title: `Land at ${f.to}`,
      place: f.airline ? `${f.airline}${f.flightNo ? " " + f.flightNo : ""}` : "By air",
      kind: "travel",
      note: f.confirmation ? `Reference ${f.confirmation}.` : "",
    });
  }

  for (const a of day.activities) {
    const time = a.startTime || a.arrivalTime || "";
    const walk =
      a.travelMinutesFromPrev && a.travelMinutesFromPrev > 0
        ? `${a.travelIsMeasured ? "" : "≈"}${Math.round(a.travelMinutesFromPrev)} min from the last stop`
        : undefined;
    items.push({
      time,
      title: a.name,
      place: a.address || a.country || "",
      kind: STOP_KIND,
      note: a.notes || "",
      ...(walk ? { walk } : {}),
      ...(a.phone ? { phone: a.phone } : {}),
      ...(a.href ? { href: a.href } : {}),
    });
  }

  for (const f of day.flightsDeparting) {
    items.push({
      time: f.departTime ?? "",
      title: `${f.from} → ${f.to}`,
      // The airline/flight, like an arriving leg — a landing time is not a
      // place, and doesn't belong in the "Where" row it used to sit in.
      place: f.airline ? `${f.airline}${f.flightNo ? " " + f.flightNo : ""}` : "By air",
      kind: "travel",
      note: f.confirmation ? `Reference ${f.confirmation}.` : "",
      ...(f.arriveTime ? { arriveNote: `Lands ${f.arriveTime}${f.arriveDate ? " next day" : ""}` } : {}),
    });
  }

  if (items.length === 0) {
    // An empty Saturday only reads as "Shabbos" when the layer that knows
    // what that means is actually on — off, it's an open day like any other.
    if (kosher && atNoon(day.date)?.getUTCDay() === 6) {
      items.push({ time: "", title: "Shabbos", place: "", kind: "shabbos", note: "Nothing scheduled." });
    } else {
      items.push({ time: "", title: "An open day", place: "", kind: "rest", note: "Nothing planned yet." });
    }
  }

  return items.sort((x, y) => minutesOf(x.time) - minutesOf(y.time));
}

function dayFor(
  day: ItineraryDay,
  index: number,
  lastIndex: number,
  today: string,
  guideNote?: string,
  zday?: ZmanimDay,
  kosher = false,
): CompanionDay {
  const dt = atNoon(day.date);
  const wd = dt?.getUTCDay();
  const weekdayLong = fmt(day.date, { weekday: "long" });
  const month = fmt(day.date, { month: "long" });
  const dom = dt ? String(dt.getUTCDate()).padStart(2, "0") : "";

  const start = day.startTime;
  const end = day.endTime;
  const timeChip = start && end ? `${start}–${end}` : start ? `From ${start}` : "";
  const travelChip = day.travelHours > 0 ? `≈${day.travelHours}h travelling` : "";

  const out: CompanionDay = {
    date: day.date,
    dow: fmt(day.date, { weekday: "short" }),
    dom,
    short: shortLabel(day, index, lastIndex, kosher),
    name: `${weekdayLong} ${dt ? dt.getUTCDate() : ""} ${month}`.trim(),
    weather: timeChip,
    walk: travelChip,
    today: day.date === today || undefined,
    ...(guideNote?.trim() ? { guideNote: guideNote.trim() } : {}),
    items: itemsForDay(day, kosher),
  };

  // The Shabbos side of a day is part of the kosher-and-Shabbos layer, off
  // until an account turns it on. When it is off this is a plain itinerary
  // and the day carries no Shabbos note at all.
  if (!kosher) return out;

  // Prefer real, worked-out times — candle-lighting on erev Shabbos or yom
  // tov, and when Shabbos ends — falling back to a weekday-only note when
  // the day has no place we can put a clock to.
  const fromZmanim = shabbosFromZmanim(zday);
  if (fromZmanim) {
    out.shabbosLabel = fromZmanim.label;
    out.shabbosNote = fromZmanim.note;
  } else if (wd === 6) {
    out.shabbosLabel = "Shabbos";
    out.shabbosNote = "Shabbos. Nothing is scheduled — everything is where you are staying.";
  } else if (wd === 5) {
    out.shabbosLabel = "Erev Shabbos";
    out.shabbosNote = "Shabbos begins this evening — the day is built to finish before it comes in.";
  }
  return out;
}

function walletGroupsFor(itin: Itinerary): CompanionWalletGroup[] {
  const groups: CompanionWalletGroup[] = [];

  const flightRows: CompanionWalletRow[] = itin.flights.map((f) => ({
    title: `${f.from} → ${f.to}`,
    ref: f.confirmation ? `ref ${f.confirmation}` : "",
    sub: [fmt(f.date, { weekday: "short", day: "numeric", month: "short" }), f.departTime, f.airline]
      .filter(Boolean)
      .join(" · "),
    id: f.id,
    stopKind: "flight",
    attachments: f.attachments,
  }));
  if (flightRows.length) groups.push({ name: "Flights", rows: flightRows });

  const stayRows: CompanionWalletRow[] = itin.lodging
    .filter((l) => l.type !== "overnight-transit")
    .map((l) => ({
      title: l.name || "Where you are staying",
      ref: l.confirmation ? `conf ${l.confirmation}` : "",
      sub:
        l.checkIn && l.checkOut
          ? `${fmt(l.checkIn, { day: "numeric", month: "short" })} – ${fmt(l.checkOut, { day: "numeric", month: "short" })}`
          : "",
      ...(l.phone ? { phone: l.phone } : {}),
      ...(l.address ? { address: l.address } : {}),
      id: l.id,
      stopKind: "lodging",
      attachments: l.attachments,
    }));
  if (stayRows.length) groups.push({ name: "Where you are staying", rows: stayRows });

  const heldRows: CompanionWalletRow[] = itin.activities
    .filter((a) => a.bookedOnSite || a.notes?.toLowerCase().includes("ticket") || (a.attachments?.length ?? 0) > 0)
    .map((a) => ({
      title: a.name,
      ref: a.bookedOnSite ? "booked" : "",
      sub: [a.date ? fmt(a.date, { weekday: "short", day: "numeric", month: "short" }) : "", a.address]
        .filter(Boolean)
        .join(" · "),
      id: a.id,
      stopKind: "activity",
      attachments: a.attachments,
    }));
  if (heldRows.length) groups.push({ name: "Held for you", rows: heldRows });

  return groups;
}

/* ---- the guide (kosher + Shabbos), from the site's own records ---------- */

const KOSHER_TINT = "#FAF8F3";
const SHABBOS_TINT = "#ffffff";

/** "Kosher, near you" — the site's listings, in the site's careful voice. */
function kosherSection(kosher: CompanionKosherNearby[]): CompanionGuideSection | null {
  if (!kosher.length) return null;
  return {
    name: "Kosher, near you",
    items: kosher.slice(0, 5).map((k) => ({
      title: k.name,
      note: [[k.kind, k.diet].filter(Boolean).join(", "), k.city, k.hechsher]
        .filter(Boolean)
        .join(" · ")
        .concat(". Listed, not endorsed — confirm the hechsher close to the day."),
      tint: KOSHER_TINT,
    })),
  };
}

/** "Shabbos here" — candle-lighting and when Shabbos ends, from real times. */
function shabbosSection(days: ItineraryDay[], zmanimByDate: Record<string, ZmanimDay> | undefined): CompanionGuideSection | null {
  if (!zmanimByDate) return null;
  const items: CompanionGuideSection["items"] = [];
  for (const day of days) {
    const zday = zmanimByDate[day.date];
    const candle = zmanTime(zday, "candle-lighting");
    const place = zmanPlace(zday);
    if (candle) {
      items.push({
        title: `Candle-lighting ${candle}`,
        note: `${fmt(day.date, { weekday: "long" })}${place ? `, ${place}` : ""}. The day is built to finish before it comes in.`,
        tint: SHABBOS_TINT,
      });
    }
    const isShabbos = zday?.occasion === "Shabbos" || zday?.restDay;
    const tzeis = zmanTime(zday, "tzeit");
    if (isShabbos && tzeis && !candle) {
      items.push({
        title: `Shabbos ends about ${tzeis}`,
        note: `${fmt(day.date, { weekday: "long" })}${place ? `, ${place}` : ""}. Nothing is scheduled — everything is where you are staying.`,
        tint: SHABBOS_TINT,
      });
    }
  }
  return items.length ? { name: "Shabbos here", items } : null;
}

/**
 * Build the app's trip from a planner itinerary and its day-by-day plan.
 *
 * `days` is the result of buildDays(itin, …) — passed in rather than computed
 * here, because the border costs and planning assumptions it needs are read on
 * the server, and this stays a pure transform that a test can call with a
 * hand-made trip.
 */
export function itineraryToCompanionTrip(
  itin: Itinerary,
  days: ItineraryDay[],
  opts: {
    today: string;
    advisorName?: string;
    tripName?: string;
    client?: string;
    tripId?: string;
    /** The worked-out zmanim and nearby kosher listings — see
     *  lib/companion-build.ts, the only caller that ever fills this in. */
    layer?: CompanionLayer;
    /** Whether the kosher-and-Shabbos layer is shown at all. Off by default. */
    kosher?: boolean;
  },
): CompanionTrip {
  const kosherOn = opts.kosher === true;
  const zmanimByDate = kosherOn ? opts.layer?.zmanimByDate : undefined;
  const kosherNearby = kosherOn ? (opts.layer?.kosher ?? []) : [];
  const lastIndex = days.length - 1;
  const compDays = days.map((d, i) => dayFor(d, i, lastIndex, opts.today, itin.guideNotes?.[d.date], zmanimByDate?.[d.date], kosherOn));

  // Which day the app opens on: today when the trip is on now, else the
  // first — a reasonable page to land a browser on, whether the trip hasn't
  // started yet or has already finished.
  let todayIndex = compDays.findIndex((d) => d.today);
  if (todayIndex < 0) todayIndex = 0;

  // The trip is over, not merely "not today" — the difference between
  // opening early (fine to read as day one) and opening after the last day
  // (must not be read as day one, or today, at all). ISO dates compare
  // lexicographically the same as chronologically.
  const lastDate = days[days.length - 1]?.date;
  const tripFinished = Boolean(lastDate && opts.today > lastDate);

  const who = travelerSummary(itin);
  const people = travelersOf(itin);
  const adults = people.filter((p) => (p.kind ?? "adult") === "adult").length;
  const children = people.filter((p) => p.kind === "child").length;
  const familyMeta =
    people.length > 0
      ? [
          adults ? `${adults} ${adults === 1 ? "adult" : "adults"}` : "",
          children ? `${children} ${children === 1 ? "child" : "children"}` : "",
        ]
          .filter(Boolean)
          .join(", ")
      : `${compDays.length} ${compDays.length === 1 ? "day" : "days"} · ${itin.activities.length} ${itin.activities.length === 1 ? "stop" : "stops"}`;

  const title = opts.client?.trim() || itin.title || opts.tripName || "Your trip";
  const openDay = compDays[todayIndex];
  const homeKicker = tripFinished
    ? `Trip finished · ${compDays.length} ${compDays.length === 1 ? "day" : "days"}`
    : openDay
      ? `${fmt(days[todayIndex].date, { day: "numeric", month: "long" })} · day ${todayIndex + 1} of ${compDays.length}`
      : `Day 1 of ${compDays.length}`;

  const prefs = [
    who ? { label: "Travelling", value: who } : null,
    itin.dayStartTime ? { label: "Starts each day", value: itin.dayStartTime } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const guideSections = [shabbosSection(days, zmanimByDate), kosherSection(kosherNearby)].filter(
    Boolean,
  ) as CompanionGuideSection[];

  // The one "Eating today" line on the home screen — the nearest kosher
  // place, in the same careful voice as the guide.
  const nearest = kosherNearby[0];

  const contact = opts.advisorName?.trim();
  return {
    concierge: false,
    ...(opts.tripId ? { tripId: opts.tripId } : {}),
    advisorName: contact || "White Glove",
    ...(contact ? { contactName: contact } : {}),
    homeTitle: title,
    homeKicker,
    tripTitle: who ? `${itin.title || title} — ${who}` : itin.title || title,
    tripDates: formatRange(itin.startDate, itin.endDate),
    todayIndex,
    tripFinished,
    ...(nearest
      ? {
          kosherTitle: nearest.name,
          kosherNote: `${[nearest.kind, nearest.city].filter(Boolean).join(" in ")}. Confirm the hechsher close to the day.`,
        }
      : {}),
    family: who || title,
    familyMeta,
    days: compDays,
    walletGroups: walletGroupsFor(itin),
    prefs,
    guideSections,
  };
}
