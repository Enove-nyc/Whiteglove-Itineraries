"use client";

import Link from "next/link";
import { useBookingLink } from "@/components/BookingLinkProvider";
import { bookingHref } from "@/lib/booking-access";
import { useEffect, useMemo, useRef, useState } from "react";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import AirportAutocomplete from "@/components/AirportAutocomplete";
import AssistantAnswer from "@/components/AssistantAnswer";
import { useRequireSignIn } from "@/components/SignInGate";
import DateField from "@/components/DateField";
import KosherNearby from "@/components/KosherNearby";
import SendPlaceIn from "@/components/SendPlaceIn";
import RoomGroupsPanel from "@/components/RoomGroupsPanel";
import SendToClientPanel from "@/components/SendToClientPanel";
import ShareItineraryPanel from "@/components/ShareItineraryPanel";
import { placeFromStay, placeFromStop, usePlaceOffer } from "@/components/usePlaceOffer";
import TripProgressStrip, { useDeviceClock } from "@/components/TripProgressStrip";
import TripSetupPanel from "@/components/TripSetupPanel";
import type { Crossing } from "@/lib/border-crossings";
import DayProgress from "@/components/DayProgress";
import DayZmanim from "@/components/DayZmanim";
import { fetchTripZmanim, type TripZmanim } from "@/lib/trip-zmanim";
import type { ZmanimDay } from "@/lib/zmanim-day";
import { borderCostForLegs } from "@/lib/border-legs";
import { documentsForDay, tripDocuments } from "@/lib/trip-documents";
import { borderIsWorthSaying, formatWait } from "@/lib/border-time";
import TripSwitcher from "@/components/TripSwitcher";
import type { AttractionResult } from "@/lib/attraction-search";
import type { KeverResult } from "@/lib/kever-search";
import type { LodgingResult } from "@/lib/lodging-search";
import type { PlaceLodgingResult } from "@/lib/hotel-places";
import { directionsBetweenUrl, placeDirectionsUrl } from "@/data/route-utils";
import { moveStop, planRoute } from "@/lib/route-plan";
import { applyTemplate, type TripTemplate } from "@/lib/trip-setup";
import { BUILT_IN_ASSUMPTIONS, type PlannerAssumptions } from "@/data/planner-assumptions";
import { correctedEnd, earliestEnd, rangeIsBackwards } from "@/lib/date-range";
import StopAttachments from "@/components/StopAttachments";
import { useViewer } from "@/lib/use-signed-in";
import { fetchRoadTimes } from "@/lib/road-times";
import { burialSummary, useKeverBurials } from "@/lib/use-kever-burials";
import {
  buildDays,
  emptyItinerary,
  flightArrivalDate,
  flightRouteLabel,
  formatDuration,
  formatKm,
  layoverMinutes,
  nextDate,
  readOvernightFlight,
  summarize,
  travelersOf,
  unscheduledActivities,
  type Itinerary,
  type ItinActivity,
  type ItinAttachment,
  type ItinFlight,
  type ItinJourney,
  type FlightStop,
  type ItinLodging,
  type ItinTraveler,
  type LodgingType,
  type TravelLeg,
  type DayAdjustment as ItinAdjustment,
} from "@/data/itinerary";
import type { SavedPlace } from "@/data/route-utils";
import { addImportedItemsToItinerary, type ImportedItem } from "@/data/smart-import";
import SmartImportPanel from "@/components/SmartImportPanel";

const ROUTE_KEY = "whiteGloveMyRoute";

