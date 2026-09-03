/**
 * The trip the White Glove app shows before a real one is wired in.
 *
 * This is the Rome week the design was drawn around — a family of five, an
 * adviser who moves things before anybody is asked, a day out of the city. It
 * is REAL, checkable Rome information written in the product's voice, not
 * lorem: the Colosseum, the Pantheon, Trastevere, Villa Borghese, Ostia
 * Antica. The airline, the hotel and every confirmation code are deliberately
 * unnamed, because none of them has happened.
 *
 * IT IS NEUTRAL, AND HAS TO BE. This file used to carry the kosher week the
 * two products were once built around together: the Ghetto, the Great
 * Synagogue, candle-lighting on the Friday, a hechsher to confirm at lunch.
 * All of that is right on White Glove Kosher Travel and none of it belongs
 * here — this product sells trip-building to advisers with clients of every
 * kind, and the demo is the first thing a buyer opens. The MODEL still carries
 * the kosher fields (kosherTitle, shabbosLabel, the shabbos kind) because an
 * adviser planning for a Jewish client has real use for them; the DEMO simply
 * does not populate them. tests/itineraries-neutral-content.test.ts holds that
 * line.
 *
 * WHY IT LIVES IN ITS OWN FILE. The app (components/companion/CompanionApp.tsx)
 * takes this shape as a prop, so the day a signed-in account's own itinerary is
 * handed in instead — built from lib/account-store.ts trips — nothing in the
 * app changes but the data. The shape below is the contract for that hand-off.
 */

import type { TripAlert } from "@/data/trip-alerts";

export type CompanionKind = "travel" | "sight" | "meal" | "rest" | "shabbos";

export type CompanionItem = {
  time: string;
  title: string;
  place: string;
  kind: CompanionKind;
  note: string;
  /** How far on foot, when it is worth saying. */
  walk?: string;
  /** A departing flight's landing time — belongs with "When" it lands, not
   *  "Where" it is, so it is its own field rather than living in `place`. */
  arriveNote?: string;
  /** A number worth calling — the venue, the driver, the front desk. */
  phone?: string;
  /** A confirmation, booking or reference page for this stop, when there is one. */
  href?: string;
  /** Whether the advisor may swap this one out around weather. */
  swappable?: boolean;
};

export type CompanionDay = {
  /** ISO date, YYYY-MM-DD — set only on a real, wired trip, where it doubles
   *  as the key for guideNote (Itinerary.guideNotes) and any edit to it. */
  date?: string;
  dow: string;
  dom: string;
  short: string;
  name: string;
  weather: string;
  walk: string;
  today?: boolean;
  shabbosLabel?: string;
  shabbosNote?: string;
  /** A practical note for this day — the side door, where to eat, where to
   *  park. Never kosher or Shabbos content; see Itinerary.guideNotes. */
  guideNote?: string;
  items: CompanionItem[];
};

export type CompanionSwap = {
  title: string;
  note: string;
  meta: string;
  item: CompanionItem;
  reply: string;
};

export type CompanionMessage = { from: "them" | "me"; text: string };

export type CompanionHandledStep = { what: string; when: string };

export type CompanionGuideItem = { title: string; note: string; tint: string };
export type CompanionGuideSection = { name: string; items: CompanionGuideItem[] };

export type CompanionWalletRow = {
  title: string;
  ref: string;
  sub: string;
  /** A number worth calling — the front desk, the driver. Tappable when set. */
  phone?: string;
  /** A real address — tappable as directions when set. */
  address?: string;
  /** The itinerary stop this row came from, and which array it lives in —
   *  set only on a real, wired trip. Lets the advisor attach a boarding pass
   *  or a ticket straight from the wallet, without a separate id lookup. */
  id?: string;
  stopKind?: "flight" | "lodging" | "activity";
  attachments?: Array<
    import("@/data/itinerary").ItinAttachment & {
      /**
       * A document that ships with the site, for the public sample only.
       *
       * A real attachment is bytes in storage, fetched through an
       * owner-checked or share-token-checked route. The sample trip has no
       * owner and no share token, so it had no documents at all — and the
       * wallet, whose whole promise is "your boarding pass on your phone with
       * no signal", was a list of greyed-out reference numbers with nothing
       * behind them. A buyer looking at the one public demonstration of the
       * product could not see the thing being demonstrated.
       *
       * Set only by COMPANION_DEMO_TRIP. When present the wallet links
       * straight at it instead of building an API URL that would 401.
       */
      sampleUrl?: string;
    }
  >;
};
export type CompanionWalletGroup = { name: string; rows: CompanionWalletRow[] };

