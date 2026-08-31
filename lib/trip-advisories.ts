import { advisoryFor, ADVISORY_LEVELS, type Advisory } from "@/lib/travel-advisories";
import type { StopFacts } from "@/lib/command-center";

/**
 * What is currently being said about the countries THIS trip goes to.
 *
 * The advisory already showed on a beis hachaim's own page, one country at a
 * time, which answers "what about Ukraine" for somebody who happens to open
 * the Ukraine page. It never answered the question a person with a trip has:
 * I am going to four places in three countries — is there anything I should
 * know before I go.
 *
 * WHAT IS NOT KNOWN IS SAID, NOT SKIPPED. A stop with no country on it, and a
 * country the State Department has published nothing for, are both counted and
 * named. It is said as what the SOURCE has published rather than as what this
 * site holds — "no advisory on record" describes our filing cabinet, which is
 * not the traveller's question and is the sort of internal-status wording the
 * customer-copy rule exists to keep off the site. Listing three
 * countries as fine while a fourth was never checked is the specific way this
 * screen could mislead somebody — a quiet list reads as "all clear", and here
 * that is a sentence about somebody's safety rather than about a phone number.
 *
 * NOTHING IS RE-WORDED. The level, its label and the summary are the State
 * Department's own, shown with the date they were published and a link to the
 * source. This site does not have an opinion about whether somebody should go
 * to Ukraine; it can say what the advisory says and when it was last updated.
 */

export type CountryAdvisory = {
  country: string;
  /** How many of the trip's stops are in it, so the biggest is not buried. */
  stops: number;
  advisory: Advisory | null;
};

export type TripAdvisories = {
  /** One row per country the trip touches, worst first, then by stop count. */
  countries: CountryAdvisory[];
  /** Stops carrying no country at all. Named rather than dropped. */
  stopsWithNoCountry: number;
  /** The worst level anywhere on the trip, or null when nothing is known. */
  highest: number | null;
  /** True when at least one country was looked for and not found in the feed. */
  anyUnknown: boolean;
};

/** The tone a level should be drawn in, or the neutral one for an unknown. */
export function toneFor(level: number | null): "ok" | "caution" | "warn" | "danger" | "unknown" {
  if (level === null) return "unknown";
  return ADVISORY_LEVELS[level]?.tone ?? "unknown";
}

/** True when a level is worth leading with rather than listing. */
export function worthLeadingWith(level: number | null): boolean {
  return level !== null && level >= 3;
}

export function tripAdvisories(stops: readonly StopFacts[], advisories: readonly Advisory[]): TripAdvisories {
  const counts = new Map<string, { name: string; stops: number }>();
  let stopsWithNoCountry = 0;

  for (const stop of stops) {
    const name = stop.country?.trim();
    if (!name) {
      stopsWithNoCountry += 1;
      continue;
    }
    // Keyed case-insensitively so "poland" and "Poland" are one country, and
    // shown with the spelling the trip actually used.
    const key = name.toLowerCase();
    const held = counts.get(key);
    counts.set(key, { name: held?.name ?? name, stops: (held?.stops ?? 0) + 1 });
  }

  const countries: CountryAdvisory[] = [...counts.values()].map((entry) => ({
    country: entry.name,
    stops: entry.stops,
    advisory: advisoryFor([...advisories], entry.name),
  }));

  countries.sort((a, b) => {
    // Worst first. A country nobody could look up sorts below a known level
    // rather than above it — it is not a reassurance and it is not a warning,
    // and putting it at the top would make every trip look alarming.
    const levelA = a.advisory?.level ?? -1;
    const levelB = b.advisory?.level ?? -1;
    if (levelA !== levelB) return levelB - levelA;
    if (a.stops !== b.stops) return b.stops - a.stops;
    return a.country.localeCompare(b.country);
  });

  const levels = countries.map((entry) => entry.advisory?.level).filter((level): level is number => typeof level === "number");

  return {
    countries,
    stopsWithNoCountry,
    highest: levels.length ? Math.max(...levels) : null,
    anyUnknown: countries.some((entry) => !entry.advisory || entry.advisory.level === null),
  };
}

/**
 * The one sentence at the top.
 *
 * Says what is known AND what is not, in that order, because the second half
 * is what stops the first from being read as a clean bill of health.
 */
export function summarise(roll: TripAdvisories): string {
  if (!roll.countries.length && !roll.stopsWithNoCountry) return "No stops on this trip yet.";

  const known = roll.countries.filter((entry) => entry.advisory?.level != null);
  const missing = roll.countries.length - known.length;

  const head = known.length
    ? roll.highest !== null && roll.highest >= 3
      ? `${ADVISORY_LEVELS[roll.highest]?.label ?? "A higher level"} for at least one country on this trip.`
      : `Nothing above ${ADVISORY_LEVELS[roll.highest ?? 1]?.label ?? "normal precautions"} on the countries checked.`
    : "None of this trip's countries could be looked up.";

  const gaps = [
    missing ? `${missing} ${missing === 1 ? "country has" : "countries have"} no published advisory` : null,
    roll.stopsWithNoCountry
      ? `${roll.stopsWithNoCountry} ${roll.stopsWithNoCountry === 1 ? "stop has" : "stops have"} no country on them`
      : null,
  ].filter(Boolean);

  return gaps.length ? `${head} ${gaps.join(", and ")} — so this is not the whole trip.` : head;
}
