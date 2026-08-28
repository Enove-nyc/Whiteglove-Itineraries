/**
 * The one thing a visitor could not see: what they actually end up holding.
 *
 * THE GAP THIS FILLS. The pages explain what the planner does. What nobody
 * could do was look at the thing at the end of it. "A written day-by-day
 * itinerary" is a description of a deliverable, not the deliverable, and a
 * person deciding whether to pay is deciding about the deliverable.
 *
 * THIS IS THE GENERAL-TRAVEL SAMPLE, AND THAT IS THE POINT. The two products
 * share a lineage and this file used to be the same week on both: a family of
 * five in the Roman Ghetto, built around the Shabbos in the middle of it, with
 * a hechsher to confirm and a Friday that stops early. All of that is true and
 * good on White Glove Kosher Travel, and none of it belongs on White Glove
 * Itineraries, which sells trip-building to advisers with clients of every
 * kind. An adviser reading the sample was being shown a different company's
 * deliverable as proof of what this one produces.
 *
 * So the week here is an ordinary one. Same city, same family of five, same
 * shape — a red-eye in, a slow first afternoon, two full days, a deliberately
 * empty one, and out on a Sunday rather than a Friday. What changed is that
 * the days are now sightseeing rather than a religious calendar.
 *
 * WHY IT IS STILL NOT AN INVENTED BROCHURE, and the line is worth being
 * precise about:
 *
 *   • Every PLACE named is a real, checkable Rome landmark. The Colosseum, the
 *     Pantheon, the Trevi Fountain, the Vatican Museums, Villa Borghese,
 *     Trastevere and Ostia Antica are where the file says they are.
 *
 *   • Nothing is named that WOULD be a claim. No hotel, no airline, no flight
 *     number, no confirmation code, no price. A real itinerary carries all of
 *     those and this one says so in the place each would sit, because the shape
 *     of the document is the thing being shown and a made-up hotel name would
 *     be the one line on it that was not true of anywhere.
 *
 *   • No testimonial, no rating, no "chosen by 300 advisers". There is no real
 *     one to print and this page does not invent one. The proof on offer is
 *     the work itself.
 *
 * It goes through the same buildDays() as a customer's trip, so the times, the
 * walking and driving between stops and the evening entries are computed here
 * exactly as they are for anybody else. If the planner changes, the sample
 * changes with it, which is the only way a sample stays true.
 */

import type { Itinerary } from "@/data/itinerary";

/** The label carried on the page, in the metadata, and in the tests. */
export const SAMPLE_NOTICE =
  "A sample, not a booking. The places are real; the flights and the hotel are left unnamed because nothing here is reserved.";

