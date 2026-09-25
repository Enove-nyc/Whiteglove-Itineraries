/**
 * One search across everything the public site holds.
 *
 * WHY THIS EXISTS. The navbar search bar sits on every page. It used to know
 * about heritage towns and batei hachaim only — and it imported the cemetery
 * database into the browser to do it. Vacation destinations, hotels, food and
 * guides were invisible in the box that every visitor types into.
 *
 * Architecture:
 *   - lib/site-search-index.ts  builds a server-side index (cached in memory)
 *   - lib/site-search-match.ts  Damerau–Levenshtein + accent/punct folding
 *   - lib/site-search-rank.ts   vacation-first weighted ranking (documented)
 *   - this file                 public API for the bar, /api/search and /search
 *
 * Empty focus returns every published vacation destination in editorial order.
 * Typed queries search the full index. Drafts, admin and private pages stay out.
 */

import { vacationDestinations } from "@/data/vacation-destinations";
import { isGuidePath } from "@/lib/guide-paths";
import { configuredBrand } from "@/lib/site-brand-core";
import { getSearchIndex } from "@/lib/site-search-index";
import { compact, damerauLevenshtein, maxEditsFor, normalize, queryTokens } from "@/lib/site-search-match";
import {
  groupHits,
  hasHeritageIntent,
  interpretedQuery,
  isUnambiguousExact,
  scoreDocument,
  sortScored,
  type ScoredHit,
} from "@/lib/site-search-rank";
import { hasHebrew, hebrewToLatin } from "@/lib/hebrew-latin";
import type { SearchResponse, SiteHit, SiteHitKind, SiteHitSection } from "@/lib/site-search-types";
import { sectionForKind, SITE_HIT_SECTIONS } from "@/lib/site-search-types";
import { destinationHref as vacationHref } from "@/lib/vacation-ideas";

export type { SiteHit, SiteHitKind, SiteHitSection, SearchResponse };
export { groupHits, hasHeritageIntent, isUnambiguousExact, sectionForKind };
export { invalidateSiteSearchIndex } from "@/lib/site-search-index";

/**
 * Vacation destinations for the empty-focus dropdown, editorial order.
 *
 * Same href problem as the main index (see forBrand in site-search-index.ts):
 * vacationHref points at /destinations/<slug>, which is guide-only and 410s
 * on the itineraries brand. This list bypasses the index entirely, so it
 * needs the same rewrite done here rather than inherited.
 */
export function vacationEmptySuggestions(): SiteHit[] {
  const onItineraries = configuredBrand() === "itineraries";
  return vacationDestinations.map((d) => {
    const href = vacationHref(d);
    return {
      id: `vacation-${d.slug}`,
      kind: "Vacation destination" as const,
      section: "Vacation" as const,
      title: d.name,
      subtitle: d.region ? `${d.region} · ${d.country}` : d.country,
      href: onItineraries && isGuidePath(href) ? "/itinerary" : href,
      matchRank: 0,
      fuzzy: false,
    };
  });
}

/**
 * Full search response — empty mode or typed results.
 *
 * `limit` caps typed results (dropdown uses ~8–12). Pass a large limit for the
 * /search page. Empty queries ignore limit and return every vacation destination.
 */
export async function searchSite(query: string, limit = 10): Promise<SearchResponse> {
  const q = query.trim();
  if (!q) {
    return {
      results: vacationEmptySuggestions(),
      query: "",
      heritageIntent: false,
      mode: "empty",
    };
  }

  const heritageIntent = hasHeritageIntent(q);
  const index = await getSearchIndex();

  const pass = (text: string): ScoredHit[] => {
    const qTokens = queryTokens(text);
    const scored: ScoredHit[] = [];
    for (const doc of index) {
      // Cheap gate before Damerau work: every meaningful query token must share
      // a 2-letter prefix (or be a substring) with some indexed token, or the
      // compact name must be close enough. Skips most tzaddikim.
      if (!isPlausibleCandidate(qTokens, doc.normTokens, doc.normCompact)) continue;
      const hit = scoreDocument(text, doc, heritageIntent);
      if (hit) scored.push(hit);
    }
    return scored;
  };

  /**
   * THREE ATTEMPTS, AND ONLY EVER AFTER THE ONE BEFORE FOUND NOTHING.
   *
   * Each of these was a real search that came back empty from a site that had
   * the answer:
   *
   *   "tours and activities" — every token had to match something, and no page
   *   carries all three. Dropping the words that carry no meaning leaves
   *   "tours activities"; when even that finds nothing, the longest word alone
   *   is a better answer than none.
   *
   *   בארדיאב — the town is indexed as Bardejov, with bardiov beside it, and
   *   its Yiddish name בארטפעלד, which is Bartfeld. Both are right and neither
   *   is a misspelling of the other, so no fuzziness bridges them. Sounding
   *   the query out does: see lib/hebrew-latin.ts.
   *
   * The order matters and so does the guard: a query that already found
   * something never reaches these, so nothing here can dilute a good result.
   */
  let scored = pass(q);

  if (!scored.length) {
    const meaningful = withoutStopWords(q);
    if (meaningful && meaningful !== q) scored = pass(meaningful);
  }

  if (!scored.length && hasHebrew(q)) {
    const sounded = hebrewToLatin(q);
    if (sounded) scored = pass(sounded);
  }

  if (!scored.length) {
    const longest = longestWord(q);
    if (longest && longest !== q) scored = pass(longest);
  }

  const sorted = sortScored(scored);
  const results = diversifyHits(sorted, limit);

  return {
    results,
    query: q,
    interpretedAs: interpretedQuery(sorted),
    heritageIntent,
    mode: "search",
  };
}

