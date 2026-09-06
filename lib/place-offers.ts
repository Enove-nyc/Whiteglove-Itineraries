/**
 * A place somebody put on their trip that the site does not have.
 *
 * Travellers find things the site has not got to yet — a hotel in a town with
 * two, a museum worth an afternoon, a shul that keeps a key. Every one of them
 * is typed into somebody's itinerary and then goes nowhere, and the next person
 * planning the same town starts from the same blank.
 *
 * So when a place is added that the site does not hold, the traveller is asked
 * whether they would send it in.
 *
 * ASKED. NOT TAKEN.
 *
 * An itinerary is a private document. It has somebody's dates on it, the notes
 * they wrote to themselves, who they are travelling with, the reference number
 * for their hotel. Reading it and turning parts of it into website content
 * because it happened to be on our server would be taking something that was
 * handed over for one purpose and using it for another — which is the thing
 * data protection law is about, and is wrong whether or not a law reaches it.
 *
 * So nothing leaves an itinerary without a press. The notice names the place,
 * lists every field that would be sent, and says what would not be. If they say
 * no, that is remembered and they are not asked about it again.
 *
 * WHAT IS SENT IS THE PLACE, NOT THE TRIP. Where it is, what it is called, how
 * to reach it. Never when they are going, never what they wrote to themselves,
 * never the name of the trip, never who else is on it, never a booking
 * reference or a boarding pass. `fieldsSent` below IS the payload — the notice
 * is drawn from the same function that builds what goes — so the two cannot
 * drift apart and tell somebody a different story from the truth.
 */

import type { Itinerary } from "@/data/itinerary";

export type OfferKind = "stop" | "stay";

/**
 * A place, lifted out of a trip with nothing of the trip attached.
 *
 * Deliberately NOT the itinerary's own type. Building a separate object is
 * what makes leaving something out the default: a field added to ItinActivity
 * later does not appear here unless somebody adds it on purpose, whereas
 * passing the stop itself would carry every future field automatically.
 */
export type TripPlace = {
  /** The stop or stay it came from, so an answer can be tied back to it. */
  id: string;
  kind: OfferKind;
  name: string;
  address?: string;
  coordinates?: string;
  country?: string;
  /** A link they put on it — a map, the hotel's own site. */
  href?: string;
  /** The number they put on it. Named in the notice, because it may be personal. */
  phone?: string;
};

const text = (value: unknown): string | undefined => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || undefined;
};

/**
 * The places on a trip, each carrying only itself.
 *
 * Flights are not here. A flight is an airline and a number, not somewhere the
 * site could list, and the traveller's booking reference sits beside it.
 */
export function placesInTrip(itin: Itinerary): TripPlace[] {
  const stops: TripPlace[] = (itin.activities ?? []).map((a) => ({
    id: a.id,
    kind: "stop" as const,
    name: text(a.name) ?? "",
    address: text(a.address),
    coordinates: text(a.coordinates),
    country: text(a.country),
    href: text(a.href),
    phone: text(a.phone),
  }));
  const stays: TripPlace[] = (itin.lodging ?? [])
    // A night on a coach is not a place. It has no address and never will.
    .filter((l) => l.type !== "overnight-transit")
    .map((l) => ({
      id: l.id,
      kind: "stay" as const,
      name: text(l.name) ?? "",
      address: text(l.address),
      coordinates: text(l.coordinates),
      href: undefined,
      phone: text(l.phone),
    }));
  return [...stops, ...stays];
}

/**
 * Is this a place at all?
 *
 * A name and somewhere on earth. "Lunch", "Rest", "Drive to Kraków" are real
 * things to have on a day and are not places anybody could add to a directory —
 * offering to send them in would be asking a question with no good answer.
 */
export function worthOffering(place: TripPlace): boolean {
  if ((place.name?.trim().length ?? 0) < 3) return false;
  return Boolean(place.address || place.coordinates);
}

/**
 * Does the site already hold this?
 *
 * The site's search is fuzzy on purpose — it has to find Lizhensk from
 * "lezajsk" — and that is too loose to answer this question. "Hotel Sanz" hits
 * the town of Sanz, and treating that as "we have it" would silently drop the
 * hotel. So a hit only counts when its own title really is this place: the same
 * name, or the name inside a longer title.
 */
