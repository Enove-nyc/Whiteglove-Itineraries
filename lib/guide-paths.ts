import { cityGuides } from "@/data/destinations-detailed";

/**
 * What belongs to the guide, and therefore not to this domain.
 *
 * THIS LIST LIVED IN middleware.ts AND WAS READ BY NOTHING ELSE, which is how
 * whitegloveitineraries.com/sitemap.xml came to offer Google 783 URLs of which
 * 760 were kosher pages this domain immediately redirects away from. The
 * middleware knew they were not ours; the sitemap, built from the same shared
 * lib/site-map.ts as the kosher site, did not — so the itineraries domain was
 * publicly claiming three hundred and seventy kevarim, two hundred and
 * forty-two batei hachaim and a hundred and six heritage towns, and answering
 * every one of them with a redirect. A sitemap of redirects is worse than no
 * sitemap: it spends the domain's crawl budget on pages it does not have and
 * tells a search engine the site does not know what it is.
 *
 * So the list is here, and both read it. If a prefix is added for the
 * middleware it leaves the sitemap in the same commit.
 */
export const GUIDE_ONLY_PREFIXES = [
  "/destinations",
  "/map",
  "/kosher",
  "/kosher-travel",
  "/shuls",
  "/mikvaos",
  "/eruvin",
  "/zmanim",
  "/tzaddikim",
  "/cemeteries",
  "/hechsherim",
  "/heritage",
  "/hotels",
  "/things-to-do",
  "/transfers",
  "/travel-insurance",
  "/travel-gear",
  "/directory",
  // The kevarim-towns directory. Guide content that was never on this list,
  // so it answered 200 on the itineraries domain with a Kosher Travel title.
  "/stops",
  "/esim",
  "/travel-guide",
  "/sources",
  "/verification",
  "/submit",
  "/alerts",
  "/case-studies",
  "/info",
  // A destination's Shabbos page. Kosher content under a prefix nobody had
  // added, so /shabbos/rome answered 404 on this domain rather than going to
  // the site that holds it.
  "/shabbos",
] as const;

/**
 * The city guides, which are the one piece of guide content that does not sit
 * under a prefix. They are bare slugs at the root — /uman, /belz, /lizhensk —
 * so no prefix rule can catch them and the middleware let them fall through to
 * a 404 on this domain instead of sending them to the site that has them.
 *
 * Read from the same data the route builds its pages from, so a town added to
 * the guide is routed correctly here without anybody remembering to.
 */
const CITY_GUIDE_PATHS = new Set(cityGuides.map(({ slug }) => `/${slug}`));

/**
 * WHAT THIS DOMAIN DOES WITH A PATH THAT IS NOT ITS OWN.
 *
 * It used to answer all of them with a 308 to whiteglovekoshertravel.com,
 * which was right about the mechanism and wrong about the destination: this
 * product must not direct its visitors to the kosher site, and a redirect is
 * the most direct direction there is. Somebody who typed
 * whitegloveitineraries.com/cemeteries was being handed to a different
 * company.
 *
 * Three answers instead, and which one a path gets depends on whether this
 * product has anything to offer in its place:
 *
 *   • A NEUTRAL EQUIVALENT — /travel-insurance is booking, and this site has a
 *     booking page. A permanent redirect to it is useful rather than a
 *     hand-off.
 *   • NOTHING EQUIVALENT — /mikvaos, /tzaddikim, /hechsherim. This domain has
 *     never served them and never will. 410 Gone says exactly that: not "look
 *     over there", not "try again later", but "this address is not ours". A
 *     crawler drops it and stops asking.
 *   • ANYTHING ELSE — a real 404, which is what an unknown path already got.
 *
 * The one thing none of them is: a 200 with the homepage under the wrong
 * address.
 */
export type GuideAnswer = { kind: "redirect"; to: string } | { kind: "gone" };

/**
 * The paths with a neutral home on this site.
 *
 * Deliberately short. A redirect is a promise that the destination answers the
 * same question, and most of the guide's paths have no answer here at all —
 * sending /tzaddikim to /itinerary would be a worse lie than a 410.
 */
const NEUTRAL_EQUIVALENT: Record<string, string> = {
  // The kevarim-towns directory is a list of places to build a trip around.
  // The planner is where this product builds a trip.
  "/stops": "/itinerary",
  // Booking, all four of them, and this site has a booking page.
  "/travel-insurance": "/book",
  "/transfers": "/book",
  "/esim": "/book",
  "/hotels": "/book",
};

/** What this domain should answer for a guide path, or null when it is ours. */
export function guideAnswer(pathname: string): GuideAnswer | null {
  if (!isGuidePath(pathname)) return null;
  for (const [prefix, to] of Object.entries(NEUTRAL_EQUIVALENT)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return { kind: "redirect", to };
  }
  return { kind: "gone" };
}

/** True when this path is the kosher guide's rather than the planner's. */
export function isGuidePath(pathname: string): boolean {
  if (CITY_GUIDE_PATHS.has(pathname)) return true;
  return GUIDE_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