const inputClass = "mt-1 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2 text-sm text-[var(--navy)] shadow-sm focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const caption = "text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500";
const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`);

type Tab = "flight" | "hotel" | "activity" | "import" | null;
type ItineraryView = "days" | "calendar";

export default function ItineraryBuilder({ crossings = [], today: serverToday = "", assume = BUILT_IN_ASSUMPTIONS, templates = [], itineraries = false }: {
  /** What is known about the borders this trip crosses. Read on the server. */
  crossings?: Crossing[];
  /**
   * Somewhere to start from, built on the server from the vacation
   * destinations that have an outline written for them. Empty is fine: the
   * setup panel simply does not offer templates. See lib/trip-setup.ts.
   */
  templates?: TripTemplate[];
  /** The server's date, for judging how fresh a border check is. */
  today?: string;
  /**
   * The owner's planning figures — how long a day is, how long a stop takes,
   * how fast the driving goes. Read on the server (/admin/planner sets them).
   * The shared view and the printed copy read the same set, so one trip cannot
   * say three different things about the same day.
   */
  assume?: PlannerAssumptions;
  /**
   * True on the White Glove Itineraries brand. That product is not kosher or
   * Jewish travel — it never offers zmanim, the kever directory, or kosher
   * food nearby, whatever a trip's own data happens to hold.
   */
  itineraries?: boolean;
}) {
  const [itin, setItin] = useState<Itinerary>(emptyItinerary());
  const [tab, setTab] = useState<Tab>(null);
  // Which flight the top form is editing, if any. Null means adding a new one.
  const [editingFlightId, setEditingFlightId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [savedNote, setSavedNote] = useState("");
  const [planning, setPlanning] = useState(false);
  const [planNote, setPlanNote] = useState("");
  // Bumped when the traveler opens a different trip, so the loader runs again.
  const [reloadKey, setReloadKey] = useState(0);
  const [editingLodgingId, setEditingLodgingId] = useState<string | null>(null);
  const [unscheduledOpen, setUnscheduledOpen] = useState(true);
  // Which trip is loaded, so a per-traveler access link can be requested for
  // it. Read once off the load response; the itinerary itself carries no id.
  const [tripId, setTripId] = useState<string | null>(null);
  // The add/edit form sits at the top of the builder, while the flights and
  // hotels it edits are listed further down. Pressing Edit down there opens the
  // top form — so bring it into view, or it reads as nothing happening.
  const editFormRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editingFlightId || editingLodgingId) {
      editFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [editingFlightId, editingLodgingId]);
  const [view, setView] = useState<ItineraryView>("days");
  const requireSignIn = useRequireSignIn();

  // The planner is a CRM now, not one long stacked page: with more than one
  // itinerary you land on the LIST of them (mode "list"), press one to edit it
  // (mode "edit"), and a "back to all itineraries" button returns you. With one
  // or none you open straight into it — a list of one is not a list. `mode` is
  // null until the first trips read decides, so the editor does not flash up
  // before the list for somebody who has several.
  const [mode, setMode] = useState<"list" | "edit" | null>(null);
  const [tripCount, setTripCount] = useState(0);
  useEffect(() => {
    let active = true;
    fetch("/api/account/trips", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active) return;
        if (!d?.trips) {
          // Signed out or no store — behave as the single-editor it always was.
          setMode((m) => m ?? "edit");
          return;
        }
        setTripCount(d.trips.length);
        setMode((m) => (m === null ? (d.trips.length >= 2 ? "list" : "edit") : m));
      })
      .catch(() => {
        if (active) setMode((m) => m ?? "edit");
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  // Load: the account, and nothing else.
  //
  // THERE IS NO BROWSER COPY TO FALL BACK TO. A trip used to be kept in
  // localStorage as well, which meant a signed-out visitor could build a real
  // itinerary that existed on one device, in one browser, and was gone the
  // moment they cleared their history or picked up their phone — and they
  // were told so in the smallest print on the page. A trip is somebody's
  // travel plans; the only honest place for it is their account.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/account/itinerary", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (!active) return;
          setItin(data?.itinerary ? { ...emptyItinerary(), ...data.itinerary } : emptyItinerary());
          setTripId(data?.tripId ?? null);
          setLoaded(true);
          return;
        }
      } catch {
        /* signed out, or offline */
      }
      // Signed out: an empty planner they can look around. The first thing
      // they try to change opens the sign-in dialog (see persist).
      if (active) {
        setItin(emptyItinerary());
        setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  // The one chokepoint every add, edit and reorder in this builder funnels
  // through. Gated here rather than at each of the dozens of buttons that
  // call it: the first attempt to change anything, signed out, opens the
  // sign-in dialog instead of writing a change nowhere it can be got back
  // from; once signed in, this and every later call go straight through.
  function persist(next: Itinerary) {
    requireSignIn(() => {
      setItin(next);
      void fetch("/api/account/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itinerary: next }),
      })
        .then((r) => {
          if (r.ok) {
            setSavedNote("Saved to your account.");
            setTimeout(() => setSavedNote(""), 1500);
          }
        })
        .catch(() => undefined);
    }, "Sign in to save");
  }

  const set = (patch: Partial<Itinerary>) => persist({ ...itin, ...patch });
  const addFlight = (f: ItinFlight) => persist({ ...itin, flights: [...itin.flights, f] });
  // Adds a stay, or replaces the one with the same id. Editing keeps the id, so
  // changing a hotel changes it rather than leaving two on the same night.
  const saveLodging = (l: ItinLodging) => {
    const isNew = !itin.lodging.some((x) => x.id === l.id);
    persist({
      ...itin,
      lodging: isNew ? [...itin.lodging, l] : itin.lodging.map((x) => (x.id === l.id ? l : x)),
    });
    // Only a new one. Editing a hotel that is already here is not the moment
    // to ask about it — they came to change a date, not to answer a question.
    if (isNew) void considerPlace(placeFromStay(l));
  };
  const addActivity = (a: ItinActivity) => {
    persist({ ...itin, activities: [...itin.activities, a] });
    void considerPlace(placeFromStop(a));
  };
  const removeFlight = (id: string) => persist({ ...itin, flights: itin.flights.filter((x) => x.id !== id) });
  // Editing keeps the id, so the flight is changed rather than swapped for a
  // new one — its connections and its booking reference come with it.
  const updateFlight = (next: ItinFlight) => persist({ ...itin, flights: itin.flights.map((x) => (x.id === next.id ? next : x)) });
  const removeLodging = (id: string) => persist({ ...itin, lodging: itin.lodging.filter((x) => x.id !== id) });
  const removeActivity = (id: string) => persist({ ...itin, activities: itin.activities.filter((x) => x.id !== id) });

  function importSavedRoute() {
    try {
      const saved = JSON.parse(localStorage.getItem(ROUTE_KEY) || "[]") as SavedPlace[];
      const existing = new Set(itin.activities.map((a) => a.name.toLowerCase()));
      const additions: ItinActivity[] = saved
        .filter((p) => !existing.has(p.name.toLowerCase()))
        .map((p) => ({ id: uid(), name: p.name, yiddishName: p.yiddishName, address: p.address, coordinates: p.coordinates, href: p.href, date: p.plannedDate || itin.startDate || "", bookedOnSite: true }));
      if (additions.length) persist({ ...itin, activities: [...itin.activities, ...additions] });
    } catch {
      /* ignore */
    }
  }

  // Smart Import's chosen rows, added in one save — same shape as
  // importSavedRoute's batch above, but across all three arrays at once since
  // a single confirmation can name a flight, a hotel and a car in one go.
  function importSmartImportItems(items: ImportedItem[]) {
    if (items.length) persist(addImportedItemsToItinerary(items, itin));
  }

  // Time at a border is folded into the driving rather than mentioned beside
  // it: the planner used to say "five hours" for a day that takes seven.
  const borderCost = useMemo(
    // The allowance comes from the same assumptions the rest of the day uses,
    // so changing it on /admin/planner moves the border too rather than only
    // the stops.
    () => (serverToday ? borderCostForLegs(crossings, serverToday, assume.borderAllowanceMins) : undefined),
    [crossings, serverToday, assume.borderAllowanceMins],
  );
  // What actually happened today, against the plan. Kept on the itinerary so
  // it saves and shares with everything else — see lib/day-progress.ts.
  function recordAdjustment(adjustment: ItinAdjustment) {
    setItin((prev) => ({ ...prev, adjustments: [...(prev.adjustments ?? []), adjustment] }));
  }
  function clearAdjustments(dayKey: string) {
    setItin((prev) => ({
      ...prev,
      adjustments: (prev.adjustments ?? []).filter((a) => !a.stopId.startsWith(`${dayKey}:`)),
    }));
  }

  const days = useMemo(
    () => (itin.startDate && itin.endDate ? buildDays(itin, borderCost, assume) : []),
    [itin, borderCost, assume],
  );
  const summary = useMemo(() => summarize(days), [days]);

  // The day's zmanim, once the traveler has asked for them. Worked out on the
  // server — the calculation carries the whole KosherJava port, and nobody who
  // leaves this off should be made to download it. Asked for again whenever
  // the dates or the places move, because both change the answer.
  //
  // The answer is kept WITH the places it was worked out for. A hotel moved to
  // another city leaves the old times sitting under the same date, and a table
  // of yesterday's city's zmanim is worse than none — so a result whose key no
  // longer matches the trip is simply not read.
  const [zmanim, setZmanim] = useState<{ key: string; days: TripZmanim }>({ key: "", days: {} });
  const zmanimKey = useMemo(
    () =>
      days
        .map((d) => `${d.date}|${d.lodging?.coordinates ?? ""}|${d.activities.map((a) => a.coordinates ?? "").join(",")}`)
        .join(";"),
    [days],
  );
  useEffect(() => {
    if (itineraries || !itin.showZmanim || !days.length) return;
    let current = true;
    fetchTripZmanim(days).then((result) => {
      if (current) setZmanim({ key: zmanimKey, days: result });
    });
    return () => {
      current = false;
    };
    // days is rebuilt on every keystroke; zmanimKey is what actually moves the
    // times, so the fetch follows that instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itin.showZmanim, zmanimKey]);
  const zmanimForToday = !itineraries && itin.showZmanim && zmanim.key === zmanimKey ? zmanim.days : null;
  const unscheduled = useMemo(() => unscheduledActivities(itin), [itin]);
  // Who is buried at each beis hachaim on the trip, looked up by slug. Never
  // looked up on Itineraries — that brand has no kever directory to look up.
  const burials = useKeverBurials(itineraries ? [] : itin.activities);
  const hasDates = Boolean(itin.startDate && itin.endDate);

  // Boarding passes need an account; without one there is nowhere to keep
  // them that survives closing the browser.
  const viewer = useViewer();

  // Somebody adding a place the site has not got is asked whether they would
  // send it in. Only when signed in — a suggestion needs a name to credit and
  // somebody to ask back, and collecting an address through a pop-up to get
  // them would be worse than not asking at all.
  const { offering, consider: considerPlace, answer: answerOffer } = usePlaceOffer(Boolean(viewer?.signedIn));

  // The traveler's own date, so the day they are actually on opens first
  // instead of day one. Empty until the browser has said what day it is where
  // they are standing, which is the only place that question has an answer.
  const { today } = useDeviceClock();
  const todayInTrip = days.some((day) => day.date === today) ? today : null;
  const goToToday = (date: string) => {
    document.getElementById(`trip-day-${date}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Arrange the trip from locations the traveler supplied or selected from
  // White Glove's own listings. We do not resolve typed stops through an
  // external map or places service.
  async function planMyRoute() {
    if (!hasDates) { setPlanNote("Set the trip start and end dates first."); return; }
    setPlanning(true);
    const working = itin;
    setPlanNote("Planning the fastest route…");
    const result = planRoute(working, assume);
    let planned = result.itinerary;

    // Replace the straight-line estimates with real road driving times.
    setPlanNote("Getting real driving times…");
    const chains = buildDays(planned, borderCost, assume)
      .map((d) => {
        const legs = d.travelLegs;
        if (!legs.length) return [];
        return [legs[0].fromCoordinates ?? "", ...legs.map((l) => l.toCoordinates ?? "")];
      })
      .filter((chain) => chain.length > 1 && chain.every(Boolean));
    const measured = await fetchRoadTimes(chains, planned.roadTimes ?? {}, planned.startDate);
    const measuredCount = Object.keys(measured.times).length;
    if (measuredCount) {
      planned = {
        ...planned,
        roadTimes: { ...(planned.roadTimes ?? {}), ...measured.times },
        roadTimeSources: { ...(planned.roadTimeSources ?? {}), ...measured.sources },
      };
    }

    persist(planned);
    const stillMissing = result.unplaceable.length;
    setPlanning(false);
    // Say which engine answered. A Google time is the number Maps would give;
    // an OSRM one assumes empty roads, and a traveler deserves to know which
    // of those they are looking at before they build a day around it.
    const timesNote = !measuredCount
      ? measured.partial
        ? " Driving times could not be looked up just now, so the times shown are our own estimates."
        : ""
      : measured.engine === "google"
        ? " Driving times taken from Google Maps for an ordinary day's traffic."
        : " Driving times measured on real roads (no traffic allowance — treat them as a floor).";
    setPlanNote(
      `Route planned${result.placed ? ` — ${result.placed} stop${result.placed > 1 ? "s" : ""} scheduled` : ""}.` +
        timesNote +
        (stillMissing ? ` ${stillMissing} stop${stillMissing > 1 ? "s" : ""} still need a location or a day.` : ""),
    );
    setTimeout(() => setPlanNote(""), 8000);
  }

  // Change any detail of a stop after it's on the route.
  const updateActivity = (updated: ItinActivity) => persist({ ...itin, activities: itin.activities.map((a) => (a.id === updated.id ? updated : a)) });
  const setActivityAttachments = (id: string, attachments: ItinAttachment[]) =>
    persist({ ...itin, activities: itin.activities.map((a) => (a.id === id ? { ...a, attachments } : a)) });

  const moveStopBy = (id: string, direction: -1 | 1) => persist(moveStop(itin, id, direction));
  const scheduleStop = (id: string, date: string) => persist({ ...itin, activities: itin.activities.map((a) => (a.id === id ? { ...a, date, order: undefined } : a)) });

  // Until the first trips read lands, show nothing rather than flashing the
  // editor at somebody who is about to see the list.
  if (mode === null) {
    return <p className="py-10 text-sm text-stone-500">Loading your itineraries…</p>;
  }

  // The index: the list of itineraries by name. Pressing one drills into it.
  if (mode === "list") {
    return (
      <TripSwitcher
        onSwitched={() => setReloadKey((k) => k + 1)}
        onOpen={() => {
          setMode("edit");
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Back to the index — the planner is a CRM now, one itinerary at a time.
          Always here in edit mode: even with a single itinerary it is the way
          to the list, where a new one is started and the others are managed. */}
      <button
        type="button"
        onClick={() => setMode("list")}
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
      >
        ← Back to all itineraries
      </button>
      {/* How long until it, and once it starts, where in it you are. Above
          everything else, because on the third morning in Kraków it is the
          only part of this page anybody needs. */}
      <TripProgressStrip
        startDate={itin.startDate}
        endDate={itin.endDate}
        days={days}
        documentsToday={todayInTrip ? documentsForDay(tripDocuments(itin), todayInTrip).map((d) => d.attachment) : []}
        onGoToToday={goToToday}
        tripId={itin.startDate && itin.endDate ? `trip-${itin.startDate}-${itin.endDate}` : undefined}
        tripTitle={itin.title?.trim() || "Your trip"}
      />

      {/* What this trip still needs, why each one matters, and somewhere real
          to start from. In front of the editor rather than instead of it —
          everything below stays usable with this ignored or collapsed. See
          lib/trip-setup.ts. */}
      <TripSetupPanel
        itin={itin}
        templates={templates}
        signedIn={viewer === null ? null : Boolean(viewer.signedIn)}
        onApply={(patch, template) => {
          const base = { ...itin, ...patch };
          persist(template ? applyTemplate(base, template, uid) : base);
        }}
      />

      {/* Trip header */}
      <section className="rounded-2xl border border-[var(--gold-light)] bg-[var(--surface)] p-4 shadow-[0_10px_30px_rgba(23,45,82,.06)] sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <label className="block"><span className={caption}>Trip name</span><input className={inputClass} value={itin.title} onChange={(e) => set({ title: e.target.value })} /></label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block"><span className={caption}>Start date</span><DateField ariaLabel="Trip start date" className={inputClass} value={itin.startDate} onChange={(startDate) => {
              // Moving the start past the end takes the end with it, rather
              // than leaving a trip that finishes before it begins.
              set({ startDate, endDate: correctedEnd(startDate, itin.endDate) });
            }} /></label>
            <label className="block"><span className={caption}>End date</span><DateField ariaLabel="Trip end date" className={inputClass} min={earliestEnd(itin.startDate)} value={itin.endDate} onChange={(endDate) => set({ endDate: correctedEnd(itin.startDate, endDate) })} /></label>
            <label className="block"><span className={caption} title="What time you set off each morning. Arrival times are worked out from this.">Day starts</span><input type="time" className={inputClass} value={itin.dayStartTime ?? "08:00"} onChange={(e) => set({ dayStartTime: e.target.value })} /></label>
          </div>
        </div>
        {/* Somewhere to put the things a trip has that no field asks about:
            who has the key, which pharmacy was open late, the driver's brother's
            number, what to do differently next time.

            Itinerary.notes has existed in the type since the planner was built
            and was never shown anywhere — not here, not in the print, not in
            the shared view. It was a field nobody could reach.

            Deliberately not a place for passport numbers or anything else that
            should not be sitting in a saved trip, and the label says so rather
            than leaving somebody to guess. */}
        <label className="mt-5 block border-t border-[var(--gold-light)] pt-4">
          <span className={caption}>Your notes</span>
          <textarea
            rows={3}
            className={`${inputClass} min-h-24`}
            value={itin.notes ?? ""}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="Anything you want to remember — who has the key, where you parked, what to bring next time…"
          />
          <span className="mt-1.5 block text-xs font-normal leading-5 text-stone-500">
            Printed and shared with the trip — keep passport numbers and anything private out.
          </span>
        </label>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--gold-light)] pt-4">
          <span className={`${caption} mr-1`}>Add to trip</span>
          <button type="button" onClick={() => { setEditingFlightId(null); setTab(tab === "flight" ? null : "flight"); }} className="rounded-full border border-[var(--gold-light)] bg-white px-3.5 py-2 text-xs font-bold text-[var(--navy)] transition hover:border-[var(--gold)] hover:bg-[var(--cream-deep)]">Flight</button>
          <button type="button" onClick={() => { setEditingLodgingId(null); setTab(tab === "hotel" ? null : "hotel"); }} className="rounded-full border border-[var(--gold-light)] bg-white px-3.5 py-2 text-xs font-bold text-[var(--navy)] transition hover:border-[var(--gold)] hover:bg-[var(--cream-deep)]">Hotel</button>
          <button type="button" onClick={() => setTab(tab === "activity" ? null : "activity")} className="rounded-full border border-[var(--gold-light)] bg-white px-3.5 py-2 text-xs font-bold text-[var(--navy)] transition hover:border-[var(--gold)] hover:bg-[var(--cream-deep)]">Stop</button>
          <button type="button" onClick={importSavedRoute} className="rounded-full border border-[var(--gold-light)] bg-white px-3.5 py-2 text-xs font-bold text-[var(--navy)] transition hover:border-[var(--gold)] hover:bg-[var(--cream-deep)]">Saved route</button>
          <button type="button" onClick={() => setTab(tab === "import" ? null : "import")} className="rounded-full border border-[var(--gold-light)] bg-white px-3.5 py-2 text-xs font-bold text-[var(--navy)] transition hover:border-[var(--gold)] hover:bg-[var(--cream-deep)]">Smart Import</button>
          <button type="button" onClick={planMyRoute} disabled={planning} className="ml-auto rounded-full border border-[var(--navy)] bg-[var(--navy)] px-5 py-2.5 text-xs font-bold text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)] disabled:opacity-60">{planning ? "Planning…" : "Plan my route"}</button>
          {savedNote && <span className="text-xs font-semibold text-emerald-700">{savedNote}</span>}
          {planNote && <span className="text-xs font-semibold text-[var(--navy)]">{planNote}</span>}
        </div>
        {!hasDates && <p className="mt-3 text-xs font-semibold text-[var(--gold-ink)]">Choose start and end dates to begin.</p>}

        <div ref={editFormRef}>
        {tab === "flight" && (() => {
          const editing = itin.flights.find((x) => x.id === editingFlightId);
          return (
            <FlightForm
              key={editing?.id ?? "new"}
              startDate={itin.startDate}
              initial={editing}
              onAdd={(f) => {
                if (editing) updateFlight(f);
                else addFlight(f);
                setEditingFlightId(null);
                setTab(null);
              }}
              onRemove={editing ? () => { removeFlight(editing.id); setEditingFlightId(null); setTab(null); } : undefined}
              onCancel={() => { setEditingFlightId(null); setTab(null); }}
            />
          );
        })()}
        {tab === "hotel" && (
          <LodgingForm
            key={editingLodgingId ?? "new"}
            startDate={itin.startDate}
            initial={itin.lodging.find((l) => l.id === editingLodgingId)}
            onAdd={(l) => { saveLodging(l); setTab(null); setEditingLodgingId(null); }}
            onRemove={editingLodgingId ? () => { removeLodging(editingLodgingId); setTab(null); setEditingLodgingId(null); } : undefined}
            onCancel={() => { setTab(null); setEditingLodgingId(null); }}
          />
        )}
        {tab === "activity" && <ActivityForm startDate={itin.startDate} onAdd={(a) => { addActivity(a); setTab(null); }} itineraries={itineraries} />}
        {tab === "import" && <SmartImportPanel onImport={importSmartImportItems} onCancel={() => setTab(null)} />}
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <details className="group rounded-xl border border-[var(--gold-light)] bg-[#fcfaf6]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none">
            <span className="text-sm font-semibold text-[var(--navy)]">Travelers <span className="font-normal text-stone-400">({travelersOf(itin).length})</span></span>
            <span aria-hidden="true" className="text-lg text-[var(--gold-ink)] transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div className="border-t border-[var(--gold-light)] p-3">
            <TravelersPanel
              travelers={travelersOf(itin)}
              onChange={(travelers) => set({ travelers, travelerName: travelers[0]?.name ?? "" })}
              bookingFor={itin.bookingFor}
              onBookingFor={(bookingFor, traveler) => {
                const travelers = traveler ? [...travelersOf(itin), traveler] : travelersOf(itin);
                set({ bookingFor, travelers, travelerName: travelers[0]?.name ?? "" });
              }}
              tripId={tripId}
            />
          </div>
        </details>
        <details className="group rounded-xl border border-[var(--gold-light)] bg-[#fcfaf6]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none">
            <span className="text-sm font-semibold text-[var(--navy)]">Share this itinerary</span>
            <span aria-hidden="true" className="text-lg text-[var(--gold-ink)] transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div className="border-t border-[var(--gold-light)] space-y-3 p-3">
            <ShareItineraryPanel />
            {/* Renders nothing at all unless this is a Business account. */}
            <SendToClientPanel />
          </div>
        </details>
        <details className="group rounded-xl border border-[var(--gold-light)] bg-[#fcfaf6]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none">
            <span className="text-sm font-semibold text-[var(--navy)]">Rooms for this trip</span>
            <span aria-hidden="true" className="text-lg text-[var(--gold-ink)] transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div className="border-t border-[var(--gold-light)] p-3"><RoomGroupsPanel itin={itin} onChange={persist} /></div>
        </details>
      </div>

      <BookFlightsPanel itin={itin} />

      {/* Bookings summary + print */}
      {(itin.flights.length + itin.lodging.length + itin.activities.length) > 0 && (
        <div className="grid gap-3 md:grid-cols-3">
          <BookingList
            title="Flights"
            items={itin.flights.map((f) => {
              // A red-eye reads as leaving and landing on the same day unless
              // the list says otherwise, which is how a night in the air went
              // missing from the plan.
              const night = readOvernightFlight(f);
              const lands = night.arrivalDate > f.date ? ` → lands ${night.arrivalDate}` : "";
              return {
                id: f.id,
                label: `${f.from} → ${f.to}`,
                sub: `${f.date}${f.departTime ? " · " + f.departTime : ""}${lands}${night.overnight ? " · overnight" : ""}`,
              };
            })}
            onRemove={removeFlight}
            onEdit={(id) => { setEditingFlightId(id); setTab("flight"); }}
          />
          <BookingList title="Lodging" items={itin.lodging.map((l) => ({ id: l.id, label: l.type === "overnight-transit" ? `Overnight ${l.name || "transit"}` : l.name, sub: `${l.checkIn} → ${l.checkOut}` }))} onRemove={removeLodging} onEdit={(id) => { setEditingLodgingId(id); setTab("hotel"); }} />
          <BookingList title="Activities" items={itin.activities.map((a) => ({ id: a.id, label: a.name, sub: `${a.date}${a.startTime ? " · " + a.startTime : ""}` }))} onRemove={removeActivity} />
        </div>
      )}

      {/* Analysis + day-by-day */}
      {loaded && days.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-[var(--gold-light)] bg-[var(--cream-deep)] px-4 py-3">
            <Stat label="Nights" value={summary.nights} />
            <Stat label="Missing lodging" value={summary.nightsWithoutLodging} warn={summary.nightsWithoutLodging > 0} />
            <Stat label="Empty days" value={summary.emptyDays} warn={summary.emptyDays > 0} />
            <Stat label="Driving" value={`${summary.travelHours} h`} />
            {summary.overpackedDays > 0 && <Stat label="Over-packed days" value={summary.overpackedDays} warn />}
            <div className="ml-auto flex flex-wrap items-center gap-3">
              {/* Off until asked for. Somebody keeping the times wants them on
                  every day of the trip and on whichever phone they open it on,
                  so the answer is saved with the trip rather than the browser.
                  Not offered on Itineraries — no zmanim on that brand. */}
              {!itineraries && (
                <button
                  type="button"
                  onClick={() => set({ showZmanim: !itin.showZmanim })}
                  aria-pressed={Boolean(itin.showZmanim)}
                  className={`inline-flex h-14 items-center rounded-full border px-5 text-xs font-bold shadow-[0_4px_14px_rgba(23,45,82,.08)] transition ${
                    itin.showZmanim
                      ? "border-[var(--navy)] bg-[var(--navy)] text-white hover:bg-[var(--gold)]"
                      : "border-[var(--gold-light)] bg-white text-stone-500 hover:text-[var(--navy)]"
                  }`}
                >
                  {itin.showZmanim ? "Zmanim on" : "Show zmanim"}
                </button>
              )}
              <span className="relative grid h-14 w-[14rem] grid-cols-2 overflow-hidden rounded-full border border-[var(--gold-light)] bg-white p-1.5 shadow-[0_4px_14px_rgba(23,45,82,.08)]">
                <span aria-hidden="true" className={`absolute bottom-1.5 left-1.5 top-1.5 w-[calc(50%-0.375rem)] rounded-full bg-[var(--navy)] shadow-sm transition-transform duration-300 ease-out ${view === "calendar" ? "translate-x-full" : "translate-x-0"}`} />
                <button type="button" onClick={() => setView("days")} aria-pressed={view === "days"} className={`relative z-10 flex min-h-0 items-center justify-center rounded-full px-4 text-xs font-bold transition-colors duration-300 ${view === "days" ? "text-white" : "text-stone-500 hover:text-[var(--navy)]"}`}>Day view</button>
                <button type="button" onClick={() => setView("calendar")} aria-pressed={view === "calendar"} className={`relative z-10 flex min-h-0 items-center justify-center rounded-full px-4 text-xs font-bold transition-colors duration-300 ${view === "calendar" ? "text-white" : "text-stone-500 hover:text-[var(--navy)]"}`}>Calendar</button>
              </span>
              {/* The navy fill is a <span>, not the <a>: a global rule
                  (app/globals.css) forces a 0.75rem radius onto any anchor with
                  a bg- class, which overrode rounded-full and made the inner a
                  rounded rectangle inside the pill track. Mirroring the toggle
                  above — an absolutely-inset span under a transparent link —
                  keeps the fill immune to that rule. */}
              <span className="group relative inline-flex h-14 items-center overflow-hidden rounded-full border border-[var(--gold-light)] bg-white p-1.5 shadow-[0_4px_14px_rgba(23,45,82,.08)]">
                <span aria-hidden="true" className="absolute inset-1.5 rounded-full bg-[var(--navy)] transition-colors group-hover:bg-[var(--gold)]" />
                <Link href="/itinerary/print" target="_blank" className="relative z-10 inline-flex h-full items-center justify-center px-5 text-xs font-bold text-white">Print / PDF</Link>
              </span>
            </div>
          </div>

          {unscheduled.length > 0 && (
            <details open={unscheduledOpen} onToggle={(e) => setUnscheduledOpen(e.currentTarget.open)} className="group rounded-xl border border-dashed border-[var(--gold)] bg-[#fcfaf6]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">Not scheduled yet ({unscheduled.length})</span>
                <span aria-hidden="true" className="text-lg text-[var(--gold-ink)] transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <div className="border-t border-[var(--gold-light)] px-4 pb-4">
              <p className="mt-1 text-sm text-stone-600">Choose a day, or use <strong>Plan route</strong>.</p>
              <ul className="mt-3 space-y-2">
                {unscheduled.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--gold-light)] pt-2 first:border-t-0 first:pt-0">
                    <span className="min-w-0">
                      <span className="font-semibold text-[var(--navy)]">{a.name}</span>
                      {!a.coordinates && <span className="ml-2 text-xs text-amber-800">no location yet</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      <select value="" onChange={(e) => e.target.value && scheduleStop(a.id, e.target.value)} className="rounded-md border border-[var(--gold-light)] bg-white px-2 py-1 text-xs text-[var(--navy)]">
                        <option value="">Put on a day…</option>
                        {days.map((d) => <option key={d.date} value={d.date}>Day {d.index + 1} — {d.label}</option>)}
                      </select>
                      <button type="button" onClick={() => removeActivity(a.id)} className="text-xs text-stone-400 hover:text-red-700">✕</button>
                    </span>
                  </li>
                ))}
              </ul>
              </div>
            </details>
          )}

          {view === "calendar" ? (
            <CalendarView days={days} />
          ) : (
            <div className="space-y-4">
              {days.map((day) => (
                <DayCard
                  key={day.date}
                  day={day}
                  signedIn={Boolean(viewer?.signedIn)}
                  isToday={day.date === todayInTrip}
                  adjustments={itin.adjustments ?? []}
                  zmanim={zmanimForToday?.[day.date]}
                  onRecordAdjustment={recordAdjustment}
                  onClearAdjustments={clearAdjustments}
                  // Day one opens by default, except while the trip is running
                  // — then the day they are on does, and day one is history.
                  defaultOpen={todayInTrip ? day.date === todayInTrip : day.index === 0}
                  burials={burials}
                  itineraries={itineraries}
                  onMove={moveStopBy}
                  onUpdate={updateActivity}
                  onSetAttachments={setActivityAttachments}
                  onRemove={removeActivity}
                  onAddStop={addActivity}
                  onSaveLodging={saveLodging}
                  onRemoveLodging={removeLodging}
                  onAddFlight={addFlight}
                  onUpdateFlight={updateFlight}
                  onRemoveFlight={removeFlight}
                  allDates={days.map((d) => ({ date: d.date, label: d.label }))}
                />
              ))}
            </div>
          )}
        </>
      )}

      {loaded && days.length === 0 && (
        <div className="mt-8 border border-dashed border-[var(--gold-light)] p-10 text-center">
          <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Choose your dates to begin.</p>
          <p className="mt-2 text-sm text-stone-600">Then add flights, hotels, and stops.</p>
        </div>
      )}

      {/* "You have added somewhere we do not have — would you send it in?"
          The trip is theirs; nothing leaves it without this being answered. */}
      {offering && (
        <SendPlaceIn
          place={offering}
          from={{ name: viewer?.name?.trim() || "", email: viewer?.id ?? "" }}
          onAnswered={answerOffer}
        />
      )}
    </div>
  );
}