export function siteAlreadyHas(name: string, hitTitles: string[]): boolean {
  const wanted = normalizeName(name);
  if (!wanted) return true; // Nothing to ask about.
  return hitTitles.some((title) => {
    const found = normalizeName(title);
    // ONE DIRECTION ONLY. A site entry whose title CONTAINS what they typed is
    // the same place under a fuller name — "Hotel Sanz" against our "Hotel
    // Sanz Kraków". The other way round is the trap: our "Sanz", the town,
    // contains nothing but is contained BY "Hotel Sanz", and treating that as
    // a match would decide we already have the hotel and never ask.
    //
    // The two mistakes are not the same size. Offering something the site
    // turns out to have costs one dismissal. Deciding we have something we do
    // not costs the place, silently, and nobody ever finds out.
    return found === wanted || found.includes(wanted);
  });
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // Leżajsk and Lezajsk are the same town.
    .replace(/[^a-z0-9֐-׿ ]+/g, " ") // Keep Hebrew letters: names here are often in them.
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * How an answer is remembered.
 *
 * By the place, not by the stop. Somebody who says no to a hotel on their
 * Poland trip should not be asked again when they put the same hotel on next
 * year's — it is the same question and they have answered it.
 */
export function offerKey(place: TripPlace): string {
  return `whiteGlovePlaceOffer:${normalizeName(place.name)}|${normalizeName(place.address ?? place.coordinates ?? "")}`;
}

/* ---- what would be sent ------------------------------------------------ */

export type SentField = { label: string; value: string };

/**
 * Every field that would go, in the words the traveller reads.
 *
 * THIS IS THE PAYLOAD. `submissionText` is built from it and the notice lists
 * it, so there is exactly one description of what leaves and both the screen
 * and the wire read it. A field cannot be added to what is sent without
 * appearing in the notice, because they are the same list.
 */
export function fieldsSent(place: TripPlace): SentField[] {
  const fields: SentField[] = [{ label: "Name", value: place.name }];
  if (place.address) fields.push({ label: "Address", value: place.address });
  if (place.coordinates) fields.push({ label: "Coordinates", value: place.coordinates });
  if (place.country) fields.push({ label: "Country", value: place.country });
  if (place.href) fields.push({ label: "Link", value: place.href });
  // Named separately in the notice as well, because a number somebody typed on
  // a stop is as likely to be a friend's as a hotel's, and they should see
  // which one they are about to send.
  if (place.phone) fields.push({ label: "Phone", value: place.phone });
  return fields;
}

/**
 * What is never sent, said plainly.
 *
 * Written out rather than implied. Somebody deciding whether to share
 * something needs to know what stays theirs, and "we only send the place" is
 * not a sentence anybody can check.
 */
export const NEVER_SENT = [
  "your dates and times",
  "the notes you wrote to yourself",
  "the name of your trip",
  "anyone you are travelling with",
  "any booking reference, ticket or boarding pass",
] as const;

/** The place as the owner will read it on the suggestion. */
export function submissionText(place: TripPlace): string {
  return fieldsSent(place)
    .map((field) => `${field.label}: ${field.value}`)
    .join("\n");
}

export function offerTitle(place: TripPlace): string {
  return place.kind === "stay" ? `Somewhere to stay: ${place.name}` : `Somewhere to go: ${place.name}`;
}

/**
 * The whole submission, ready for /api/content/suggestions.
 *
 * `targetType: "new"` is the site's existing word for "something we do not
 * have yet", so these land in the same review screen as every other
 * suggestion and need no separate queue for the owner to remember to check.
 */
export function submissionFor(place: TripPlace, from: { name: string; email: string }) {
  return {
    targetType: "new" as const,
    targetId: place.kind === "stay" ? "new-stay" : "new-stop",
    title: offerTitle(place),
    name: from.name,
    email: from.email,
    issue: place.kind === "stay" ? "A place to stay that is not on the site" : "A place to go that is not on the site",
    currentInfo: "Not on the site — sent in by a traveller who added it to their own trip.",
    suggestedInfo: submissionText(place),
    source: "Added to their itinerary, and sent in when asked.",
    // The same fields, carried structured as well as in the paragraph, so the
    // review card shows them one by one and accepting can publish a listing
    // from them. The paragraph stays for the notification email, which is plain
    // text. Only the place is sent — never anything of the trip (see the file
    // header): these are exactly the fields the traveller saw named in fieldsSent.
    place: {
      kind: place.kind,
      name: place.name,
      address: place.address,
      coordinates: place.coordinates,
      country: place.country,
      href: place.href,
      phone: place.phone,
    },
  };
}
