/**
 * What is still missing before somebody actually travels.
 *
 * The site has always been able to answer "what do we know about Lizhensk".
 * What it could not answer is the question a person actually has the week
 * before they go: I have five stops — which of them am I going to turn up at
 * and find a locked gate?
 *
 * That question is only answerable across a whole trip. A single kever page
 * showing "no access contact verified" is a fact about that page; five of them
 * together, with the two that DO have numbers separated out, is a list of
 * phone calls to make on Sunday. This turns one into the other.
 *
 * Nothing here reads a database or the network — the page gathers the facts
 * and hands them in, so these rules can be tested on their own, which matters
 * because they decide what somebody is told to worry about.
 */

/** What the site knows about one stop, gathered by the page. */
export type StopFacts = {
  id: string;
  /**
   * The country this stop is in, where it is known.
   *
   * From the itinerary where the traveller or the planner recorded one, and
   * from the beis hachaim's own record otherwise. Used to say what the state
   * department is currently saying about the places this trip actually goes —
   * see lib/trip-advisories.ts.
   */
  country?: string;
  name: string;
  yiddishName?: string;
  href?: string;
  /** YYYY-MM-DD, when they plan to be there. */
  plannedDate?: string;
  /** A checked coordinate for the grave itself, not the town. */
  coordinates?: string;
  address?: string;
  /** Somebody who can let you in, if there is one on record. */
  contacts: Array<{ label: string; phone?: string; note?: string }>;
  /** True when this stop is a beis hachaim rather than a town or a hotel. */
  isKever: boolean;
  /** Whether the town it is in has any published kosher food. */
  hasKosherFood?: boolean;
  /** Whether it has anywhere published to stay. */
  hasLodging?: boolean;
};

export type Concern = {
  /** Sorted on: 1 is "you may not get in", 3 is "worth knowing". */
  weight: 1 | 2 | 3;
  /** What is wrong, in the words somebody would use. */
  says: string;
  /** What to do about it. Omitted when there is nothing useful to say. */
  doThis?: string;
};

export type StopReadiness = {
  stop: StopFacts;
  concerns: Concern[];
  /** Numbers worth having in your phone before you leave. */
  callAhead: Array<{ label: string; phone: string; note?: string }>;
  /** True when nothing needs doing. */
  ready: boolean;
};

/**
 * The concerns for one stop, worst first.
 *
 * Deliberately quiet about things that are merely unknown. "No kosher food
 * listed" is not a problem for a town somebody is driving through at eleven in
 * the morning, and a list that says everything is a list nobody reads. What
 * earns a place here is something that can stop the visit happening: no way in,
 * and nowhere to navigate to.
 */
export function stopConcerns(stop: StopFacts): Concern[] {
  const concerns: Concern[] = [];
  const reachable = stop.contacts.some((c) => c.phone?.trim());

  if (stop.isKever && !reachable) {
    concerns.push({
      weight: 1,
      says: "No contact to let you in.",
      doThis: "Many batei hachaim are locked. Ask locally, or write in if you find out who holds the key.",
    });
  }

  if (!stop.coordinates?.trim() && !stop.address?.trim()) {
    concerns.push({
      weight: 1,
      says: "No address and no coordinates — there is nowhere to navigate to.",
    });
  } else if (stop.isKever && !stop.coordinates?.trim()) {
    concerns.push({
      weight: 2,
      says: "The exact grave has not been checked — only the address.",
      doThis: "An address can put you at the wrong end of a cemetery. Allow time to look, or ask when you call.",
    });
  }

  if (!stop.plannedDate?.trim()) {
    concerns.push({ weight: 3, says: "No date yet." });
  }

  return concerns.sort((a, b) => a.weight - b.weight);
}

export function stopReadiness(stop: StopFacts): StopReadiness {
  const concerns = stopConcerns(stop);
  const callAhead = stop.contacts
    .filter((c) => c.phone?.trim())
    .map((c) => ({ label: c.label, phone: c.phone!.trim(), note: c.note }));
  return { stop, concerns, callAhead, ready: concerns.every((c) => c.weight === 3) };
}

export type TripReadiness = {
  stops: StopReadiness[];
  /** Every stop that could stop the visit happening, worst first. */
  needsAttention: StopReadiness[];
  /** Every number worth having, across the whole trip. */
  callAhead: Array<{ stop: string; label: string; phone: string; note?: string }>;
  /** How many stops have nothing wrong. */
  readyCount: number;
};

/**
 * The whole trip.
 *
 * Ordered by the date somebody will be there, then by the order they put them
 * in — the same order the itinerary shows, so the two screens agree. A stop
 * with no date sorts last rather than first: it is the one they have not
 * decided about, not the one they are leaving for.
 */
export function tripReadiness(stops: StopFacts[]): TripReadiness {
  const inOrder = [...stops].sort((a, b) => {
    const left = a.plannedDate?.trim() || "9999-99-99";
    const right = b.plannedDate?.trim() || "9999-99-99";
    return left.localeCompare(right);
  });

  const readiness = inOrder.map(stopReadiness);
  return {
    stops: readiness,
    needsAttention: readiness
      .filter((r) => r.concerns.some((c) => c.weight <= 2))
      .sort((a, b) => (a.concerns[0]?.weight ?? 9) - (b.concerns[0]?.weight ?? 9)),
    callAhead: readiness.flatMap((r) => r.callAhead.map((c) => ({ stop: r.stop.name, ...c }))),
    readyCount: readiness.filter((r) => r.ready).length,
  };
}

/**
 * How long until they go, in words.
 *
 * "In three days" is something you act on. A date is something you work out.
 * Returns null when there is no date at all, which the page renders as nothing
 * rather than as "unknown".
 */
export function daysUntil(date: string | undefined, today: string): string | null {
  if (!date?.trim()) return null;
  const start = Date.parse(`${date}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(now)) return null;
  const days = Math.round((start - now) / 86_400_000);
  if (days < 0) return "under way";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 14) return `in ${days} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}
