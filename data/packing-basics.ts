/**
 * The starter packing list — what anybody packs for a trip, before a trip
 * exists.
 *
 * WHY THIS EXISTS. /packing would otherwise have nothing to say to somebody
 * who has not built a trip yet: it asks the account for the trip in the
 * planner and generates a list from that trip's destinations, dates and stops.
 * This is what the page opens with instead.
 *
 * It is deliberately NOT the AI list with the trip taken out of it — a general
 * list cannot know where somebody is going, and pretending otherwise is how a
 * checklist becomes wrong. It is the part that does not depend on the
 * destination; the tailored list stays what the planner produces from a real
 * trip.
 *
 * THIS IS THE NEUTRAL VERSION, AND THE DIFFERENCE IS THE WHOLE POINT. White
 * Glove Kosher Travel keeps its own copy, which carries a Shabbos and davening
 * category and kosher food lines, because it is written for a Torah-observant
 * traveller. This product is general travel and must not carry any of that —
 * so this is a parallel list rather than a shared one with a flag on it. Two
 * short hand-written lists are cheaper and far clearer than one list with
 * conditionals threaded through it.
 *
 * PURE DATA, and hand-written rather than generated, because a fixed list on a
 * public page is a thing the site is asserting and should be readable in one
 * screen by whoever maintains it.
 */

export type PackingBasic = {
  id: string;
  label: string;
  category: string;
};

/**
 * Categories in the order they are shown, chosen to match the shape the
 * generated list already uses, so a visitor who signs in later meets the same
 * groupings rather than a different-looking page.
 */
export const PACKING_BASICS: readonly PackingBasic[] = [
  { id: "b-passport", label: "Passport, and a photo of it kept separately", category: "Documents" },
  { id: "b-visa", label: "Visa or entry permit, if the country needs one", category: "Documents" },
  { id: "b-tickets", label: "Flight and hotel confirmations", category: "Documents" },
  { id: "b-insurance", label: "Travel insurance details", category: "Documents" },
  { id: "b-cards", label: "A second payment card, packed apart from the first", category: "Documents" },
  { id: "b-licence", label: "Driving licence, if you are hiring a car", category: "Documents" },
  { id: "b-cash", label: "A little local currency for the first day", category: "Documents" },

  { id: "b-adapter", label: "Plug adapter for the country you are going to", category: "Electronics" },
  { id: "b-powerbank", label: "Power bank, in hand luggage", category: "Electronics" },
  { id: "b-cables", label: "Charging cables for everything you are bringing", category: "Electronics" },
  { id: "b-headphones", label: "Headphones", category: "Electronics" },

  { id: "b-meds", label: "Medication, in its original packaging", category: "Health and toiletries" },
  { id: "b-firstaid", label: "Small first-aid kit", category: "Health and toiletries" },
  { id: "b-sunscreen", label: "Sunscreen", category: "Health and toiletries" },
  { id: "b-toiletries", label: "Toiletries in travel sizes", category: "Health and toiletries" },

  { id: "b-weather", label: "A layer for the weather where you are going", category: "Clothing" },
  { id: "b-walking", label: "Comfortable walking shoes", category: "Clothing" },
  { id: "b-smart", label: "One smarter outfit", category: "Clothing" },
  { id: "b-laundry", label: "A bag for laundry", category: "Clothing" },

  { id: "b-snacks", label: "Snacks for the journey", category: "Food and drink" },
  { id: "b-bottle", label: "Refillable water bottle, empty through security", category: "Food and drink" },
];
