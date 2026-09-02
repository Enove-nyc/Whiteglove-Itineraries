import { COUNTRY_DOCS, type CountryDocs } from "@/data/travel-guide";

/**
 * BEFORE YOU GO — the three official pages, for the countries this trip
 * actually visits.
 *
 * WHITE GLOVE STATES NOTHING HERE, and that is the whole design. Entry rules
 * are per-passport, change without notice, and are the one thing a traveller
 * cannot afford to read second-hand. So this card holds no requirement, no
 * visa rule, no vaccination list — only the government's own page, named, and
 * the date the advisory feed behind it was read. The same position
 * data/travel-guide.ts already takes, said in the place somebody is actually
 * planning from.
 *
 * IT IS NOT A NEW DATABASE. The entry link and the State Department country
 * page are the ones already listed in data/travel-guide.ts; the advisory level
 * comes from the live feed lib/travel-advisories.ts already fetches. The one
 * genuinely new source is health, and it is a URL pattern rather than a body
 * of content: the CDC publishes a destination page per country and this points
 * at it.
 *
 * AN EMPTY CARD IS WORSE THAN NO CARD. A country the site holds no official
 * page for produces nothing, and a trip with no known country produces nothing
 * at all — see beforeYouGo, which returns an empty array rather than a row of
 * dead headings.
 */

/**
 * The CDC's destination pages are addressed by a lowercase, hyphenated country
 * name. Derived rather than listed, so a country added to COUNTRY_DOCS gets a
 * health link without a second list to keep in step — and only ever offered
 * for a country that is already in that list, so this cannot invent a page for
 * somewhere the site knows nothing about.
 */
function healthUrl(country: string): string {
  const slug = country.trim().toLowerCase().replace(/[^a-z\s-]/g, "").replace(/\s+/g, "-");
  return slug ? `https://wwwnc.cdc.gov/travel/destinations/traveler/none/${slug}` : "";
}

export type GuidanceLink = { label: string; href: string };

export type CountryGuidance = {
  country: string;
  links: GuidanceLink[];
  /** The owner's own caveat on that country, when travel-guide.ts carries one. */
  note?: string;
};

/** Case- and whitespace-insensitive, so "poland" on a stop still matches. */
function docsFor(country: string): CountryDocs | undefined {
  const want = country.trim().toLowerCase();
  return COUNTRY_DOCS.find((doc) => doc.country.toLowerCase() === want);
}

/**
 * One entry per country the trip visits that the site holds official pages
 * for, in the order they were first visited.
 *
 * `countries` comes from the stops themselves (StopFacts.country), so a trip
 * that never says where it is produces nothing — which is correct: guessing a
 * country from an address and then linking to its entry rules would be the
 * one wrong answer here.
 */
export function beforeYouGo(countries: readonly string[]): CountryGuidance[] {
  const seen = new Set<string>();
  const out: CountryGuidance[] = [];
  for (const raw of countries) {
    const country = raw?.trim();
    if (!country) continue;
    const key = country.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const docs = docsFor(country);
    if (!docs) continue; // No official page on record — say nothing rather than guess.
    const health = healthUrl(docs.country);
    out.push({
      country: docs.country,
      ...(docs.note ? { note: docs.note } : {}),
      links: [
        { label: "Entry requirements", href: docs.officialUrl },
        { label: "Safety advisory", href: docs.stateDeptUrl },
        ...(health ? [{ label: "Health guidance", href: health }] : []),
      ],
    });
  }
  return out;
}

/**
 * "Checked 31 Aug" — when the advisory feed behind this was last read.
 *
 * Deliberately about the FEED and not about the linked pages: White Glove
 * reads the advisory feed and does not read the government's entry pages, so
 * claiming a check on those would be a claim it cannot support. Undated when
 * the feed could not be reached, rather than showing a stale date.
 */
export function checkedLine(fetchedAt: string | undefined): string {
  if (!fetchedAt) return "Official sources";
  const at = new Date(fetchedAt);
  if (Number.isNaN(at.getTime())) return "Official sources";
  const day = at.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `Checked ${day} · Official sources`;
}
