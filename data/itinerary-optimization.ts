// AI itinerary optimization — pure data model + pure transforms. The
// suggestions themselves come from lib/itinerary-optimization-ai.ts; this
// file is what happens to them afterward: dismissing one, knowing when the
// list has gone stale. The same shape data/packing-list.ts already keeps
// for the same reason (a saved AI result needs to know when the thing it
// was generated for has since changed).
//
// A SUGGESTION IS NOT A CORRECTNESS CHECK. data/itinerary.ts's own
// buildDays() already computes real conflicts deterministically — an
// activity starting before the traveler could possibly arrive, a day with
// no free hours left — and the planner already sees those warnings while
// editing. What this adds is judgment a deterministic check can't make:
// pacing, whether a day is overloaded while another sits empty, two nearby
// stops split across separate days for no reason. The AI is given those
// deterministic warnings as context, not asked to re-find them.

export type OptimizationSuggestion = {
  id: string;
  message: string;
  dismissed: boolean;
};

export type OptimizationResult = {
  suggestions: OptimizationSuggestion[];
  generatedAt: string;
  /** What the result was generated FOR — compared against the trip's
   *  current signature to know whether it's gone stale. */
  forSignature: string;
};

export function emptyOptimizationResult(): OptimizationResult {
  return { suggestions: [], generatedAt: "", forSignature: "" };
}

/**
 * A short fingerprint of what the itinerary's shape actually is — every
 * flight, lodging stay and activity's own id, date and time, joined into
 * one string. Not a hash; just cheap and stable to compare. Two different
 * itineraries that happen to collide are not a correctness problem: the
 * worst case is a missed "this may be out of date" nudge, never data loss.
 */
export function itinerarySignature(itin: {
  startDate: string;
  endDate: string;
  flights: Array<{ id: string; date: string; departTime?: string }>;
  lodging: Array<{ id: string; checkIn: string; checkOut: string }>;
  activities: Array<{ id: string; date: string; startTime?: string; order?: number }>;
}): string {
  const parts = [
    itin.startDate,
    itin.endDate,
    ...itin.flights.map((f) => `f:${f.id}:${f.date}:${f.departTime ?? ""}`).sort(),
    ...itin.lodging.map((l) => `l:${l.id}:${l.checkIn}:${l.checkOut}`).sort(),
    ...itin.activities.map((a) => `a:${a.id}:${a.date}:${a.startTime ?? ""}:${a.order ?? ""}`).sort(),
  ];
  return parts.join("|");
}

export function isStale(result: OptimizationResult, currentSignature: string): boolean {
  return result.forSignature !== currentSignature;
}

export function dismissSuggestion(result: OptimizationResult, id: string, dismissed: boolean): OptimizationResult {
  return { ...result, suggestions: result.suggestions.map((s) => (s.id === id ? { ...s, dismissed } : s)) };
}

/** What's actually worth showing — a dismissed tip stays out of the way. */
export function activeSuggestions(result: OptimizationResult): OptimizationSuggestion[] {
  return result.suggestions.filter((s) => !s.dismissed);
}