export type CompanionPref = { label: string; value: string };

export type CompanionAdvisorTrip = {
  family: string;
  where: string;
  status: string;
  statusBg: string;
  statusFg: string;
  bg: string;
  border: string;
  line: string;
  /** The one thing to do, or null when the trip is running to plan. */
  action: string | null;
  /** Which screen the action opens. */
  go?: "alerts";
};

/** What one viewer owes on the trip, and what is left to pay it with. */
export type CompanionPayment = {
  /** The share-link path this viewer's own Pay screen calls — /pay/<shareId>. */
  shareId: string;
  label: string;
  currency: string;
  /** Only present when the planner chose to expose the whole trip's total. */
  totalCents?: number;
  yourShareCents: number;
  paidCents: number;
  remainingCents: number;
  nextDue?: { label: string; amountCents: number; dueDate?: string } | null;
  canPay: boolean;
};

export type CompanionTrip = {
  /**
   * Whether a live advisor is attached — the concierge side of the app.
   *
   * TRUE only for the scripted demo, which is the one place the advisor chat,
   * the held-for-you swap, the "handled for you" log and the advisor's own
   * trip list are real. A trip wired from the planner sets it FALSE: it is the
   * real itinerary in the traveller's pocket, with the guide and the wallet,
   * and nothing is put in an advisor's mouth that no advisor said. When the
   * concierge backend exists, a real trip can carry it too.
   */
  concierge: boolean;
  /**
   * Show this trip the way a CLIENT gets it, not the way the showcase does.
   *
   * `concierge` turns on three things no real trip has: a "Concierge" tab, a
   * Concierge/Guide switch, and a Traveler/Advisor role switch. They exist to
   * demonstrate a concierge tier that is not built — `concierge` is true for
   * this one scripted trip and nothing else.
   *
   * That was invisible internally and misleading publicly. On /app/preview,
   * which is sold as "this is what your client opens", a buyer met two mode
   * switches and a tab their clients will never have, next to an Advisor tab,
   * with nothing to tell them apart. The owner asked what the difference was,
   * which is the answer: to a client there is none, because one of them is not
   * a product.
   *
   * With this set, the scripted thread stays — it is the best part of the
   * sample — but it appears where a client's advisor thread appears, under the
   * name a client sees, and the switches do not appear at all.
   */
  previewAsClient?: boolean;
  /** The trip's own id, for the advisor's "add a boarding pass or ticket"
   *  control on the wallet — only set on a real, wired trip. */
  tripId?: string;
  advisorName: string;
  /**
   * The client's point of contact, shown on a wired trip that has no live
   * advisor — the agent a Business account put on the trip. A plain name, no
   * chat behind it. Absent when nobody was named.
   */
  contactName?: string;
  /** What the home screen's header reads — the family and the place. */
  homeTitle: string;
  /** The small line above it — "27 October · day 3 of 8". */
  homeKicker: string;
  tripTitle: string;
  tripDates: string;
  /** Which day is "today" — the index the app opens on. */
  todayIndex: number;
  /** Whether the trip's last day is already in the past. When true, the app
   *  opens on day one to browse from, but must not claim that day as today —
   *  see homeKicker and the "Day N of M" pill. Never true for the demo. */
  tripFinished?: boolean;
  /** The one line under "Eating today" on the home screen. */
  /** The one "Eating today" line on the home screen. Hidden when absent. */
  kosherTitle?: string;
  kosherNote?: string;
  family: string;
  familyMeta: string;
  days: CompanionDay[];
  walletGroups: CompanionWalletGroup[];
  prefs: CompanionPref[];
  guideSections: CompanionGuideSection[];
  /**
   * What this viewer owes on the trip, and how to pay it — absent unless the
   * planner has set up a balance AND this link is scoped to one family/
   * traveler (a per-traveler link, or a whole-trip link on a single-payer
   * trip). Never present for the demo. See lib/companion-payment.ts, the one
   * place this is computed, and components/companion/PaymentCard.tsx, the
   * one place it is shown.
   */
  payment?: CompanionPayment;
  /**
   * Real flight-status alerts — a meaningful delay, a cancellation, a real
   * gate/terminal change (data/trip-alerts.ts, lib/flight-status.ts). Empty
   * on the demo, which uses its own scripted `swaps`/`handledSteps` instead;
   * a real trip's Changes screen reads this list, not those.
   */
  liveAlerts?: TripAlert[];
  /* ---- concierge-only, present when `concierge` is true ---------------- */
  /** The held-for-you weather swap. */
  swaps?: { a: CompanionSwap; b: CompanionSwap };
  /** The advisor thread. Empty on a wired trip. */
  messages?: CompanionMessage[];
  /** The "handled for you" log of changes the advisor absorbed. */
  handledSteps?: CompanionHandledStep[];
  /** The advisor's own list of the trips they are holding. */
  advisorTrips?: CompanionAdvisorTrip[];
};