export const SAMPLE_ITINERARY: Itinerary = {
  title: "Rome — a week, family of five",
  startDate: "2026-10-25",
  endDate: "2026-11-01",
  dayStartTime: "09:00",
  travelers: [
    { id: "sample-a1", name: "Adult", kind: "adult" },
    { id: "sample-a2", name: "Adult", kind: "adult" },
    { id: "sample-c1", name: "Child", kind: "child", notes: "Age 11" },
    { id: "sample-c2", name: "Child", kind: "child", notes: "Age 7" },
    { id: "sample-c3", name: "Child", kind: "child", notes: "Age 4" },
  ],
  flights: [
    {
      id: "sample-out",
      from: "New York (JFK)",
      to: "Rome (FCO)",
      date: "2026-10-25",
      departTime: "18:40",
      arriveTime: "08:55",
      arriveDate: "2026-10-26",
      // No airline, no flight number, no confirmation — see the note at the
      // top of this file. A real itinerary carries all three, and this says
      // where they sit rather than inventing them.
      notes: "Your own itinerary carries the airline, the flight number and the booking reference here.",
    },
    {
      id: "sample-home",
      from: "Rome (FCO)",
      to: "New York (JFK)",
      date: "2026-11-01",
      departTime: "11:20",
      arriveTime: "15:10",
      notes: "A late-morning departure, so the last day is not spent watching a clock.",
    },
  ],
  lodging: [
    {
      id: "sample-hotel",
      type: "hotel",
      name: "A hotel near the Pantheon",
      address: "Rome",
      coordinates: "41.8986, 12.4769",
      checkIn: "2026-10-26",
      checkOut: "2026-11-01",
      notes:
        "Chosen for where it stands rather than for its rating: central enough that four of the week's stops are on foot. Your own itinerary names the property, the address and the confirmation number.",
    },
  ],
  activities: [
    {
      id: "sample-arrive",
      name: "Land, and settle in",
      address: "Rome",
      date: "2026-10-26",
      startTime: "09:30",
      durationMins: 180,
      order: 1,
      notes: "Nothing planned for the first afternoon. A day that starts with a red-eye does not hold a schedule.",
    },
    {
      id: "sample-trastevere",
      name: "An evening walk through Trastevere",
      address: "Trastevere, Rome",
      coordinates: "41.8892, 12.4694",
      date: "2026-10-26",
      startTime: "17:00",
      durationMins: 120,
      order: 2,
      notes: "Across the river and back. Nothing to book, and it keeps everybody awake until a sensible bedtime.",
    },
    {
      id: "sample-colosseum",
      name: "The Colosseum and the Roman Forum",
      address: "Piazza del Colosseo, Rome",
      coordinates: "41.8902, 12.4922",
      date: "2026-10-27",
      startTime: "09:30",
      durationMins: 180,
      order: 1,
      notes: "Book the timed entry ahead. One ticket covers the Forum and the Palatine on the same day.",
    },
    {
      id: "sample-pantheon",
      name: "The Pantheon and the Trevi Fountain",
      address: "Piazza della Rotonda, Rome",
      coordinates: "41.8986, 12.4769",
      date: "2026-10-27",
      startTime: "15:30",
      durationMins: 120,
      order: 2,
      notes: "Both are open squares and free to stand in, which is what makes them work with a four-year-old.",
    },
    {
      id: "sample-vatican",
      name: "Vatican Museums",
      address: "Viale Vaticano, Rome",
      coordinates: "41.9065, 12.4536",
      date: "2026-10-28",
      startTime: "09:00",
      durationMins: 210,
      order: 1,
      notes: "The longest single thing on the trip. Put it on a day with nothing after it.",
    },
    {
      id: "sample-free",
      name: "An unplanned day",
      address: "Rome",
      date: "2026-10-29",
      startTime: "10:00",
      durationMins: 240,
      order: 1,
      notes:
        "Deliberately empty. A week with seven full days on it is a week somebody abandons on day three.",
    },
    {
      id: "sample-borghese",
      name: "Villa Borghese and the gardens",
      address: "Piazzale Napoleone I, Rome",
      coordinates: "41.9142, 12.4922",
      date: "2026-10-30",
      startTime: "10:00",
      durationMins: 180,
      order: 1,
      notes: "The gallery needs a timed ticket; the gardens around it do not, and there are bicycles to hire.",
    },
    {
      id: "sample-ostia",
      name: "Ostia Antica, out for the day",
      address: "Viale dei Romagnoli, Ostia Antica",
      coordinates: "41.7556, 12.2917",
      date: "2026-10-31",
      startTime: "09:30",
      durationMins: 300,
      order: 1,
      notes:
        "Forty minutes on the train and the one thing on the day. A whole Roman town, and quiet enough that children can run in it.",
    },
    {
      id: "sample-last-morning",
      name: "The last morning",
      address: "Rome",
      date: "2026-11-01",
      startTime: "08:00",
      durationMins: 60,
      order: 1,
      notes: "Out to the airport with time in hand. The transfer sits here in your own itinerary, with its confirmation.",
    },
  ],
  notes:
    "From the planning answers:\n• Kind of trip: Family trip\n• Destination: Rome\n• Travellers: 2 adults, 3 children (ages 4, 7 and 11)\n• Pace: Balanced\n• Access needs: Short walking distances\n• Must include: One day out of the city",
};

/**
 * What each part of the document is, for the panel beside it.
 *
 * Written as what the READER gets rather than what the planner does, because
 * the question this page answers is "what do I end up holding".
 */
export const WHAT_IS_IN_IT: ReadonlyArray<[string, string]> = [
  ["A day per page", "Every day as one running schedule — the time, what it is, where, and the line of detail that matters."],
  ["Real driving and walking times", "Between each stop, from road routing rather than straight-line distance, so the day holds up."],
  ["A day with nothing on it", "Planned in, not left over. The week here has one, and it is the reason the other six survive contact."],
  ["On the phone as well as on paper", "The same trip opens as an app for whoever is travelling, with the wallet kept for when there is no signal."],
  ["Room to change it", "It stays in the account that built it. Move a day, drop a stop, hand it over again."],
  ["Nothing invented", "No airline, no confirmation code and no price is printed here, because none of them has happened yet."],
];
