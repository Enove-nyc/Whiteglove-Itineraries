/**
 * Customer-facing labels for global search.
 *
 * Internal kinds/sections stay stable for ranking and tests. What the visitor
 * reads uses AGENTS.md naming: "Where to stay" (never the hotels-and-stays label).
 */

import type { SiteHitKind, SiteHitSection } from "@/lib/site-search-types";

export const SITE_SEARCH_LABEL = "Search the entire White Glove site";

export const SITE_SEARCH_NOTE = "Search information already published across White Glove.";

export const SITE_SEARCH_PLACEHOLDER =
  "Search destinations, places to stay, kosher food, and more…";

/**
 * The same invitation, in the words of whichever site is asking.
 *
 * The constant above names kosher food, which is right on the guide and wrong
 * on the itineraries domain — that brand is general travel and does not serve
 * the kosher food finder at all (/kosher is guide-only and answers 410 there).
 * It was reaching that domain's search box unchanged, so the one page somebody
 * uses to look something up told them this was a kosher product.
 */
export function siteSearchPlaceholder(itineraries: boolean): string {
  return itineraries ? "Search destinations, places to stay, things to do, and more…" : SITE_SEARCH_PLACEHOLDER;
}

/** Section headings on the dropdown and /search page. */
export function sectionHeading(section: SiteHitSection): string {
  switch (section) {
    case "Vacation":
      return "Vacation destinations";
    case "Stay":
      return "Where to stay";
    case "Things to do":
      return "Things to do";
    case "Kosher travel":
      return "Kosher food";
    case "Guides and services":
      return "Guides and services";
    case "Heritage":
      return "Heritage";
  }
}

/**
 * Finer heritage headings when a group has mixed kinds — keeps tzaddikim,
 * batei hachaim and towns distinct without inventing new index sections.
 */
export function heritageKindHeading(kind: SiteHitKind): string | null {
  switch (kind) {
    case "Kever or tzaddik":
      return "Tzaddikim and kevarim";
    case "Beis hachaim":
      return "Batei hachaim";
    case "Heritage town":
      return "Heritage towns";
    default:
      return null;
  }
}

/** Kind chip on each result row. */
export function kindLabel(kind: SiteHitKind): string {
  switch (kind) {
    case "Hotel or stay":
      return "Where to stay";
    case "Neighborhood":
      return "Where to stay";
    case "Practical travel":
      return "Practical travel";
    default:
      return kind;
  }
}