/** The palette the design carries with it — kept here so the app has one source. */
export const COMPANION_KIND: Record<
  CompanionKind,
  { dot: string; tint: string; label: string; fg: string }
> = {
  travel: { dot: "#78716c", tint: "#D5CEC3", label: "Travel", fg: "#57534e" },
  sight: { dot: "#C6A15B", tint: "#FAF8F3", label: "On foot", fg: "#6B4A1C" },
  meal: { dot: "#193F46", tint: "#FAF8F3", label: "Eating", fg: "#193F46" },
  rest: { dot: "#a8a29e", tint: "#ffffff", label: "Nothing planned", fg: "#78716c" },
  shabbos: { dot: "#193F46", tint: "#FAF8F3", label: "Shabbos", fg: "#193F46" },
};

/**
 * The three documents the sample wallet opens.
 *
 * Drawn as SVG and shipped in public/samples, so they render in the phone
 * rather than downloading — and every one of them says SAMPLE across its face,
 * in the banner and in the watermark, because a page that shows a boarding
 * pass has to be unmistakably a picture of one. The airline is invented; the
 * references are zeros.
 */
function sampleDoc(id: string, name: string, file: string) {
  return {
    id,
    kind: "document",
    name,
    contentType: "image/svg+xml",
    bytes: 0,
    addedAt: "2026-10-20T09:00:00.000Z",
    shared: true,
    sampleUrl: `/samples/${file}`,
  };
}