// ---- Day card with checks + suggestions ------------------------------

function CalendarView({ days }: { days: ReturnType<typeof buildDays> }) {
  const firstDate = days[0]?.date ? new Date(`${days[0].date}T12:00:00Z`) : null;
  const leading = firstDate ? firstDate.getUTCDay() : 0;
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <section className="rounded-2xl border border-[var(--gold-light)] bg-[#fcfaf6] p-3 sm:p-4">
      <div className="hidden grid-cols-7 gap-2 border-b border-[var(--gold-light)] pb-2 sm:grid">
        {weekdays.map((weekday) => <p key={weekday} className="text-center text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">{weekday}</p>)}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-7">
        {Array.from({ length: leading }).map((_, index) => <span key={`blank-${index}`} className="hidden min-h-28 sm:block" />)}
        {days.map((day) => {
          const date = new Date(`${day.date}T12:00:00Z`);
          return (
            <article key={day.date} className="min-h-28 rounded-xl border border-[var(--gold-light)] bg-white p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-bold text-[var(--navy)] sm:text-sm">{date.getUTCDate()}</p>
                <p className="text-[10px] text-stone-400 sm:hidden">{weekdays[date.getUTCDay()]}</p>
              </div>
              <div className="mt-2 space-y-1.5">
                {day.flightsArriving.length + day.flightsDeparting.length > 0 && <p className="truncate text-[10px] font-semibold text-[var(--gold-ink)]">✈ Flight</p>}
                {day.activities.slice(0, 3).map((activity) => (
                  <p key={activity.id} className="truncate text-xs font-semibold text-[var(--navy)]" lang={activity.yiddishName ? "yi" : undefined} dir={activity.yiddishName ? "rtl" : undefined}>
                    {activity.yiddishName || activity.name}
                  </p>
                ))}
                {day.activities.length > 3 && <p className="text-[10px] text-stone-400">+{day.activities.length - 3} more</p>}
                {day.lodging && <p className="truncate text-[10px] text-stone-500">🛏 {day.lodging.name}</p>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** "14:05" → 845. Anything else → null; nothing is guessed from a blank. */
function clockMins(t?: string): number | null {
  const m = t && /^(\d{1,2}):(\d{2})$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// A flight with no time keeps the place it has always had: an arrival opens the
// day, a departure closes it. These sit outside the 0–1439 clock so they cannot
// collide with a real time.
const OPENS_THE_DAY = -1;
const CLOSES_THE_DAY = 100000;

function DayCard({ day, isToday, defaultOpen, adjustments, zmanim, onRecordAdjustment, onClearAdjustments, burials, itineraries = false, signedIn, onMove, onUpdate, onSetAttachments, onRemove, onAddStop, onSaveLodging, onRemoveLodging, onAddFlight, onUpdateFlight, onRemoveFlight, allDates }: {
  day: ReturnType<typeof buildDays>[number];
  /** Today, on the traveler's own device. Marked, and opened. */
  isToday?: boolean;
  /** What actually happened, against the plan. Only asked about on the day. */
  adjustments: ItinAdjustment[];
  /** The day's halachic times, when the traveler has asked to see them. */
  zmanim?: ZmanimDay;
  onRecordAdjustment: (adjustment: ItinAdjustment) => void;
  onClearAdjustments: (dayKey: string) => void;
  defaultOpen?: boolean;
  /** Boarding passes need an account; without one there is nowhere to put them. */
  signedIn: boolean;
  burials: Record<string, string[]>;
  /** True on the White Glove Itineraries brand — no kosher tools here. */
  itineraries?: boolean;
  onMove: (id: string, direction: -1 | 1) => void;
  onUpdate: (a: ItinActivity) => void;
  /**
   * Only the attachments, by id.
   *
   * Not `onUpdate` with the whole row: what the day card holds is a
   * DayActivity, which carries worked-out arrival times and distances, and
   * writing one back would store the arithmetic as if the traveller had typed
   * it.
   */
  onSetAttachments: (id: string, attachments: ItinAttachment[]) => void;
  onRemove: (id: string) => void;
  /** Add straight onto this day, so a gap is filled where it is noticed. */
  onAddStop: (a: ItinActivity) => void;
  onSaveLodging: (l: ItinLodging) => void;
  onRemoveLodging: (id: string) => void;
  onAddFlight: (f: ItinFlight) => void;
  onUpdateFlight: (f: ItinFlight) => void;
  onRemoveFlight: (id: string) => void;
  allDates: Array<{ date: string; label: string }>;
}) {
  const [adding, setAdding] = useState<"stop" | "hotel" | "flight" | null>(null);
  const [editingFlight, setEditingFlight] = useState<string | null>(null);
  const [editingLodging, setEditingLodging] = useState(false);
  const [nearby, setNearby] = useState<Array<{ name: string; href: string; km: number }> | null>(null);
  const [ai, setAi] = useState<{ text?: string; reason?: string; suggestions?: Array<{ name: string; note?: string }> } | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(defaultOpen ?? day.index === 0);

  const anchor = day.activities.find((a) => a.coordinates) || (day.lodging?.coordinates ? { coordinates: day.lodging.coordinates } : null);
  const canSuggest = Boolean(anchor?.coordinates);
  const hasFreeTime = (day.freeHours ?? 0) >= 3;

  /**
   * A day spent entirely in the air has no free time to fill.
   *
   * Not "there is a flight today" — a morning landing leaves the whole day.
   * It is a day with flights and nothing else possible on the ground: no
   * stops, nowhere to sleep but the plane, or a flight that takes off and
   * lands on different days. Offering to fill that day is offering something
   * nobody can use.
   */
  const flyingAllDay =
    (day.flightsDeparting.length > 0 || day.flightsArriving.length > 0) &&
    day.activities.length === 0 &&
    (Boolean(day.overnightFlight) ||
      day.flightsDeparting.some((f) => flightArrivalDate(f) !== f.date) ||
      day.flightsArriving.some((f) => flightArrivalDate(f) !== f.date));

  async function showNearby() {
    if (!anchor?.coordinates) return;
    const exclude = day.activities.map((a) => a.name).join("|");
    const res = await fetch(`/api/itinerary/nearby?coordinates=${encodeURIComponent(anchor.coordinates)}&exclude=${encodeURIComponent(exclude)}`);
    const data = await res.json().catch(() => ({ suggestions: [] }));
    setNearby(data.suggestions ?? []);
  }
  async function askAi() {
    setLoadingAi(true);
    const location = day.activities[0]?.address || day.activities[0]?.name || day.lodging?.address || day.lodging?.name || "";
    const res = await fetch("/api/itinerary/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location, date: day.label, freeHours: day.freeHours, alreadyPlanned: day.activities.map((a) => a.name) }),
    });
    const data = await res.json().catch(() => ({ available: false, reason: "Failed." }));
    setAi(data.available ? { text: data.text, suggestions: data.suggestions } : { reason: data.reason });
    setLoadingAi(false);
  }

  // The day is drawn in clock order.
  //
  // It used to be drawn in a fixed sequence — every arrival, then the stops,
  // then every departure — whatever the times said. So a flight leaving at
  // 07:00 was printed at the bottom of the day, under stops that happen hours
  // after the traveler is already in the air, and a landing at 22:00 was
  // printed at the top. This builds one ordered list instead, which is what
  // the printed itinerary has always done.
  //
  // Two rules keep it honest. Nothing is given a time it does not have: an
  // untimed flight falls back to the end of the day it was already at. And the
  // stops never reorder among themselves — their order is the driving order,
  // which the ↑↓ buttons own — so a stop that runs past midnight cannot wrap
  // its clock back to 00:30 and jump to the top of the day.
  const timeline: Array<{ at: number; node: React.ReactNode }> = [];
  const place = (at: number, node: React.ReactNode) => timeline.push({ at, node });

  // One journey may have been entered as two flights — JFK → AMS and then
  // AMS → KRK. The line drawn is the journey; the form opened is whichever LEG
  // was pressed, because the legs are what the traveler actually saved and
  // editing the journey would write one flight over both.
  const flightBlock = (f: ItinJourney, direction: "arrive" | "depart") => {
    const openLeg = f.legs.find((l) => l.id === editingFlight);
    const toggleLeg = (id: string) => setEditingFlight(editingFlight === id ? null : id);
    return (
      <div key={`${direction}-${f.id}`}>
        <FlightLine
          flight={f}
          direction={direction}
          landsSameDay={direction === "depart" && day.flightsArriving.some((a) => a.id === f.id)}
          onEdit={() => toggleLeg(f.legs[0].id)}
          onEditLeg={toggleLeg}
        />
        {openLeg && (
          <FlightForm
            key={openLeg.id}
            startDate={day.date}
            initial={openLeg}
            onAdd={(next) => { onUpdateFlight(next); setEditingFlight(null); }}
            onRemove={() => { onRemoveFlight(openLeg.id); setEditingFlight(null); }}
            onCancel={() => setEditingFlight(null)}
          />
        )}
        {/* The pass goes on the LEG, not the journey. A connection entered as
            two flights has two passes, and the journey is a reading of them
            rather than a thing that exists to hang a file on. */}
        {f.legs.map((legFlight) => (
          <StopAttachments
            key={legFlight.id}
            attachments={legFlight.attachments}
            signedIn={signedIn}
            onChange={(attachments) => onUpdateFlight({ ...legFlight, attachments })}
          />
        ))}
      </div>
    );
  };

  for (const f of day.flightsArriving) {
    // A flight that takes off and lands on the same day is one flight, not
    // two. It belongs to both of the day's lists, and while departures were
    // drawn at the bottom and arrivals at the top nobody noticed the same
    // flight was on the page twice. In clock order the two land next to each
    // other, so it is drawn once — on its departure, which carries the
    // landing time — and skipped here.
    if (day.flightsDeparting.some((d) => d.id === f.id)) continue;
    place(clockMins(f.arriveTime) ?? OPENS_THE_DAY, flightBlock(f, "arrive"));
  }

  // The drive that opens the day happens at the moment the day starts, and the
  // one that closes it at the moment the day ends — so the drive to the
  // airport lands next to the flight it is for.
  let cursor = clockMins(day.startTime) ?? 8 * 60;
  const openingLeg = day.travelLegs.find((l) => l.kind === "arrive-airport" || l.kind === "from-lodging");
  if (openingLeg) place(cursor, <TransferLine key="opening-leg" leg={openingLeg} />);

  day.activities.forEach((a, i) => {
    cursor = Math.max(cursor, clockMins(a.arrivalTime ?? a.startTime) ?? cursor);
    const borderOnThisLeg = day.travelLegs.find(
      (leg) => leg.kind === "stop" && leg.toCoordinates === a.coordinates && leg.borderMinutes,
    );
    place(cursor, (
      <div key={a.id} className="rounded-xl border border-[var(--gold-light)] bg-white p-3.5 sm:p-4">
        {a.distanceFromPrev !== null && (
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-5 text-stone-500">
            <span aria-hidden="true">↓</span>
            <span>{formatKm(a.distanceFromPrev)}</span>
            <span>·</span>
            <span>{a.travelIsMeasured ? "" : "≈"}{formatDuration(a.travelMinutesFromPrev)} from previous stop</span>
            <TimeSource source={a.travelSource} />
            {/* Which crossing, and whether the figure is something somebody
                checked or an allowance nobody has. The traveller can act on
                the difference; a lump sum hides it. */}
            {borderOnThisLeg?.borderSays ? (
              <span className="basis-full text-amber-800">including {borderOnThisLeg.borderSays}</span>
            ) : null}{" "}
            <a
              href={directionsBetweenUrl({ address: day.activities[i - 1]?.address, coordinates: day.activities[i - 1]?.coordinates }, { address: a.address, coordinates: a.coordinates })}
              target="_blank"
              rel="noreferrer"
              className="normal-case tracking-normal text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2"
            >
              exact time →
            </a>
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <p className="min-w-0 font-[family-name:var(--font-display)] text-lg leading-snug text-[var(--navy)] sm:text-xl">
            <span className="mr-2 text-sm font-bold text-[var(--gold-ink)]">{i + 1}.</span>
            {a.arrivalTime ? (
              <span className={`mr-2 text-sm font-semibold ${a.arrivesLate ? "text-red-700" : "text-[var(--gold-ink)]"}`} title={a.arrivesLate ? `Scheduled for ${a.startTime}, but the driving does not allow it` : "Worked out from your start time and the driving"}>
                {a.arrivalTime}
                {a.departureTime ? <span className="font-normal text-stone-400">–{a.departureTime}</span> : null}
              </span>
            ) : a.startTime ? (
              <span className="mr-2 text-sm font-semibold text-[var(--gold-ink)]">{a.startTime}</span>
            ) : null}
            <span lang={a.yiddishName ? "yi" : undefined} dir={a.yiddishName ? "rtl" : undefined}>{a.yiddishName || a.name}</span>
            {a.yiddishName ? <span className="ml-2 font-sans text-xs font-medium text-stone-500" lang="en" dir="ltr">{a.name}</span> : null}
          </p>
          <span className="flex flex-wrap items-center gap-1 sm:justify-end">
            {day.activities.length > 1 && (
              <>
                <button type="button" onClick={() => onMove(a.id, -1)} disabled={i === 0} aria-label={`Move ${a.name} earlier`} className="border border-[var(--gold-light)] px-2 py-0.5 text-xs text-[var(--navy)] transition hover:bg-[var(--cream-deep)] disabled:opacity-30">↑</button>
                <button type="button" onClick={() => onMove(a.id, 1)} disabled={i === day.activities.length - 1} aria-label={`Move ${a.name} later`} className="border border-[var(--gold-light)] px-2 py-0.5 text-xs text-[var(--navy)] transition hover:bg-[var(--cream-deep)] disabled:opacity-30">↓</button>
              </>
            )}
            <button type="button" onClick={() => setEditingId(editingId === a.id ? null : a.id)} className="border border-[var(--gold)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white">
              {editingId === a.id ? "Close" : "Edit"}
            </button>
          </span>
        </div>
        {editingId === a.id && (
          <EditStopForm
            activity={a}
            allDates={allDates}
            onSave={(updated) => { onUpdate(updated); setEditingId(null); }}
            onRemove={() => { onRemove(a.id); setEditingId(null); }}
            onCancel={() => setEditingId(null)}
          />
        )}
        {a.address && <p className="mt-2 break-words text-sm leading-6 text-stone-600">{a.address}</p>}
        {/* The ticket for this stop, kept on the stop. Only the traveller can
            open it; it is stripped from anything shared or printed. */}
        <StopAttachments
          attachments={a.attachments}
          signedIn={signedIn}
          onChange={(attachments) => onSetAttachments(a.id, attachments)}
        />
        {/* No location means no driving time and an overstated free day.
            Say it on the stop, with the way to fix it right there. */}
        {!a.coordinates && editingId !== a.id && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-amber-800">
            <span>No address yet, so the driving to it is not counted.</span>
            <button
              type="button"
              onClick={() => setEditingId(a.id)}
              className="border border-[var(--gold)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white"
            >
              Add the address
            </button>
          </p>
        )}
        {/* Who you are going to daven by. The reason for the stop belongs
            on the stop, not one click away on the cemetery page. */}
        {!itineraries && a.keverSlug && (burials[a.keverSlug]?.length ?? 0) > 0 && (
          <details className="mt-3 rounded-lg bg-[var(--cream)] px-3 py-2 text-sm text-stone-700">
            <summary className="cursor-pointer font-semibold text-[var(--gold-ink)]">Who is buried here ({burials[a.keverSlug].length})</summary>
            <p className="mt-1 break-words leading-6">{burials[a.keverSlug].join(" · ")}</p>
          </details>
        )}
        {(a.phone || a.href || a.address || a.coordinates) && (
          <p className="mt-3 flex flex-wrap gap-2 text-sm">
            {/* Every stop gets its own navigate link, including the first
                one of the day. Leaving the destination alone lets Google
                Maps route from wherever the traveler actually is, which is
                the only sensible origin for the first stop — there is no
                previous stop to start from. */}
            {(a.address || a.coordinates) && (
              <a href={placeDirectionsUrl(a.address, a.coordinates)} target="_blank" rel="noreferrer" className="rounded-md border border-[var(--gold-light)] px-3 py-1.5 font-semibold text-[var(--navy)]">Navigate →</a>
            )}
            {a.phone && <a href={`tel:${a.phone.replace(/[^\d+]/g, "")}`} className="rounded-md border border-[var(--gold-light)] px-3 py-1.5 font-semibold text-[var(--navy)]">Call {a.phone}</a>}
            {/* An internal (/-prefixed) href on a stop only ever came from the
                kosher "Nearby" feature (a /cemeteries/[slug] link), which
                307-redirects to the kosher domain — so on itineraries a stale or
                imported one is suppressed rather than rendered as a Details link
                that would break the app. External booking links are unaffected. */}
            {a.href && (a.href.startsWith("/") ? (!itineraries && <Link href={a.href} className="rounded-md border border-[var(--gold-light)] px-3 py-1.5 font-semibold text-[var(--navy)]">Details →</Link>) : <a href={a.href} target="_blank" rel="noreferrer" className="rounded-md border border-[var(--gold-light)] px-3 py-1.5 font-semibold text-[var(--navy)]">Open link →</a>)}
          </p>
        )}
        {a.notes && <p className="mt-3 break-words text-sm leading-6 text-stone-500">{a.notes}</p>}
      </div>
    ));
  });

  const closingLeg = day.travelLegs.find((l) => l.kind === "to-lodging" || l.kind === "depart-airport");
  if (closingLeg) place(Math.max(cursor, clockMins(day.endTime) ?? cursor), <TransferLine key="closing-leg" leg={closingLeg} />);

  for (const f of day.flightsDeparting) {
    place(clockMins(f.departTime) ?? CLOSES_THE_DAY, flightBlock(f, "depart"));
  }

  // Same time means the order they were added in — the drive to a stop before
  // the stop, the landing before the day that starts with it.
  const ordered = timeline
    .map((entry, i) => ({ entry, i }))
    .sort((a, b) => a.entry.at - b.entry.at || a.i - b.i)
    .map((x) => x.entry.node);

  return (
    <details
      id={`trip-day-${day.date}`}
      className={`group overflow-hidden rounded-2xl border shadow-[0_8px_24px_rgba(23,45,82,.045)] ${
        isToday ? "border-[var(--gold)] bg-[#fffdf4] ring-1 ring-[var(--gold-light)]" : "border-[var(--gold-light)] bg-[#fcfaf6]"
      }`}
      open={expanded}
      onToggle={(e) => setExpanded(e.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none flex-col gap-2 px-4 py-4 marker:content-none sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <span className="flex min-w-0 items-baseline gap-3">
          <span className="font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">Day {day.index + 1}</span>
          {isToday && (
            <span className="rounded-full bg-[var(--gold)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
              Today
            </span>
          )}
          <span className="truncate text-sm font-semibold text-stone-500">{day.label}</span>
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
          <span>{day.activities.length} {day.activities.length === 1 ? "stop" : "stops"}</span>
          {day.startTime && day.activities.length > 0 ? (
            <span>
              {day.startsFrom ? `From ${day.startsFrom}, ` : ""}{day.startTime}
              {day.endTime ? ` → ${day.endTime}` : ""}
            </span>
          ) : null}
          {day.travelHours > 0 ? (
            <span className="text-stone-400">
              {day.travelLegs.every((l) => l.measured) ? "" : "≈"}
              {day.travelHours} h driving
              {day.travelLegs.every((l) => l.source === "google") ? " (Google Maps)" : ""}
              {/* Said apart from the driving, and inside the total. "Seven
                  hours" says leave early; "five driving, two at the border"
                  says leave early AND that six in the morning may save one. */}
              {borderIsWorthSaying(day.borderMinutes) ? (
                <span className="text-amber-800"> · {formatWait(day.borderMinutes)} of it at the border</span>
              ) : null}
            </span>
          ) : null}
          {day.warnings.length > 0 && <span className="font-semibold text-amber-800">{day.warnings.length} {day.warnings.length === 1 ? "notice" : "notices"}</span>}
          <span aria-hidden="true" className="ml-1 text-lg leading-none text-[var(--gold-ink)] transition-transform group-open:rotate-180">⌄</span>
        </span>
      </summary>

      <div className="border-t border-[var(--gold-light)] px-4 pb-5 sm:px-5">
        {/* Only on the day itself. A trip three weeks away has nothing to say
            about how it is going, and a row of "are you running late?" buttons
            on every day of a fortnight would be noise on thirteen of them. */}
        {/* Above the day's own notices, because the times govern the day rather
            than comment on it — a Friday's candle-lighting decides when the
            driving has to stop. */}
        <DayZmanim zmanim={zmanim} />

        {isToday && (
          <DayProgress
            dayKey={day.date}
            adjustments={adjustments}
            stopsLeft={day.activities.length}
            typicalStopMins={90}
            onRecord={onRecordAdjustment}
            onClear={() => onClearAdjustments(day.date)}
          />
        )}

        {/* A warning that can be acted on carries the button to act on it, on
            the day it is about. Being told on day 4 that day 4 has nowhere to
            sleep, and then having to scroll back to the top of the page and
            pick the date again, is how a gap stays a gap. */}
        {day.warnings.map((w, i) => {
          const needsBed = w.startsWith("No place");
          const needsStops = w.startsWith("Nothing planned");
          return (
            <div key={i} className={`mt-3 rounded-r-md border-l-4 px-3 py-2 text-sm ${needsBed ? "border-red-400 bg-red-50 text-red-800" : "border-[var(--gold)] bg-[var(--cream)] text-stone-700"}`}>
              <p>{w}</p>
              {(needsBed || needsStops) && (
                <button
                  type="button"
                  onClick={() => setAdding(needsBed ? "hotel" : "stop")}
                  className="mt-2 rounded-full border border-[var(--navy)] bg-[var(--navy)] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]"
                >
                  {needsBed ? "Add where you sleep" : "Add a stop to this day"}
                </button>
              )}
            </div>
          );
        })}

      <div className="mt-4 space-y-4">{ordered}</div>

      <p className="mt-5 rounded-lg bg-[var(--cream)] px-3 py-2.5 text-sm">
        <span className={caption}>Tonight</span>{" "}
        {day.lodging ? (
          <span className="text-[var(--navy)]">🛏️ {day.lodging.type === "overnight-transit" ? `Overnight ${day.lodging.name || "bus/flight"}` : day.lodging.name}{day.lodging.address ? ` — ${day.lodging.address}` : ""}{day.lodging.phone ? <> · <a href={`tel:${day.lodging.phone.replace(/[^\d+]/g, "")}`} className="underline decoration-[var(--gold)] underline-offset-2">📞 {day.lodging.phone}</a></> : null}
            {day.lodging.confirmation ? <span className="ml-2 text-xs font-semibold text-stone-500">ref {day.lodging.confirmation}</span> : null}
            {/* Changed here, on the night it is about. The hotel was the one
                thing on a day that could only be edited from the top of the
                page, which meant scrolling away from the day to fix it. */}
            <button
              type="button"
              onClick={() => setEditingLodging((v) => !v)}
              className="ml-2 border border-[var(--gold)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white"
            >
              {editingLodging ? "Close" : "Edit"}
            </button>
          </span>
        ) : day.overnightFlight ? (
          <span className="text-[var(--navy)]">
            ✈️ On the flight — {flightRouteLabel(day.overnightFlight)}
            {day.overnightFlight.airline ? ` (${day.overnightFlight.airline}${day.overnightFlight.flightNo ? ` ${day.overnightFlight.flightNo}` : ""})` : ""}
            {day.overnightFlight.departTime ? `, departing ${day.overnightFlight.departTime}` : ""}
            <span className="ml-2 text-xs text-stone-500">no hotel needed tonight</span>
          </span>
        ) : (
          <span className="text-stone-400">— not set —</span>
        )}
      </p>
      {day.lodging && (
        <StopAttachments
          attachments={day.lodging.attachments}
          signedIn={signedIn}
          onChange={(attachments) => onSaveLodging({ ...day.lodging!, attachments })}
        />
      )}
      {day.lodging && editingLodging && (
        <LodgingForm
          startDate={day.date}
          initial={day.lodging}
          onAdd={(l) => { onSaveLodging(l); setEditingLodging(false); }}
          onRemove={() => { onRemoveLodging(day.lodging!.id); setEditingLodging(false); }}
          onCancel={() => setEditingLodging(false)}
        />
      )}

      {/* Filling the day in, on the day. Both forms open with this date
          already set, so nothing has to be chosen twice. */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--gold-light)] pt-3">
        <span className={caption}>Add to this day</span>
        <button type="button" onClick={() => setAdding(adding === "stop" ? null : "stop")} className="border border-[var(--gold-light)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:bg-[var(--cream-deep)]">
          {adding === "stop" ? "Close" : "+ Stop"}
        </button>
        <button type="button" onClick={() => setAdding(adding === "hotel" ? null : "hotel")} className="border border-[var(--gold-light)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:bg-[var(--cream-deep)]">
          {adding === "hotel" ? "Close" : day.lodging ? "+ Change where you sleep" : "+ Where you sleep"}
        </button>
        <button type="button" onClick={() => setAdding(adding === "flight" ? null : "flight")} className="border border-[var(--gold-light)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:bg-[var(--cream-deep)]">
          {adding === "flight" ? "Close" : "+ Flight"}
        </button>
      </div>

      {adding === "stop" && (
        <ActivityForm
          startDate={day.date}
          onAdd={(a) => {
            onAddStop({ ...a, date: a.date || day.date });
            setAdding(null);
          }}
          itineraries={itineraries}
        />
      )}
      {adding === "hotel" && (
        <LodgingForm
          startDate={day.date}
          onAdd={(l) => {
            onSaveLodging(l);
            setAdding(null);
          }}
        />
      )}
      {/* The same form as the one at the top, so the flight-number lookup is
          here too — the day you are looking at is the day you have the
          booking email open for. */}
      {adding === "flight" && (
        <FlightForm
          startDate={day.date}
          onAdd={(f) => {
            onAddFlight(f);
            setAdding(null);
          }}
          onCancel={() => setAdding(null)}
        />
      )}

      {/* Free time is offered on every day, because a day with three stops
          still has an evening in it and the traveler is the one who knows.
          The single exception is a day spent in the air, where there is no
          free time to fill. */}
      {flyingAllDay ? (
        <p className="mt-4 border-t border-[var(--gold-light)] pt-3 text-xs leading-5 text-stone-500">
          In the air most of this day — nothing to fill.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--gold-light)] pt-3">
          <span className={`text-[11px] font-bold uppercase tracking-[0.1em] ${hasFreeTime ? "text-[var(--gold-ink)]" : "text-stone-400"}`}>
            {hasFreeTime ? `Free time — about ${day.freeHours} h` : "Free time"}
          </span>
          {/* "Nearby" surfaces only cemeteries/kevarim (lib/nearby.ts), and each
              suggestion links to /cemeteries/[slug] — a guide-only path that
              307-redirects to the kosher domain and breaks the installed
              itineraries app. So it is a kosher-brand feature: hidden here, the
              same as the kosher-food-near-this-day block below. */}
          {!itineraries && canSuggest && <button type="button" onClick={showNearby} className="border border-[var(--gold-light)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:bg-[var(--cream-deep)]">Nearby</button>}
          <button type="button" onClick={askAi} disabled={loadingAi} className="border border-[var(--gold-light)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:bg-[var(--cream-deep)] disabled:opacity-60">{loadingAi ? "Getting ideas…" : "Ideas for free time"}</button>
        </div>
      )}
      {nearby && (
        <div className="mt-3 text-sm text-stone-600">
          {nearby.length === 0 ? <p className="text-stone-400">No listed sites found within range.</p> : (
            <ul className="space-y-1">{nearby.map((n) => (
              <li key={n.href} className="flex flex-wrap items-center gap-2">
                <Link href={n.href} className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">{n.name}</Link>
                <span className="text-stone-400">· {formatKm(n.km)}</span>
                {/* One click drops the listed place onto this day as a stop.
                    No coordinates come back with the suggestion, so it lands
                    without a travel-time until an address is added — which the
                    edit form does. */}
                <button
                  type="button"
                  onClick={() => {
                    onAddStop({ id: uid(), name: n.name, href: n.href, date: day.date });
                    setNearby((cur) => (cur ? cur.filter((x) => x.href !== n.href) : cur));
                  }}
                  className="ml-auto border border-[var(--gold-light)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:bg-[var(--cream-deep)]"
                >
                  Add to this day
                </button>
              </li>
            ))}</ul>
          )}
        </div>
      )}
      {ai && (
        <div className="mt-3 border border-[var(--gold-light)] bg-white text-sm text-stone-700">
          {/* Scrolls rather than clipping when the assistant gives several ideas. */}
          <div className="max-h-72 overflow-y-auto overscroll-contain p-3">
            {ai.suggestions?.length ? (
              <>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gold-ink)]">AI ideas — check the details before you rely on them</p>
                <ul className="space-y-2">
                  {ai.suggestions.map((s) => (
                    <li key={s.name} className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[var(--navy)]">{s.name}</span>
                      {s.note ? <span className="text-stone-500">· {s.note}</span> : null}
                      <button
                        type="button"
                        onClick={() => {
                          onAddStop({ id: uid(), name: s.name, notes: s.note, date: day.date });
                          setAi((cur) => (cur ? { ...cur, suggestions: cur.suggestions?.filter((x) => x.name !== s.name) } : cur));
                        }}
                        className="ml-auto border border-[var(--gold-light)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:bg-[var(--cream-deep)]"
                      >
                        Add to this day
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : ai.text ? <AssistantAnswer answer={ai.text} /> : <p className="text-stone-500">{ai.reason}</p>}
          </div>
        </div>
      )}
      {!itineraries && anchor?.coordinates && (
        <details className="group/food mt-4 rounded-xl border border-[var(--gold-light)] bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[var(--navy)] marker:content-none">
            Kosher food near this day
            <span aria-hidden="true" className="text-lg text-[var(--gold-ink)] transition-transform group-open/food:rotate-180">⌄</span>
          </summary>
          <div className="border-t border-[var(--gold-light)] p-3">
            <KosherNearby coordinates={anchor.coordinates} radiusKm={12} showAddToTrip heading="Kosher food near this day's stops" />
          </div>
        </details>
      )}
      </div>
    </details>
  );
}

// ---- Small pieces -----------------------------------------------------

// Change anything about a stop that is already on the route — how long you
// stay, the time, a phone number, the address, or which day it belongs to.
function EditStopForm({ activity, allDates, onSave, onRemove, onCancel }: {
  activity: ItinActivity;
  allDates: Array<{ date: string; label: string }>;
  onSave: (a: ItinActivity) => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<ItinActivity>({ ...activity });
  return (
    <div className="mt-3 rounded-md border border-[var(--gold)] bg-white p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">Edit this stop</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Name"><input className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Address"><AddressAutocomplete value={f.address ?? ""} onChange={(address, coords) => setF({ ...f, address, coordinates: coords || f.coordinates })} className={inputClass} placeholder="Start typing the address…" /></Field>
        <Field label="Coordinates"><input className={inputClass} value={f.coordinates ?? ""} onChange={(e) => setF({ ...f, coordinates: e.target.value })} placeholder="lat, lng — needed for travel time" /></Field>
        <Field label="Day"><select className={inputClass} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value, order: undefined })}><option value="">Not scheduled</option>{allDates.map((d, i) => <option key={d.date} value={d.date}>Day {i + 1} — {d.label}</option>)}</select></Field>
        <Field label="Start time"><input type="time" className={inputClass} value={f.startTime ?? ""} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></Field>
        <Field label="How long (minutes)"><input type="number" min={0} step={15} className={inputClass} value={f.durationMins ?? ""} onChange={(e) => setF({ ...f, durationMins: Number(e.target.value) || undefined })} placeholder="90" /></Field>
        <Field label="Phone"><input type="tel" className={inputClass} value={f.phone ?? ""} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Link"><input type="url" className={inputClass} value={f.href ?? ""} onChange={(e) => setF({ ...f, href: e.target.value })} /></Field>
        <Field label="Notes"><input className={inputClass} value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => onSave(f)} className="border border-[var(--navy)] bg-[var(--navy)] px-5 py-2 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] hover:border-[var(--gold)]">Save changes</button>
        <button type="button" onClick={onCancel} className="border border-[var(--gold-light)] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]">Cancel</button>
        <button type="button" onClick={onRemove} className="ml-auto text-xs text-stone-400 hover:text-red-700">Remove this stop</button>
      </div>
    </div>
  );
}

/**
 * Where a driving time came from. A traveler planning a day around a number
 * should be able to see whether it is Google's own answer for typical traffic,
 * an open-router figure that assumes the roads are empty, or our own estimate.
 */
function TimeSource({ source }: { source?: "google" | "osrm" }) {
  if (source === "google") {
    return <span className="normal-case tracking-normal text-emerald-700" title="From Google Maps, for an ordinary day's traffic">· Google Maps</span>;
  }
  if (source === "osrm") {
    return <span className="normal-case tracking-normal text-stone-400" title="Measured on real roads, but with no traffic allowance — treat it as a floor">· road routing, no traffic</span>;
  }
  return <span className="normal-case tracking-normal text-stone-400" title="Our own estimate — routing was not available for this leg">· estimate</span>;
}

// A transfer to/from the hotel or the airport — travel that also eats the day.
function TransferLine({ leg }: { leg?: TravelLeg }) {
  if (!leg) return null;
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-400">
      🚗 {leg.label} — {formatKm(leg.km)} · {leg.measured ? "" : "≈"}{formatDuration(leg.minutes)} <TimeSource source={leg.source} />{" "}
      <a
        href={directionsBetweenUrl({ coordinates: leg.fromCoordinates }, { coordinates: leg.toCoordinates })}
        target="_blank"
        rel="noreferrer"
        className="normal-case tracking-normal text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2"
      >
        exact time →
      </a>
    </p>
  );
}

function Stat({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div>
      <p className={`font-[family-name:var(--font-display)] text-2xl ${warn ? "text-red-700" : "text-[var(--navy)]"}`}>{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">{label}</p>
    </div>
  );
}

function BookingList({ title, items, onRemove, onEdit }: {
  title: string;
  items: Array<{ id: string; label: string; sub: string }>;
  onRemove: (id: string) => void;
  /** Present when the entry can be opened and changed rather than only deleted. */
  onEdit?: (id: string) => void;
}) {
  return (
    <details className="group border border-[var(--gold-light)] bg-[#fcfaf6]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 marker:content-none">
        <span className={caption}>{title} ({items.length})</span>
        <span aria-hidden="true" className="text-lg leading-none text-[var(--gold-ink)] transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <ul className="space-y-2 border-t border-[var(--gold-light)] px-4 pb-4 pt-3">
        {items.length === 0 ? <li className="text-sm text-stone-400">None yet.</li> : items.map((it) => (
          <li key={it.id} className="flex items-start justify-between gap-2 text-sm">
            <span className="min-w-0"><span className="font-semibold text-[var(--navy)]">{it.label}</span><br /><span className="text-xs text-stone-500">{it.sub}</span></span>
            <span className="flex shrink-0 items-center gap-2">
              {onEdit && (
                <button type="button" onClick={() => onEdit(it.id)} className="border border-[var(--gold)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white">Edit</button>
              )}
              <button type="button" onClick={() => onRemove(it.id)} aria-label={`Remove ${it.label}`} className="text-xs text-stone-400 hover:text-red-700">✕</button>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Adding a flight, and editing one already on the trip.
 *
 * The same form does both on purpose. A flight that can only be deleted and
 * re-entered loses its connections and its booking reference, and a second
 * form built just for editing would drift away from this one — different
 * fields, a lookup on one and not the other.
 */
function FlightForm({ startDate, initial, onAdd, onRemove, onCancel }: {
  startDate: string;
  /** The flight being edited. Absent when adding a new one. */
  initial?: ItinFlight;
  onAdd: (f: ItinFlight) => void;
  onRemove?: () => void;
  onCancel?: () => void;
}) {
  const [f, setF] = useState<Partial<ItinFlight>>(initial ?? { date: startDate });
  const [lookupNo, setLookupNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  // The onward segment, looked up by its own number.
  const [legNo, setLegNo] = useState("");
  const [legBusy, setLegBusy] = useState(false);
  const [legStatus, setLegStatus] = useState("");

  useEffect(() => {
    if (startDate) setF((prev) => (prev.date ? prev : { ...prev, date: startDate }));
  }, [startDate]);

  function updateFlight(patch: Partial<ItinFlight>) {
    setF((prev) => ({ ...prev, ...patch }));
    if (error) setError("");
  }

  function submitFlight() {
    const from = f.from?.trim();
    const to = f.to?.trim();
    const date = f.date?.trim();
    const missing = [
      !from ? "departure airport" : "",
      !to ? "arrival airport" : "",
      !date ? "flight date" : "",
    ].filter(Boolean);
    if (missing.length) {
      setError(`Please add the ${missing.join(", ")}.`);
      return;
    }
    onAdd({
      // Editing keeps the id, so the flight is changed rather than replaced —
      // its connections and its booking reference come with it.
      id: initial?.id ?? uid(),
      from: from!,
      to: to!,
      date: date!,
      airline: f.airline?.trim() || undefined,
      flightNo: f.flightNo?.trim() || undefined,
      departTime: f.departTime,
      arriveTime: f.arriveTime,
      arriveDate: f.arriveDate,
      stops: (f.stops ?? []).filter((x) => x.airport.trim()),
      notes: f.notes,
      confirmation: f.confirmation?.trim() || undefined,
      bookedOnSite: initial?.bookedOnSite ?? false,
    });
  }

  // A red-eye is worked out from the times rather than asked about — almost
  // nobody fills in an arrival date, and a flight landing the morning after is
  // the normal way to reach Europe. This shows what was worked out while the
  // times are being typed, so a wrong reading can be corrected on the spot
  // instead of quietly putting the landing on the wrong day.
  const overnight = useMemo(
    () =>
      f.date
        ? readOvernightFlight({
            id: "draft",
            from: f.from ?? "",
            to: f.to ?? "",
            date: f.date,
            departTime: f.departTime,
            arriveTime: f.arriveTime,
            arriveDate: f.arriveDate,
            stops: f.stops,
          })
        : null,
    [f],
  );

  async function runLookup() {
    const flightNumber = lookupNo.trim();
    if (!flightNumber) { setStatus("Enter a flight number to look up."); return; }
    const date = f.date || startDate;
    if (!date) { setStatus("Choose the flight date first."); return; }
    setBusy(true);
    setStatus("Looking up…");
    try {
      const res = await fetch("/api/flights/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flightNumber, date }),
      });
      const data = await res.json();
      if (data?.available && data.flight) {
        setF((prev) => ({ ...prev, ...data.flight }));
        setError("");
        setStatus(
          `Found: ${data.flight.airline || data.flight.flightNo} ${data.flight.from} → ${data.flight.to}` +
            (data.moreResults ? ` (+${data.moreResults} more — edit if needed)` : ""),
        );
      } else {
        setStatus(data?.reason || "Flight not found — enter the details by hand.");
      }
    } catch {
      setStatus("Lookup failed — enter the details by hand.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Add the next segment of the same ticket by its flight number.
   *
   * A ticket routed JFK → Amsterdam → Kraków is two flight numbers, and both
   * are printed on it, so the natural thing is to type the second one. Doing
   * that in the box at the top would overwrite the first segment; entering it
   * as a separate flight is what made the planner invent a free day in
   * Amsterdam. This extends the journey instead: where it lands now becomes a
   * connection, and the journey now ends where the new segment ends.
   */
  async function addNextSegment() {
    const flightNumber = legNo.trim();
    if (!flightNumber) { setLegStatus("Enter the next flight number."); return; }
    if (!f.to?.trim()) { setLegStatus("Fill in where this flight lands first — that becomes the connection."); return; }
    // The onward leg leaves on the day this one lands, which is not always the
    // day it left. Asking the schedule service for the wrong date finds nothing.
    const date = f.date
      ? flightArrivalDate({ id: "draft", from: f.from ?? "", to: f.to ?? "", date: f.date, departTime: f.departTime, arriveTime: f.arriveTime, arriveDate: f.arriveDate, stops: f.stops })
      : startDate;
    if (!date) { setLegStatus("Choose the flight date first."); return; }
    setLegBusy(true);
    setLegStatus("Looking up…");
    try {
      const res = await fetch("/api/flights/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flightNumber, date }),
      });
      const data = await res.json();
      const next = data?.available ? data.flight : null;
      if (!next) {
        setLegStatus(data?.reason || `No flight ${flightNumber} found on ${date} — add the stop by hand below.`);
        return;
      }
      setF((prev) => ({
        ...prev,
        stops: [
          ...(prev.stops ?? []),
          {
            // Where the journey stands now is the connection. The airport comes
            // from the segment just looked up, so "AMS" and "Amsterdam (AMS)"
            // cannot disagree with each other later.
            airport: next.from || prev.to || "",
            arriveTime: prev.arriveTime,
            departTime: next.departTime,
            overnight: Boolean(next.date && prev.arriveDate && next.date > prev.arriveDate),
          },
          ...(next.stops ?? []),
        ],
        to: next.to,
        arriveTime: next.arriveTime,
        arriveDate: next.arriveDate || (next.date && prev.date && next.date > prev.date ? next.date : prev.arriveDate),
      }));
      setLegNo("");
      setError("");
      setLegStatus(`Added: ${next.airline || next.flightNo} ${next.from} → ${next.to}. The journey now ends at ${next.to}.`);
    } catch {
      setLegStatus("Lookup failed — add the stop by hand below.");
    } finally {
      setLegBusy(false);
    }
  }

  return (
    <FormShell
      title={initial ? "Edit this flight" : "Add a flight"}
      submitLabel={initial ? "Save the flight" : "Add flight"}
      error={error}
      onRemove={onRemove}
      onCancel={onCancel}
      onSubmit={submitFlight}
    >
      <div className="sm:col-span-2 lg:col-span-3 rounded-md border border-[var(--gold-light)] bg-[#faf7ef] p-3">
        <span className={caption}>Auto-fill from a flight number</span>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input className={`${inputClass} mt-0 w-32`} value={lookupNo} onChange={(e) => setLookupNo(e.target.value)} placeholder="e.g. LY1" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void runLookup(); } }} />
          <button type="button" onClick={() => void runLookup()} disabled={busy} className="border border-[var(--navy)] bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white disabled:opacity-50">{busy ? "…" : "Look up"}</button>
          <span className="text-xs text-stone-600">Uses the date below.</span>
        </div>
        {status && <p className="mt-2 text-xs text-[var(--navy)]">{status}</p>}
      </div>
      {/* allowGroups={false} — a booked flight lands at one specific airport,
          never "all airports in the city", which is a search-time idea. */}
      <Field label="From *"><AirportAutocomplete required allowGroups={false} value={f.from ?? ""} onChange={(v) => updateFlight({ from: v })} className={inputClass} placeholder="City or airport — e.g. New York, JFK" /></Field>
      <Field label="To *"><AirportAutocomplete required allowGroups={false} value={f.to ?? ""} onChange={(v) => updateFlight({ to: v })} className={inputClass} placeholder="City or airport — e.g. Kyiv, KBP" /></Field>
      <Field label="Airline"><input className={inputClass} value={f.airline ?? ""} onChange={(e) => setF({ ...f, airline: e.target.value })} /></Field>
      <Field label="Flight #"><input className={inputClass} value={f.flightNo ?? ""} onChange={(e) => setF({ ...f, flightNo: e.target.value })} placeholder="e.g. LY1" /></Field>
      <Field label="Date *"><DateField ariaLabel="Flight date" required className={inputClass} value={f.date ?? ""} onChange={(date) => updateFlight({ date })} /></Field>
      <Field label="Departs"><input type="time" className={inputClass} value={f.departTime ?? ""} onChange={(e) => setF({ ...f, departTime: e.target.value })} /></Field>
      <Field label="Arrives"><input type="time" className={inputClass} value={f.arriveTime ?? ""} onChange={(e) => setF({ ...f, arriveTime: e.target.value })} /></Field>
      <Field label="Landing date"><DateField ariaLabel="Landing date" className={inputClass} min={f.date} value={f.arriveDate ?? ""} onChange={(arriveDate) => setF({ ...f, arriveDate })} /></Field>
      <Field label="Booking reference"><input className={inputClass} value={f.confirmation ?? ""} onChange={(e) => setF({ ...f, confirmation: e.target.value })} placeholder="e.g. XR4K9T" /></Field>

      {overnight?.note && (
        <p className={`sm:col-span-2 lg:col-span-3 border-l-4 px-3 py-2 text-xs leading-5 ${overnight.detected ? "border-[var(--gold)] bg-[var(--cream)] text-[var(--navy)]" : "border-stone-300 bg-stone-50 text-stone-600"}`}>
          <strong>{overnight.detected ? "Overnight flight" : "Landing date"}</strong> — {overnight.note}
          {overnight.detected && " Leave the landing date empty and this is what will be used; fill it in only to correct it."}
        </p>
      )}

      {/* Connections belong to this one journey. Entering them as separate
          flights made the planner think the traveler had arrived, needed a bed
          in the connecting city, and had a free day there. */}
      <div className="sm:col-span-2 lg:col-span-3 rounded-md border border-[var(--gold-light)] bg-[#faf7ef] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={caption}>Stops on the way (connections)</span>
          <button
            type="button"
            onClick={() => setF({ ...f, stops: [...(f.stops ?? []), { airport: "" }] })}
            className="border border-[var(--navy)] bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white"
          >
            + Add a stop
          </button>
        </div>

        {/* The second flight number on the ticket, entered as what it is: the
            next segment of this journey, not a second journey. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-stone-600">Next segment by flight number</span>
          <input
            className={`${inputClass} mt-0 w-32`}
            value={legNo}
            onChange={(e) => setLegNo(e.target.value)}
            placeholder="e.g. KL1361"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addNextSegment(); } }}
          />
          <button
            type="button"
            onClick={() => void addNextSegment()}
            disabled={legBusy}
            className="border border-[var(--navy)] bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white disabled:opacity-50"
          >
            {legBusy ? "…" : "Add segment"}
          </button>
        </div>
        {legStatus && <p className="mt-2 text-xs text-[var(--navy)]">{legStatus}</p>}

        {(f.stops ?? []).length === 0 ? (
          <p className="mt-2 text-xs leading-5 text-stone-600">
            If it connects, add the stop here rather than entering a second flight.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {(f.stops ?? []).map((stop, i) => (
              <div key={i} className="grid gap-2 border border-[var(--gold-light)] bg-white p-3 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
                <label className="block">
                  <span className={caption}>Stop {i + 1}</span>
                  <AirportAutocomplete
                    allowGroups={false}
                    value={stop.airport}
                    onChange={(v) => setF({ ...f, stops: (f.stops ?? []).map((x, j) => (j === i ? { ...x, airport: v } : x)) })}
                    className={inputClass}
                    placeholder="Connecting airport"
                  />
                </label>
                <label className="block">
                  <span className={caption}>Lands</span>
                  <input type="time" className={inputClass} value={stop.arriveTime ?? ""} onChange={(e) => setF({ ...f, stops: (f.stops ?? []).map((x, j) => (j === i ? { ...x, arriveTime: e.target.value } : x)) })} />
                </label>
                <label className="block">
                  <span className={caption}>Leaves</span>
                  <input type="time" className={inputClass} value={stop.departTime ?? ""} onChange={(e) => setF({ ...f, stops: (f.stops ?? []).map((x, j) => (j === i ? { ...x, departTime: e.target.value } : x)) })} />
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => setF({ ...f, stops: (f.stops ?? []).filter((_, j) => j !== i) })}
                    aria-label={`Remove stop ${i + 1}`}
                    className="min-h-[38px] px-2 text-xs text-stone-400 transition hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
                <label className="block sm:col-span-4">
                  <span className={caption}>Notes for this stop</span>
                  <input className={inputClass} value={stop.notes ?? ""} onChange={(e) => setF({ ...f, stops: (f.stops ?? []).map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)) })} placeholder="Terminal change, long wait, whether you can leave the airport" />
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-[var(--navy)] sm:col-span-4">
                  <input type="checkbox" checked={Boolean(stop.overnight)} onChange={(e) => setF({ ...f, stops: (f.stops ?? []).map((x, j) => (j === i ? { ...x, overnight: e.target.checked } : x)) })} className="h-4 w-4 accent-[var(--navy)]" />
                  The onward flight leaves the next day
                </label>
                {/* Both times given is enough to say how long the wait is, and
                    a wait past eight hours is treated as a night in transit
                    without anybody having to tick the box. */}
                {(() => {
                  const wait = layoverMinutes(stop);
                  if (wait === null) return null;
                  const held = stop.overnight || wait >= 8 * 60;
                  return (
                    <p className={`sm:col-span-4 text-xs leading-5 ${held ? "font-semibold text-[var(--navy)]" : "text-stone-500"}`}>
                      {formatDuration(wait)} between flights
                      {held ? " — long enough that this counts as the night, so no hotel is asked for here." : "."}
                    </p>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </div>
    </FormShell>
  );
}

function LodgingForm({ startDate, initial, onAdd, onRemove, onCancel }: {
  startDate: string;
  /** The stay being changed. Absent when adding a new one. */
  initial?: ItinLodging;
  onAdd: (l: ItinLodging) => void;
  onRemove?: () => void;
  onCancel?: () => void;
}) {
  const [l, setL] = useState<Partial<ItinLodging>>(initial ?? { type: "hotel", checkIn: startDate });
  const overnight = l.type === "overnight-transit";

  function pickLodging(g: LodgingResult) {
    setL((prev) => ({ ...prev, name: g.name, address: g.address ?? prev.address, phone: g.phone ?? prev.phone, notes: prev.notes || g.notes }));
  }

  // From the general hotel lookup (any hotel, anywhere) — unlike the
  // researched list above, this one carries the hotel's own coordinates, so
  // picking it also fills the map pin and the drive times.
  function pickPlace(p: PlaceLodgingResult) {
    setL((prev) => ({ ...prev, name: p.name, address: p.address ?? prev.address, coordinates: p.coordinates ?? prev.coordinates, phone: p.phone ?? prev.phone }));
  }

  // A stay is a number of nights, so check-out is the next day at the
  // earliest — "exclusive" in lib/date-range.
  const checkIn = l.checkIn ?? startDate;
  const checkOutTooEarly = rangeIsBackwards(checkIn, l.checkOut ?? "", "exclusive");
  const minCheckOut = earliestEnd(checkIn, "exclusive");

  return (
    <FormShell
      title={initial ? "Edit where you sleep" : "Add lodging / where you sleep"}
      submitLabel={initial ? "Save" : "Add"}
      error={checkOutTooEarly ? "Check-out has to be at least the day after check-in." : ""}
      onRemove={onRemove}
      onCancel={onCancel}
      onSubmit={() => {
        if (checkOutTooEarly) return;
        if ((overnight || l.name) && checkIn) {
          onAdd({
            // Editing keeps the id, so the stay is changed rather than replaced
            // and a second hotel does not appear on the same night.
            id: initial?.id ?? uid(),
            type: (l.type as LodgingType) || "hotel",
            name: l.name || (overnight ? "bus/flight" : ""),
            address: l.address,
            coordinates: l.coordinates,
            phone: l.phone,
            checkIn,
            checkOut: overnight ? nextDate(checkIn) : l.checkOut || nextDate(checkIn),
            notes: l.notes,
            confirmation: l.confirmation?.trim() || undefined,
            bookedOnSite: initial?.bookedOnSite ?? false,
          });
        }
      }}
    >
      {!overnight && (
        <div className="sm:col-span-2 lg:col-span-3 rounded-md border border-[var(--gold-light)] bg-[#faf7ef] p-3">
          <span className={caption}>Pick from our listed lodging</span>
          <LodgingPicker onPick={pickLodging} />
          <span className={`${caption} mt-3 block`}>…or search any hotel</span>
          <HotelPlacePicker onPick={pickPlace} />
          <p className="mt-2 text-[11px] text-stone-500">Confirm rates and availability directly, or type your own below.</p>
        </div>
      )}
      <Field label="Type"><select className={inputClass} value={l.type ?? "hotel"} onChange={(e) => setL({ ...l, type: e.target.value as LodgingType })}><option value="hotel">Hotel / guesthouse</option><option value="overnight-transit">Overnight bus / flight (sleep in transit)</option><option value="other">Other (family, apartment…)</option></select></Field>
      {!overnight && <Field label="Name *"><input required className={inputClass} value={l.name ?? ""} onChange={(e) => setL({ ...l, name: e.target.value })} /></Field>}
      {overnight && <Field label="Bus or flight"><input className={inputClass} value={l.name ?? ""} placeholder="e.g. overnight bus to Uman" onChange={(e) => setL({ ...l, name: e.target.value })} /></Field>}
      {!overnight && <Field label="Address"><AddressAutocomplete value={l.address ?? ""} onChange={(address, coords) => setL({ ...l, address, coordinates: coords || l.coordinates })} className={inputClass} placeholder="Start typing the hotel address…" /></Field>}
      {!overnight && <Field label="Phone"><input type="tel" className={inputClass} value={l.phone ?? ""} onChange={(e) => setL({ ...l, phone: e.target.value })} placeholder="Front desk / host" /></Field>}
      <Field label={overnight ? "Night of *" : "Check-in *"}><DateField ariaLabel="Check-in date" required className={inputClass} value={checkIn} onChange={(nextIn) => {
        // Pushing check-in past check-out carries check-out with it.
        setL({ ...l, checkIn: nextIn, checkOut: correctedEnd(nextIn, l.checkOut ?? "", "exclusive") });
      }} /></Field>
      {!overnight && <Field label="Check-out *"><DateField ariaLabel="Check-out date" required className={inputClass} min={minCheckOut} value={l.checkOut ?? ""} onChange={(checkOut) => setL({ ...l, checkOut: correctedEnd(checkIn, checkOut, "exclusive") })} /></Field>}
      {!overnight && <Field label="Booking reference"><input className={inputClass} value={l.confirmation ?? ""} onChange={(e) => setL({ ...l, confirmation: e.target.value })} placeholder="What the hotel gave you" /></Field>}
      <Field label="Notes"><input className={inputClass} value={l.notes ?? ""} onChange={(e) => setL({ ...l, notes: e.target.value })} placeholder="Late check-in, kitchen, minyan times…" /></Field>
    </FormShell>
  );
}

// Search-and-pick lodging from the site's researched accommodations.
function LodgingPicker({ onPick }: { onPick: (g: LodgingResult) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LodgingResult[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setResults([]); return; }
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/lodging/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (active) setResults(data.results ?? []);
      } catch {
        if (active) setResults([]);
      }
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [q]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={boxRef} className="relative mt-1">
      <input
        className={inputClass}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search by place or city — e.g. Uman, Lizhensk, guesthouse…"
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-30 max-h-72 overflow-auto border border-[var(--gold)] bg-[#fcfaf6] shadow-[0_16px_36px_rgba(23,45,82,.14)]">
          {results.map((g, i) => (
            <li key={`${g.name}-${i}`}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onPick(g); setQ(""); setResults([]); setOpen(false); }}
                className="block w-full px-3 py-2 text-left hover:bg-[var(--cream)]"
              >
                <span className="text-sm font-semibold text-[var(--navy)]">{g.name}</span>
                <span className="block text-xs text-stone-500">{g.city}{g.phone ? ` · ${g.phone}` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Search-and-pick any hotel, worldwide — the general lookup, not the site's
// own researched list. See lib/hotel-places.ts.
function HotelPlacePicker({ onPick }: { onPick: (p: PlaceLodgingResult) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PlaceLodgingResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 3) { setResults([]); setLoading(false); return; }
    let active = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/lodging/places-search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (active) setResults(data.results ?? []);
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setLoading(false);
      }
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [q]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={boxRef} className="relative mt-1">
      <input
        className={inputClass}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search any hotel by name — e.g. Marriott Vienna…"
        autoComplete="off"
      />
      {open && loading && q.trim().length >= 3 && (
        <p className="absolute left-0 right-0 top-full z-30 border border-[var(--gold-light)] bg-[#fcfaf6] px-3 py-2 text-xs text-stone-500 shadow-[0_16px_36px_rgba(23,45,82,.14)]">
          Searching…
        </p>
      )}
      {open && !loading && results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-30 max-h-72 overflow-auto border border-[var(--gold)] bg-[#fcfaf6] shadow-[0_16px_36px_rgba(23,45,82,.14)]">
          {results.map((p, i) => (
            <li key={`${p.name}-${i}`}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onPick(p); setQ(""); setResults([]); setOpen(false); }}
                className="block w-full px-3 py-2 text-left hover:bg-[var(--cream)]"
              >
                <span className="text-sm font-semibold text-[var(--navy)]">{p.name}</span>
                {p.address && <span className="block text-xs text-stone-500">{p.address}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActivityForm({ startDate, onAdd, itineraries = false }: { startDate: string; onAdd: (a: ItinActivity) => void; itineraries?: boolean }) {
  const [a, setA] = useState<Partial<ItinActivity>>({ date: startDate });

  function pickKever(k: KeverResult) {
    setA((prev) => ({
      ...prev,
      name: k.name,
      yiddishName: k.yiddishName,
      address: k.address,
      coordinates: k.coordinates || prev.coordinates,
      href: k.href,
      phone: k.phone ?? prev.phone,
      keverSlug: k.slug,
      country: k.country,
      notes: prev.notes || k.notes,
    }));
  }

  // The other half of a day. Deliberately does NOT set keverSlug — that field
  // is what makes the itinerary read the burials live off our cemetery data,
  // and a museum has none.
  function pickAttraction(x: AttractionResult) {
    setA((prev) => ({
      ...prev,
      name: x.name,
      yiddishName: undefined,
      address: x.address ?? `${x.city}, ${x.country}`,
      coordinates: x.coordinates || prev.coordinates,
      href: x.website || x.href,
      keverSlug: undefined,
      country: x.country,
      // The Shabbos line first — it is the fact that decides whether the day
      // works at all — then whatever practical note came with the entry.
      notes: prev.notes || x.notes || undefined,
    }));
  }

  return (
    <FormShell title="Add an activity / stop" onSubmit={() => { if (a.name) onAdd({ id: uid(), name: a.name, yiddishName: a.yiddishName, address: a.address, coordinates: a.coordinates, date: a.date ?? "", startTime: a.startTime, durationMins: a.durationMins, href: a.href, phone: a.phone, keverSlug: a.keverSlug, country: a.country, notes: a.notes, bookedOnSite: false }); }}>
      <div className="sm:col-span-2 lg:col-span-3 rounded-md border border-[var(--gold-light)] bg-[#faf7ef] p-3">
        {!itineraries && (
          <>
            <span className={caption}>Add a kever from our list</span>
            <KeverPicker onPick={pickKever} />
          </>
        )}
        <span className={`${caption} mt-3 block`}>
          {itineraries ? "Search a place — a sight, a restaurant, a museum…" : "…or any place: a sight, a kosher restaurant, a shul, a mikvah"}
        </span>
        <AttractionPicker onPick={pickAttraction} />
        {a.keverSlug && <p className="mt-2 text-xs font-semibold text-emerald-700">Filled from our directory: {a.name}.</p>}
      </div>
      <Field label="Name *"><input required className={inputClass} value={a.name ?? ""} onChange={(e) => setA({ ...a, name: e.target.value })} placeholder={itineraries ? "Museum, meal, activity…" : "Kever, museum, meal…"} /></Field>
      <Field label="Address"><AddressAutocomplete value={a.address ?? ""} onChange={(address, coords) => setA({ ...a, address, coordinates: coords || a.coordinates })} className={inputClass} placeholder="Start typing the address…" /></Field>
      <Field label="Coordinates"><input className={inputClass} value={a.coordinates ?? ""} placeholder="Auto-filled from the address" onChange={(e) => setA({ ...a, coordinates: e.target.value })} /></Field>
      <Field label="Phone"><input type="tel" className={inputClass} value={a.phone ?? ""} onChange={(e) => setA({ ...a, phone: e.target.value })} placeholder="Contact number for this stop" /></Field>
      <Field label="Link"><input type="url" className={inputClass} value={a.href ?? ""} onChange={(e) => setA({ ...a, href: e.target.value })} placeholder={itineraries ? "https://… (map, booking, website)" : "https://… (map, booking, our kever page)"} /></Field>
      <Field label="Date (leave empty to let the planner place it)"><DateField ariaLabel="Stop date" className={inputClass} value={a.date ?? ""} onChange={(date) => setA({ ...a, date })} /></Field>
      <Field label="Time"><input type="time" className={inputClass} value={a.startTime ?? ""} onChange={(e) => setA({ ...a, startTime: e.target.value })} /></Field>
      <Field label="Duration (min)"><input type="number" min={0} className={inputClass} value={a.durationMins ?? ""} onChange={(e) => setA({ ...a, durationMins: Number(e.target.value) || undefined })} /></Field>
      <Field label="Notes"><input className={inputClass} value={a.notes ?? ""} onChange={(e) => setA({ ...a, notes: e.target.value })} /></Field>
    </FormShell>
  );
}

// Search-and-pick a kever from the site's own directory; fills the whole form.
function KeverPicker({ onPick }: { onPick: (k: KeverResult) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<KeverResult[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setResults([]); return; }
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/kevarim/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (active) setResults(data.results ?? []);
      } catch {
        if (active) setResults([]);
      }
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [q]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={boxRef} className="relative mt-1">
      <input
        className={inputClass}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search a kever, city, or tzaddik — e.g. Uman, Lizhensk, Baba Sali…"
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-30 max-h-72 overflow-auto border border-[var(--gold)] bg-[#fcfaf6] shadow-[0_16px_36px_rgba(23,45,82,.14)]">
          {results.map((k) => (
            <li key={k.slug}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onPick(k); setQ(""); setResults([]); setOpen(false); }}
                className="block w-full px-3 py-2 text-left hover:bg-[var(--cream)]"
              >
                <span className="text-sm font-semibold text-[var(--navy)]">{k.name}</span>
                {k.yiddishName ? <span className="ml-2 text-sm text-stone-500">{k.yiddishName}</span> : null}
                <span className="block text-xs text-stone-500">{[k.city, k.country].filter(Boolean).join(", ")}{k.coordinates ? "" : " · location — confirm locally"}</span>
                {k.burials?.length ? <span className="block text-xs text-[var(--gold-ink)]">{burialSummary(k.burials)}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Search-and-pick something to do from the site's own listings. Same shape as
// KeverPicker; kept separate because the two answer different questions and a
// single box searching both would bury one under the other.
function AttractionPicker({ onPick }: { onPick: (x: AttractionResult) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AttractionResult[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setResults([]); return; }
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/attractions/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (active) setResults(data.results ?? []);
      } catch {
        if (active) setResults([]);
      }
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [q]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={boxRef} className="relative mt-1">
      <input
        className={inputClass}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search a place — a sight, a kosher restaurant, a shul, a mikvah…"
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-30 max-h-72 overflow-auto border border-[var(--gold)] bg-[#fcfaf6] shadow-[0_16px_36px_rgba(23,45,82,.14)]">
          {results.map((x) => (
            <li key={x.slug}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onPick(x); setQ(""); setResults([]); setOpen(false); }}
                className="block w-full px-3 py-2 text-left hover:bg-[var(--cream)]"
              >
                <span className="text-sm font-semibold text-[var(--navy)]">{x.name}</span>
                <span className="block text-xs text-stone-500">{[x.city, x.country, x.kind].filter(Boolean).join(", ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The shell around "add a flight / a hotel / a stop".
 *
 * A real <form> with a real submit button, so the browser stops on a missing
 * required field and points at it. It used to be a div with a plain button
 * that checked the fields itself and simply did nothing when one was empty —
 * you pressed Add, nothing happened, and there was nothing to say why.
 */
function FormShell({ title, children, onSubmit, error, submitLabel = "Add", onRemove, onCancel }: {
  title: string;
  children: React.ReactNode;
  onSubmit: () => void;
  error?: string;
  submitLabel?: string;
  /** Editing an existing entry: delete it, or back out without saving. */
  onRemove?: () => void;
  onCancel?: () => void;
}) {  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="mt-5 border-t border-[var(--gold-light)] pt-5"
    >
      <p className="text-sm font-bold text-[var(--navy)]">{title}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
      {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" disabled={Boolean(error)} className="border border-[var(--navy)] bg-[var(--navy)] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] hover:border-[var(--gold)] disabled:opacity-50">{submitLabel}</button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="border border-[var(--gold-light)] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--cream-deep)]">Cancel</button>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove} className="ml-auto px-3 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-stone-400 transition hover:text-red-700">Remove</button>
        )}
      </div>
    </form>  );
}

/**
 * One labelled field. A label ending in "*" marks it required and colours the
 * star, so the promise on the label and the rule in the box are the same
 * thing rather than two things that can drift apart.
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const required = label.trim().endsWith("*");
  return (
    <label className="block">
      <span className={caption}>
        {required ? label.trim().slice(0, -1).trim() : label}
        {required && <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>}
      </span>
      {children}
    </label>
  );
}


// ---- Who is coming ---------------------------------------------------
// Adding your family to your own trip is not the same as sharing it with
// another account: a child has no login, and you still need their name on the
// printed itinerary and counted when you book rooms and seats.

const TRAVELER_KINDS: Array<{ value: NonNullable<ItinTraveler["kind"]>; label: string }> = [
  { value: "adult", label: "Adult" },
  { value: "child", label: "Child" },
  { value: "infant", label: "Infant" },
];

function TravelerShareLink({ tripId, traveler }: { tripId: string | null; traveler: ItinTraveler }) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    if (!tripId) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/account/traveler-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, travelerId: traveler.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.shareId) {
        setError(data?.error || "Could not create that link.");
        return;
      }
      setLink(`${window.location.origin}/t/${data.shareId}/app`);
    } finally {
      setBusy(false);
    }
  }

  if (link) {
    return (
      <div className="mt-1.5 flex w-full min-w-0 items-center gap-2 text-xs">
        <input readOnly value={link} className="min-w-0 flex-1 truncate border border-[var(--gold-light)] bg-[#fcfaf6] px-2 py-1 text-[var(--navy)]" onFocus={(e) => e.target.select()} />
        <button type="button" onClick={() => navigator.clipboard?.writeText(link)} className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">
          Copy
        </button>
      </div>
    );
  }
  return (
    <div className="mt-1.5 w-full">
      <button type="button" onClick={create} disabled={busy || !tripId} className="text-xs font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2 disabled:opacity-40">
        {traveler.hasOwnAccess ? "Get access link" : "Create access link"}
      </button>
      {error && <p className="mt-1 text-xs font-semibold text-red-700">{error}</p>}
    </div>
  );
}

function TravelersPanel({
  travelers,
  onChange,
  bookingFor,
  onBookingFor,
  tripId,
}: {
  travelers: ItinTraveler[];
  onChange: (t: ItinTraveler[]) => void;
  bookingFor?: "self" | "someone-else";
  onBookingFor: (answer: "self" | "someone-else", traveler?: ItinTraveler) => void;
  tripId?: string | null;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<NonNullable<ItinTraveler["kind"]>>("adult");
  const viewer = useViewer();

  function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onChange([...travelers, { id: uid(), name: trimmed, kind }]);
    setName("");
    setKind("adult");
  }

  const update = (id: string, patch: Partial<ItinTraveler>) =>
    onChange(travelers.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const remove = (id: string) => onChange(travelers.filter((t) => t.id !== id));

  const adults = travelers.filter((t) => (t.kind ?? "adult") === "adult").length;
  const children = travelers.filter((t) => t.kind === "child").length;
  const infants = travelers.filter((t) => t.kind === "infant").length;

  return (
    <section className="border-0 bg-transparent p-1 sm:p-2">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Who&apos;s coming</h2>
        {travelers.length > 0 && (
          <p className="text-xs font-semibold text-stone-500">
            {travelers.length} {travelers.length === 1 ? "traveler" : "travelers"}
            {children || infants ? ` · ${adults} adult${adults === 1 ? "" : "s"}${children ? `, ${children} child${children === 1 ? "" : "ren"}` : ""}${infants ? `, ${infants} infant${infants === 1 ? "" : "s"}` : ""}` : ""}
          </p>
        )}
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
        They appear on the printed itinerary and set the head count for rooms and seats.
      </p>

      {/* Asked once, and only of somebody signed in — there is no name to add
          otherwise. Answering "I am going" puts them on the list straight
          away rather than making them type a name we already know. */}
      {viewer?.signedIn && !bookingFor && (
        <div className="mt-4 border-l-4 border-[var(--gold)] bg-[var(--cream)] px-4 py-3">
          <p className="font-semibold text-[var(--navy)]">Travelling on this trip, or arranging it for somebody else</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                onBookingFor("self", { id: uid(), name: viewer.name?.trim() || viewer.id || "Me", kind: "adult" })
              }
              className="min-h-[40px] border border-[var(--navy)] bg-[var(--navy)] px-4 text-xs font-bold uppercase tracking-[0.1em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]"
            >
              I am travelling
            </button>
            <button
              type="button"
              onClick={() => onBookingFor("someone-else")}
              className="min-h-[40px] border border-[var(--gold)] px-4 text-xs font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:bg-[var(--cream-deep)]"
            >
              I am arranging it for somebody else
            </button>
          </div>
        </div>
      )}

      {bookingFor === "someone-else" && (
        <p className="mt-4 text-sm leading-6 text-stone-600">
          You are not on the list. Add the people who are going below.
        </p>
      )}

      {travelers.length > 0 && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {travelers.map((t) => (
            <li key={t.id} className="flex min-w-0 flex-wrap items-center gap-2 border border-[var(--gold-light)] bg-white px-3 py-2">
              <input
                value={t.name}
                onChange={(e) => update(t.id, { name: e.target.value })}
                aria-label="Traveler name"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-semibold text-[var(--navy)] outline-none"
              />
              <select
                value={t.kind ?? "adult"}
                onChange={(e) => update(t.id, { kind: e.target.value as ItinTraveler["kind"] })}
                aria-label={`${t.name || "Traveler"} type`}
                className="border border-[var(--gold-light)] bg-[#fcfaf6] py-1 pl-2 text-xs text-[var(--navy)] outline-none"
              >
                {TRAVELER_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
              <button
                type="button"
                onClick={() => remove(t.id)}
                aria-label={`Remove ${t.name || "traveler"}`}
                className="min-h-[32px] px-2 text-xs text-stone-400 transition hover:text-red-700"
              >
                Remove
              </button>
              <input
                value={t.family ?? ""}
                onChange={(e) => update(t.id, { family: e.target.value })}
                aria-label={`${t.name || "Traveler"}'s family or group`}
                placeholder="Family / group (optional)"
                className="min-w-0 flex-1 border border-[var(--gold-light)] bg-[#fcfaf6] px-2 py-1 text-xs text-[var(--navy)] outline-none"
              />
              <TravelerShareLink tripId={tripId ?? null} traveler={t} />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className={caption}>Add a traveler</span>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="Name"
          />
        </label>
        <label>
          <span className={caption}>Type</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as NonNullable<ItinTraveler["kind"]>)} className={inputClass}>
            {TRAVELER_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
        <button
          type="button"
          onClick={add}
          disabled={!name.trim()}
          className="min-h-[42px] border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.1em] text-white transition hover:bg-[var(--gold)] hover:border-[var(--gold)] disabled:opacity-40"
        >
          + Add
        </button>
      </div>
    </section>
  );
}



/**
 * Book the flights, once you know who is going.
 *
 * The head count and the dates are the two things you need before you can look
 * at seats, and by this point in the page both are known — so the link carries
 * them rather than asking for them a second time on the other side.
 */
function BookFlightsPanel({ itin }: { itin: Itinerary }) {
  const people = travelersOf(itin);
  const booking = useBookingLink();

  const params = new URLSearchParams();
  if (itin.startDate) params.set("depart", itin.startDate);
  if (itin.endDate) params.set("return", itin.endDate);
  // Where they are starting from and heading to, when a flight already says so.
  const first = itin.flights[0];
  if (first?.from) params.set("from", first.from);
  if (first?.to) params.set("to", first.to);
  // Never a bare `/book`: the owner can have that path behind an access code,
  // and a planner button that opens a password box is the same broken journey
  // as the one in the footer. See lib/booking-access.ts.
  const href = bookingHref(booking, Object.fromEntries(params));

  return (
    <section className="mt-5 border border-[var(--gold-light)] bg-[#fcfaf6] p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Book the flights</h2>
        {people.length > 0 && (
          <p className="text-xs font-semibold text-stone-500">
            {people.length} {people.length === 1 ? "seat" : "seats"}
            {itin.startDate ? ` · ${itin.startDate}` : ""}
            {itin.endDate ? ` → ${itin.endDate}` : ""}
          </p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href={href}
          className="min-h-[44px] border border-[var(--navy)] bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]"
        >
          Book flights &amp; hotels
        </Link>
      </div>
    </section>
  );
}
/**
 * One journey on a day card — connections included.
 *
 * A flight with a stopover is one journey, so it reads as one line:
 * JFK → WAW → KRK, with the wait on the ground shown under it. Entering it as
 * two separate flights used to make the planner believe the traveler had
 * arrived, spent a day in the connecting city, and needed a hotel there.
 */
function FlightLine({ flight, direction, landsSameDay, onEdit, onEditLeg }: {
  flight: ItinFlight & { legs?: ItinFlight[] };
  direction: "arrive" | "depart";
  /** Takes off and lands the same day, so this one line is the whole journey. */
  landsSameDay?: boolean;
  onEdit?: () => void;
  /** Open one leg of a journey that was entered as more than one flight. */
  onEditLeg?: (id: string) => void;
}) {
  const stops = flight.stops ?? [];
  const airline = [flight.airline, flight.flightNo].filter(Boolean).join(" ");
  // Entered as separate flights and read back as one. Say so, because a
  // traveler who typed two lines and sees one needs to know nothing was lost —
  // and because the way to undo it is to book a room in the connecting city.
  const joinedFrom = flight.legs && flight.legs.length > 1 ? flight.legs.length : 0;
  return (
    <div className="text-sm text-[var(--navy)]">
      <p>
        ✈️{" "}
        {direction === "depart"
          ? <>Depart {flight.from}{flight.departTime ? ` at ${flight.departTime}` : ""}{landsSameDay && flight.arriveTime ? `, land ${flight.to} at ${flight.arriveTime}` : ""}</>
          : <>Arrive {flight.to}{flight.arriveTime ? ` at ${flight.arriveTime}` : ""}</>}
        {" — "}
        <span className="font-semibold">{flightRouteLabel(flight)}</span>
        {airline ? ` (${airline})` : ""}
        {stops.length > 0 && (
          <span className="ml-2 text-xs font-semibold text-[var(--gold-ink)]">
            {stops.length === 1 ? "1 stop" : `${stops.length} stops`}
          </span>
        )}
        {flight.confirmation && (
          <span className="ml-2 text-xs font-semibold text-stone-500">ref {flight.confirmation}</span>
        )}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="ml-2 border border-[var(--gold)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white"
          >
            Edit
          </button>
        )}
      </p>
      {stops.map((stop, i) => <LayoverLine key={`${stop.airport}-${i}`} stop={stop} onEditLeg={onEditLeg} />)}
      {joinedFrom > 0 && (
        <p className="ml-5 mt-1 text-xs leading-5 text-stone-500">
          {joinedFrom} flights you entered, read as one journey. Booking a hotel or planning a stop in the
          connecting city separates them again.
        </p>
      )}
    </div>
  );
}

function LayoverLine({ stop, onEditLeg }: { stop: FlightStop; onEditLeg?: (id: string) => void }) {
  const mins = layoverMinutes(stop);
  const long = stop.overnight || (mins ?? 0) >= 8 * 60;
  const tight = mins !== null && mins < 60;
  return (
    <p className="ml-5 mt-0.5 text-xs leading-5 text-stone-500">
      ↳ Stop in {stop.airport}
      {stop.arriveTime && stop.departTime ? ` — in ${stop.arriveTime}, out ${stop.departTime}` : ""}
      {mins !== null && <span className={`ml-1 font-semibold ${tight ? "text-red-700" : long ? "text-amber-800" : "text-stone-500"}`}>({formatDuration(mins)}{long ? " · overnight in transit" : tight ? " · tight connection" : ""})</span>}
      {stop.notes ? <span className="ml-1">· {stop.notes}</span> : null}
      {/* The onward flight is a record of its own, so it can be opened and
          changed here rather than only from the top of the page. */}
      {stop.legId && onEditLeg && (
        <button
          type="button"
          onClick={() => onEditLeg(stop.legId!)}
          className="ml-2 border border-[var(--gold-light)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white"
        >
          Edit onward leg
        </button>
      )}
    </p>
  );
}