/**
 * Words that mean nothing on their own in a search of this site.
 *
 * Not a general stop-word list — "kosher" and "jewish" stay, because on this
 * site they narrow a search rather than padding it. These are the joining
 * words that a person types because English needs them.
 */
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "at", "be", "by", "do", "for", "from", "how", "in",
  "is", "it", "me", "my", "near", "of", "on", "or", "the", "to", "what", "when",
  "where", "with",
]);

export function withoutStopWords(query: string): string {
  const kept = query
    .split(/\s+/)
    .filter((word) => word && !STOP_WORDS.has(word.toLowerCase().replace(/[^a-z]/g, "")));
  return kept.length ? kept.join(" ") : "";
}

/** The word most likely to be the point of the question. */
export function longestWord(query: string): string {
  return withoutStopWords(query)
    .split(/\s+/)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] ?? "";
}

/**
 * Prefer a useful mix of sections in the dropdown (and still honour limit).
 *
 * Without this, twelve Rome hotels can crowd out food, attractions and heritage
 * that a broad query should surface under their own headings.
 */
function diversifyHits(sorted: ScoredHit[], limit: number): SiteHit[] {
  const seen = new Set<string>();
  const results: SiteHit[] = [];

  function take(hit: SiteHit): boolean {
    const key = `${hit.kind}:${normalize(hit.title)}:${hit.href}`;
    if (seen.has(key) || results.some((r) => r.id === hit.id)) return false;
    seen.add(key);
    results.push(hit);
    return results.length >= limit;
  }

  // Exact / near-exact names first so "cars" opens booking partners rather than
  // a cable-car attraction that merely contains the word.
  for (const row of sorted) {
    if ((row.hit.matchRank ?? 99) > 1) continue;
    if (take(row.hit)) return results;
  }

  const bySection = new Map<SiteHitSection, SiteHit[]>();
  for (const row of sorted) {
    const key = `${row.hit.kind}:${normalize(row.hit.title)}:${row.hit.href}`;
    if (seen.has(key)) continue;
    const list = bySection.get(row.hit.section) ?? [];
    list.push(row.hit);
    bySection.set(row.hit.section, list);
  }

  const order = SITE_HIT_SECTIONS.filter((section) => (bySection.get(section)?.length ?? 0) > 0);
  const perSection = Math.max(2, Math.ceil(limit / Math.max(order.length, 1)));
  for (const section of order) {
    const list = bySection.get(section) ?? [];
    for (const hit of list.slice(0, perSection)) {
      if (take(hit)) return results;
    }
  }
  for (const row of sorted) {
    if (take(row.hit)) break;
  }
  return results;
}

/**
 * Everything matching, best first — the shape older callers expect.
 *
 * Prefer searchSite() when you need interpretedAs / heritageIntent / empty mode.
 */
export async function searchEverything(query: string, limit = 8): Promise<SiteHit[]> {
  const response = await searchSite(query, limit);
  // Preserve the old contract: empty query returns nothing (the bar used to
  // supply its own defaults). New callers that want the vacation empty state
  // should use searchSite("").
  if (!query.trim()) return [];
  return response.results;
}

/**
 * Fast reject for documents that cannot possibly match, before edit-distance work.
 */
function isPlausibleCandidate(qTokens: string[], docTokens: string[], docCompact: string[]): boolean {
  if (qTokens.length === 0) return false;
  const joined = qTokens.join("");
  if (joined.length >= 3 && docCompact.some((c) => c === joined || c.startsWith(joined) || (joined.startsWith(c) && c.length >= 3))) {
    return true;
  }
  if (qTokens.length === 1 && qTokens[0].length === 1) {
    const ch = qTokens[0];
    return docTokens.some((t) => t.startsWith(ch));
  }
  return qTokens.every((qt) => {
    if (qt.length < 2) return docTokens.some((t) => t.startsWith(qt));
    const prefix = qt.slice(0, 2);
    // `t.includes(qt)` used to be here — the prefilter's half of the
    // "promenade contains rome" problem. A token that merely swallows the
    // query somewhere in its middle is not a candidate; one that starts with
    // it, or that the query itself contains (a longer query against a shorter
    // real word), still is.
    if (docTokens.some((t) => t.startsWith(prefix) || (qt.includes(t) && t.length >= 4))) {
      return true;
    }
    // Compact fuzzy: “dolomits” vs “thedolomites” / “dolomites”.
    if (qt.length >= 4) {
      const cq = compact(qt);
      const near = docCompact.filter((c) => Math.abs(c.length - cq.length) <= 3);
      if (near.some((c) => c.startsWith(cq.slice(0, 3)) || cq.startsWith(c.slice(0, 3)))) return true;
      // A VARIANT THAT DIFFERS AT THE FRONT IS STILL A CANDIDATE. Every gate
      // above compares the first two or three letters, so a word whose first
      // letters are the ones that differ can never be reached at all. That is
      // rare in English and ordinary in Yiddish, where the ayin written as a
      // vowel is optional: קרעסטיר and קערעסטיר are the same place, and the
      // difference is the second letter. Paid for only by tokens that got
      // past nothing else.
      return near.some((c) => damerauLevenshtein(c, cq) <= maxEditsFor(cq));
    }
    return false;
  });
}