export const COMPANION_DEMO_TRIP: CompanionTrip = {
  concierge: true,
  advisorName: "Dana Whitfield",
  homeTitle: "The Harpers · Rome",
  homeKicker: "27 October · day 3 of 8",
  tripTitle: "Rome — a week, family of five",
  tripDates: "25 October – 1 November 2026",
  todayIndex: 2,
  family: "The Harper family",
  familyMeta: "2 adults, 3 children · ages 4, 7, 11",
  days: [
    {
      dow: "Sun",
      dom: "25",
      short: "Fly out",
      name: "Sunday 25 October",
      weather: "Leaving JFK 18:40",
      walk: "—",
      items: [
        { time: "16:00", title: "Out to JFK", place: "Car, pre-booked", kind: "travel", note: "Two hours in hand. The transfer confirmation sits in your wallet." },
        { time: "18:40", title: "JFK → Rome (FCO)", place: "Overnight, lands 08:55", kind: "travel", note: "Seats together for five, confirmed with the airline on the 14th." },
      ],
    },
    {
      dow: "Mon",
      dom: "26",
      short: "Arrive",
      name: "Monday 26 October",
      weather: "19°, clear",
      walk: "1.4 km on foot",
      items: [
        { time: "09:30", title: "Land, and settle in", place: "The hotel, near the Pantheon", kind: "rest", note: "Nothing planned for the first afternoon. A day that starts with a red-eye does not hold a schedule.", walk: "8 min on foot to the square" },
        { time: "17:00", title: "An evening walk through Trastevere", place: "Across the river", kind: "sight", note: "Nothing to book. It keeps everybody awake until a sensible bedtime." },
      ],
    },
    {
      dow: "Tue",
      dom: "27",
      short: "Colosseum",
      name: "Tuesday 27 October",
      weather: "Rain from 15:00",
      walk: "2.1 km on foot",
      today: true,
      items: [
        { time: "09:30", title: "The Colosseum", place: "Piazza del Colosseo", kind: "sight", note: "Timed entry booked. One ticket covers the Forum and the Palatine on the same day.", walk: "20 min on foot to the Pantheon" },
        { time: "13:00", title: "Lunch near the Forum", place: "Monti", kind: "meal", note: "Table held from one. Ten minutes uphill from the exit.", walk: "12 min on foot" },
        { time: "15:30", title: "The Pantheon and the Trevi Fountain", place: "Piazza della Rotonda", kind: "sight", note: "Both are open squares and free to stand in, which is what makes them work with a four-year-old.", swappable: true },
        { time: "18:30", title: "Back to the hotel", place: "On foot through Monti", kind: "rest", note: "Early night. Ostia is an early train." },
      ],
    },
    {
      dow: "Wed",
      dom: "28",
      short: "Ostia",
      name: "Wednesday 28 October",
      weather: "17°, cloud",
      walk: "2.5 km on foot",
      items: [
        { time: "09:00", title: "Ostia Antica", place: "Via dei Romagnoli · 30 min by train", kind: "sight", note: "Rome’s harbour town, left standing where it fell — streets, baths and a theatre. The longest single thing on the trip, and nothing after it on purpose." },
        { time: "14:30", title: "Lunch back in the centre", place: "Near the Pantheon", kind: "meal", note: "The train back from Porta San Paolo, then five minutes on foot. Held for you from two." },
      ],
    },
    {
      dow: "Thu",
      dom: "29",
      short: "Open",
      name: "Thursday 29 October",
      weather: "20°, sun",
      walk: "Yours",
      items: [
        { time: "10:00", title: "An unplanned afternoon", place: "Rome", kind: "rest", note: "Deliberately empty. A week with seven full days on it is a week somebody abandons on day three." },
      ],
    },
    {
      dow: "Fri",
      dom: "30",
      short: "Borghese",
      name: "Friday 30 October",
      weather: "18°, clear",
      walk: "2.1 km on foot",
      items: [
        { time: "10:00", title: "Villa Borghese", place: "Piazzale Napoleone I", kind: "sight", note: "The gallery is a timed ticket; the gardens around it are not, and there are bicycles to hire." },
        { time: "14:30", title: "Back through the gardens", place: "Down to the Spanish Steps", kind: "rest", note: "Downhill the whole way, which matters by day six." },
      ],
    },
    {
      dow: "Sat",
      dom: "31",
      short: "Ostia",
      name: "Saturday 31 October",
      weather: "18°, clear",
      walk: "3.4 km, mostly flat",
      items: [
        { time: "09:30", title: "Ostia Antica, out for the day", place: "Via dei Romagnoli · 30 min by train", kind: "sight", note: "A whole Roman town, quiet enough that children can run in it. The one thing on the day, on purpose." },
      ],
    },
    {
      dow: "Sun",
      dom: "01",
      short: "Home",
      name: "Sunday 1 November",
      weather: "Leaving FCO 13:05",
      walk: "—",
      items: [
        { time: "08:00", title: "The last morning", place: "Rome", kind: "rest", note: "Out to the airport with time in hand. The transfer moved with the flight." },
        { time: "13:05", title: "Rome (FCO) → JFK", place: "Lands 16:55", kind: "travel", note: "Moved by the airline from 11:20. Reconfirmed Monday morning." },
      ],
    },
  ],
  swaps: {
    a: {
      title: "Move it to Thursday morning",
      note: "The Pantheon and Trevi at 09:30 on the free morning. This afternoon goes back to being yours.",
      meta: "held until 17:00 · nothing else moves",
      item: { time: "15:30", title: "Your own afternoon", place: "The hotel, or the quarter", kind: "rest", note: "Moved to Thursday 09:30. The rain has the afternoon." },
      reply: "Done — the Pantheon and Trevi are on Thursday at 09:30, and this afternoon is yours. I left the lunch where it was.",
    },
    b: {
      title: "Palazzo Massimo instead",
      note: "Indoors, twelve minutes on foot from where you finish lunch, and quiet at that hour. The mosaics hold a seven-year-old.",
      meta: "held until 17:00 · tickets on me",
      item: { time: "15:30", title: "Palazzo Massimo alle Terme", place: "Largo di Villa Peretti", kind: "sight", note: "Indoors and twelve minutes on foot from lunch. Tickets are in your wallet." },
      reply: "Booked — Palazzo Massimo at 15:30, tickets are in your wallet. Twelve minutes on foot from lunch, all of it under cover.",
    },
  },
  messages: [
    { from: "them", text: "Morning — your Colosseum entry is 09:30, and I have someone meeting you at the gate rather than in the queue." },
    { from: "me", text: "Perfect. Is the lunch place the one you sent last week?" },
    { from: "them", text: "It is. I called on Sunday to move it back half an hour, and the table is held from one." },
  ],
  handledSteps: [
    { what: "Airline moved FCO → JFK to 13:05", when: "Sunday 23:41" },
    { what: "Seats for five re-held together", when: "Monday 07:04" },
    { what: "Airport transfer moved to 09:40", when: "Monday 07:16" },
    { what: "Seat requests reconfirmed on the new flight", when: "Monday 07:20" },
  ],
  guideSections: [
    {
      name: "Eating, near you",
      items: [
        { title: "Lunch near the Forum", note: "Ten minutes uphill from the exit, in Monti. Held from one on the day you are there.", tint: "#FAF8F3" },
        { title: "Breakfast round the corner", note: "Two minutes from the hotel, open from seven — which is the useful part with a four-year-old.", tint: "#FAF8F3" },
      ],
    },
    {
      name: "Getting about",
      items: [
        { title: "The day out to Ostia", note: "Porta San Paolo to Ostia Antica, thirty minutes, trains every fifteen. One ticket each way.", tint: "#ffffff" },
        { title: "Walking, mostly", note: "Four of the week's stops are on foot from the hotel. The other two are one train each.", tint: "#ffffff" },
      ],
    },
    {
      name: "Nearby, worth the walk",
      items: [
        { title: "The Colosseum", note: "Book the timed entry ahead. One ticket covers the Forum and the Palatine.", tint: "#FAF8F3" },
        { title: "The Pantheon and Trevi Fountain", note: "Both are open squares, free to stand in — the kind of stop that works with small children.", tint: "#FAF8F3" },
      ],
    },
  ],
  walletGroups: [
    {
      name: "Flights",
      rows: [
        {
          title: "JFK → Rome (FCO)",
          ref: "ref ●●●●",
          sub: "Sun 25 Oct, 18:40 · seats together for five, confirmed",
          attachments: [sampleDoc("sample-bp-out", "Boarding pass — Cohen, D.", "boarding-pass.svg")],
        },
        { title: "Rome (FCO) → JFK", ref: "ref ●●●●", sub: "Sun 1 Nov, 13:05 · moved from 11:20 by the airline" },
      ],
    },
    {
      name: "Where you are staying",
      rows: [
        {
          title: "A hotel near the Pantheon",
          ref: "conf ●●●●",
          sub: "26 Oct – 1 Nov · chosen for where it stands, four minutes from the square",
          attachments: [sampleDoc("sample-hotel", "Hotel confirmation", "hotel-confirmation.svg")],
        },
      ],
    },
    {
      name: "Held for you",
      rows: [
        {
          title: "Colosseum, timed entry",
          ref: "5 tickets",
          sub: "Tue 27 Oct, 09:30 · guide meets you at the gate",
          attachments: [sampleDoc("sample-colosseum", "Entry ticket — admits 5", "colosseum-ticket.svg")],
        },
        { title: "Ostia Antica", ref: "5 tickets", sub: "Wed 28 Oct, 09:00 · train from Porta San Paolo" },
        { title: "Airport transfers", ref: "2 cars", sub: "Both moved when the flight moved" },
      ],
    },
  ],
  prefs: [
    { label: "Kind of trip", value: "Family trip" },
    { label: "Must include", value: "One day out of the city" },
    { label: "Travelling with", value: "Children aged 4, 7 and 11" },
    { label: "Pace", value: "Balanced" },
    { label: "Access", value: "Short walking distances" },
  ],
  advisorTrips: [
    {
      family: "The Harper family",
      where: "Rome · day 3 of 8",
      status: "Needs you",
      statusBg: "#FAF8F3",
      statusFg: "#6B4A1C",
      bg: "#ffffff",
      border: "rgba(198, 161, 91,.3)",
      line: "Rain from three. Two afternoons drafted and held until five — send them and let them pick.",
      action: "Send the two options",
      go: "alerts",
    },
    {
      family: "The Adler family",
      where: "Zurich · arriving Thursday",
      status: "To plan",
      statusBg: "#C7BFB1",
      statusFg: "#57534e",
      bg: "#ffffff",
      border: "rgba(16, 47, 53,.08)",
      line: "Lands 14:10 on the Friday and the museum closes at 17:00. The transfer needs to be the early one.",
      action: null,
    },
    {
      family: "The Weiss family",
      where: "Rome · home Sunday",
      status: "To plan",
      statusBg: "#FAF8F3",
      statusFg: "#193F46",
      bg: "#ffffff",
      border: "rgba(16, 47, 53,.08)",
      line: "Nothing outstanding. Printed itinerary went out on the 12th.",
      action: null,
    },
  ],
};
