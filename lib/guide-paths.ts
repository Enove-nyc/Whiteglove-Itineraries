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

/** True when this path is the kosher guide's rather than the planner's. */
export function isGuidePath(pathname: string): boolean {
  if (CITY_GUIDE_PATHS.has(pathname)) return true;
  return GUIDE_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
