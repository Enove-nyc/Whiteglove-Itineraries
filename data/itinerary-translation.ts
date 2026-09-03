// A translated read-out of an itinerary — pure data model + pure
// transforms. The translations themselves come from
// lib/itinerary-translation-ai.ts; this file is what happens to them
// afterward, the same shape data/packing-list.ts and
// data/itinerary-optimization.ts already keep for their own AI results.
//
// ONLY FREE TEXT IS EVER TRANSLATED — an activity's name and notes, a
// lodging stay's notes, a flight's notes, the trip's own title. NEVER a
// date, a time, an address, a phone number or a confirmation number: those
// are facts a traveler has to act on exactly as given, not prose to render
// in another language. A hotel's own NAME stays untranslated too — it is
// what the front desk is actually called, not a phrase to translate.

export type TranslatedItinerary = {
  language: string; // e.g. "Spanish", "French" — whatever the traveler asked for, verbatim
  title?: string;
  /** Keyed by the activity's own id. */
  activities: Record<string, { name?: string; notes?: string }>;
  /** Keyed by the lodging stay's own id — notes only, never the hotel's name. */
  lodging: Record<string, { notes?: string }>;
  /** Keyed by the flight's own id — notes only. */
  flights: Record<string, { notes?: string }>;
  generatedAt: string;
  /** What this was generated FOR — compared against the itinerary's current
   *  signature to know whether it's gone stale. */
  forSignature: string;
};

export function emptyTranslation(language: string): TranslatedItinerary {
  return { language, activities: {}, lodging: {}, flights: {}, generatedAt: "", forSignature: "" };
}

export function isStale(translation: TranslatedItinerary, currentSignature: string): boolean {
  return translation.forSignature !== currentSignature;
}
