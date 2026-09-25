/**
 * Server-side searchable index for global search.
 *
 * Built once per process and reused. Owner-published DB rows (attractions,
 * stays, practical listings, quarters, info pages) are merged in when
 * DATABASE_URL is set. Call invalidateSiteSearchIndex() after a publish so the
 * next request rebuilds.
 *
 * The browser never receives this index — only ranked hit rows go over the wire.
 */

import { cemeteries } from "@/data/cemeteries";
import { destinationHaystack, destinationHref as heritageDestinationHref, destinations, getDestination } from "@/data/destinations";
import { HECHSHERIM } from "@/data/hechsherim";
import { kosherEateries } from "@/data/kosher-eateries";
import { practicalContent } from "@/data/practical-content";
import { SEASONS, TRIP_THEMES, vacationDestinations, type VacationDestination } from "@/data/vacation-destinations";
import { getVacationDestinations } from "@/lib/vacation-destinations-view";
import { getAreaList, getAttractionList, getStayList } from "@/lib/attractions-view";
import { isDisallowedImportSource } from "@/lib/bulk-content";
import { bustTag, cachedRead } from "@/lib/cache-tags";
import { isGuidePath } from "@/lib/guide-paths";
import { staticMikvahListings } from "@/lib/mikvaos";
import { heritageTownHref } from "@/lib/route-migration";
import { extraSpellings, normalize } from "@/lib/place-search";
import { configuredBrand } from "@/lib/site-brand-core";
import { compact } from "@/lib/site-search-match";
import { sectionForKind, type SearchDocument } from "@/lib/site-search-types";
import { allTzaddikim } from "@/lib/tzaddikim";
import { destinationHref as vacationHref } from "@/lib/vacation-ideas";

/** Attach pre-normalised tokens used for fast candidate filtering. */
function finalize(doc: Omit<SearchDocument, "normTokens" | "normCompact">): SearchDocument {
  const parts = [doc.title, ...doc.names, ...doc.keywords, doc.city ?? "", doc.country ?? ""];
  const normTokens = unique(
    parts
      .flatMap((p) => normalize(p).split(" "))
      .filter((t) => t.length > 0),
  );
  const normCompact = unique(
    [doc.title, ...doc.names].map((p) => compact(p)).filter((t) => t.length >= 3),
  );
  return { ...doc, normTokens, normCompact };
}

/**
 * Busted by invalidateSiteSearchIndex — every one of its six existing
 * call sites (content-admin.ts, content-imports.ts) already fires the
 * moment real content is published, so nothing else needed to change to
 * wire this up.
 */
const SEARCH_INDEX_TAG = "site-search-index";

/**
 * invalidateSiteSearchIndex is async now — every existing call site already
 * either awaits it or doesn't, and both keep working unchanged: an
 * unawaited call to an async function is not an error, it just fires and
 * moves on, which is exactly what the five bare `invalidateSiteSearchIndex();`
 * call sites were already doing.
 */
export async function invalidateSiteSearchIndex(): Promise<void> {
  await bustTag(SEARCH_INDEX_TAG);
}

/**
 * /search reads searchParams and has to stay a dynamic page regardless —
 * Next.js forces that the moment a page reads the query string, no cache
 * config changes that. But every visit was rebuilding this whole index from
 * scratch: static destinations, cemeteries, tzaddikim and hechsherim, plus
 * two real database reads (pushPublishedPracticalPlaces,
 * pushPublishedInfoPages), regardless of what was typed. cachedRead makes
 * the expensive part — building the index — shared across every visitor and
 * every crawler hitting /search with a different query, busted the moment
 * invalidateSiteSearchIndex actually fires rather than rebuilt per request.
 *
 * Replaces the old module-level `cached`/`building` variables, which only
 * ever helped within one warm serverless instance and did nothing for a
 * cold one. unstable_cache's own request deduping covers what `building`
 * was doing by hand — a second concurrent call while the first is still
 * building does not trigger a second build.
 */
export async function getSearchIndex(): Promise<SearchDocument[]> {
  // Brand in the cache key, not just in buildSearchIndex's own filtering: a
  // deployment only ever runs one brand, so this never matters in production,
  // but a wrong cache key is the kind of bug that only shows up the day that
  // stops being true.
  return cachedRead(buildSearchIndex, ["site-search-index", configuredBrand() ?? "unset"], [SEARCH_INDEX_TAG]);
}

type DraftDoc = Omit<SearchDocument, "normTokens" | "normCompact">;

export type PublishedPracticalPlaceSearchRow = {
  id: string;
  category: string;
  name: string;
  address: string | null;
  notes: string | null;
  sourceUrl?: string | null;
  destination: {
    slug: string;
    city: string;
    country: string;
  };
};

/** Pure builder for tests — always rebuilds; getSearchIndex is the cached, tagged entry point that wraps this. */
export async function buildSearchIndex(): Promise<SearchDocument[]> {
  const docs: DraftDoc[] = [];

  // Read through the view, so a destination the owner adds is findable in
  // search the moment it is saved rather than at the next deploy. The two
  // lookups further down get the same list for the same reason.
  const destinations = await getVacationDestinations();

  pushVacationDestinations(docs, destinations);
  pushHeritageTowns(docs);
  pushCemeteries(docs);
  pushTzaddikim(docs);
  await pushAttractionsStaysAreas(docs);
  await pushPublishedPracticalPlaces(docs);
  pushStaticPracticalPlaces(docs, destinations);
  pushEateries(docs);
  pushSitePages(docs);
  await pushPublishedInfoPages(docs);

  return forBrand(docs.map(finalize));
}

/**
 * ONE DATABASE, TWO RESULT SETS. Nothing above this point is brand-aware, and
 * it stays that way on purpose — the size of the index costs nobody anything,
 * because nobody sees the index, only the results a search returns. What
 * changes per brand is what those results are allowed to be.
 *
 * On itineraries, "Kosher travel" (kosher food, kashrus/practical listings)
 * and "Heritage" (kevarim, batei hachaim, tzaddikim) never surface: that
 * content, and the pages behind it, belong to the guide alone — see
 * AGENTS.md, "kosher" is reserved for food/kashrus features and this product
 * is not a kosher travel product. Everything else stays, INCLUDING
 * destinations, hotels and things to do that happen to be kosher-relevant
 * (a seasonal programme, a walkable-to-shul neighbourhood): the owner was
 * explicit that dropping those too was not what he asked for — "food and
 * culture destinations are not dropped entirely."
 *
 * The href rewrite is the other half of the same fix. Every one of the kept
 * kinds still points at a guide page this domain does not have — a vacation
 * destination at /destinations/<slug>, a hotel at /hotels#<slug> — and those
 * already answer 410 here (lib/guide-paths.ts, tested in
 * tests/itineraries-obsolete-routes.test.ts). A search result is not really
 * "kept" if clicking it goes nowhere, so on this brand it opens the planner
 * instead: not a deep link into that destination yet, but a real page rather
 * than a dead one, and the one page this product actually has to offer.
 */
function forBrand(docs: SearchDocument[]): SearchDocument[] {
  if (configuredBrand() !== "itineraries") return docs;
  return docs
    .filter((doc) => doc.section !== "Kosher travel" && doc.section !== "Heritage")
    .map((doc) => (isGuidePath(doc.href) ? { ...doc, href: "/itinerary" } : doc));
}

function pushVacationDestinations(docs: DraftDoc[], destinations: readonly VacationDestination[]) {
  destinations.forEach((d, index) => {
    const themeLabels = d.themes.map((t) => TRIP_THEMES.find((x) => x.value === t)?.label ?? t);
    const seasonLabels = d.seasons.map((s) => SEASONS.find((x) => x.value === s)?.label ?? s);
    const conceptKeywords = [
      ...d.themes,
      ...themeLabels,
      ...d.seasons,
      ...seasonLabels,
      ...d.bestFor,
      d.region ?? "",
      "vacation",
      "holiday",
      "kosher vacation",
      "shabbos",
      "shabos",
    ];
    // Theme-specific extras so “family beach” / “warm winter” land here —
    // deliberately NOT global “kosher hotel” (that belongs on stays / /hotels).
    if (d.themes.includes("beach")) conceptKeywords.push("beach", "sea", "resort", "sun", "warm winter", "winter sun", "family beach");
    if (d.themes.includes("mountains")) conceptKeywords.push("mountains", "alps", "hiking", "nature", "mountains kosher");
    if (d.themes.includes("city")) conceptKeywords.push("city break", "city");
    if (d.themes.includes("family")) conceptKeywords.push("family", "kids", "children");
    if (d.themes.includes("couples")) conceptKeywords.push("couples", "honeymoon", "romantic");
    if (d.themes.includes("short-break")) conceptKeywords.push("short break", "weekend");
    if (d.seasons.includes("winter")) conceptKeywords.push("winter", "snow");
    if (d.seasons.includes("summer")) conceptKeywords.push("summer", "warm");
    if (d.themes.includes("beach") && d.seasons.includes("winter")) conceptKeywords.push("warm winter", "winter sun");
    if (d.themes.includes("family") && d.themes.includes("beach")) conceptKeywords.push("family beach");

    docs.push({
      id: `vacation-${d.slug}`,
      kind: "Vacation destination",
      section: sectionForKind("Vacation destination"),
      title: d.name,
      subtitle: d.region ? `${d.region} · ${d.country}` : d.country,
      href: vacationHref(d),
      names: [
        d.name,
        d.slug.replace(/-/g, " "),
        ...d.cities,
        d.region ?? "",
        d.country,
        extraSpellings([d.slug, d.name, ...d.cities]),
      ].filter(Boolean),
      keywords: unique(conceptKeywords),
      body: [d.whyGo, d.overview, d.suits, d.bestTime].join(" "),
      city: d.cities[0],
      country: d.country,
      rankWeight: index,
      heritage: false,
      vacation: true,
    });
  });
}

function pushHeritageTowns(docs: DraftDoc[]) {
  destinations.forEach((d, index) => {
    const g = d.guide;
    docs.push({
      id: `heritage-${d.slug}`,
      kind: "Heritage town",
      section: sectionForKind("Heritage town"),
      title: d.city,
      yiddish: d.yiddishCity || undefined,
      subtitle: g?.tzaddik ? `${g.tzaddik} · ${d.country}` : d.country,
      href: d.guide ? `/${d.slug}` : heritageTownHref(d.slug),
      names: [
        d.city,
        d.yiddishCity,
        d.slug.replace(/-/g, " "),
        ...d.aliases,
        g?.tzaddik ?? "",
        g?.yiddishTzaddik ?? "",
        g?.seforim ?? "",
        extraSpellings([d.slug, d.city]),
        destinationHaystack(d),
      ].filter(Boolean),
      keywords: ["heritage", "heritage town", "kever", "tzaddik", "rebbe", "nesios"],
      body: d.summary ?? "",
      city: d.city,
      country: d.country,
      rankWeight: index,
      heritage: true,
      vacation: false,
    });
  });
}

function pushCemeteries(docs: DraftDoc[]) {
  cemeteries.forEach((c, index) => {
    docs.push({
      id: `cemetery-${c.slug}`,
      kind: "Beis hachaim",
      section: sectionForKind("Beis hachaim"),
      title: c.name,
      yiddish: c.yiddishName || c.yiddishCity || undefined,
      subtitle: `${c.city} · ${c.country}`,
      href: `/cemeteries/${c.slug}`,
      names: [
        c.name,
        c.yiddishName,
        c.city,
        c.yiddishCity,
        c.slug.replace(/-/g, " "),
        c.country,
        extraSpellings([c.slug, c.city]),
      ].filter(Boolean),
      keywords: ["beis hachaim", "beit hachaim", "cemetery", "kever", "kevarim", "batei hachaim"],
      body: "",
      city: c.city,
      country: c.country,
      rankWeight: index,
      heritage: true,
      vacation: false,
    });
  });
}

function pushTzaddikim(docs: DraftDoc[]) {
  allTzaddikim().forEach((entry, index) => {
    const { burial, cemetery, slug } = entry;
    docs.push({
      id: `tzaddik-${slug}`,
      kind: "Kever or tzaddik",
      section: sectionForKind("Kever or tzaddik"),
      title: burial.knownAs || burial.name,
      yiddish: burial.yiddishName || undefined,
      subtitle: `${burial.name} · ${cemetery.city}`,
      href: `/tzaddikim/${slug}`,
      names: [
        burial.name,
        burial.knownAs ?? "",
        burial.yiddishName ?? "",
        cemetery.city,
        cemetery.yiddishCity,
        slug.replace(/-/g, " "),
        extraSpellings([cemetery.slug, cemetery.city, burial.name, burial.knownAs]),
      ].filter(Boolean),
      keywords: ["kever", "tzaddik", "rebbe", "yahrzeit", "ohel", "kivrei tzaddikim"],
      body: burial.note ?? "",
      city: cemetery.city,
      country: cemetery.country,
      rankWeight: index,
      heritage: true,
      vacation: false,
    });
  });
}

async function pushAttractionsStaysAreas(docs: DraftDoc[]) {
  const [attractions, stays, areas] = await Promise.all([getAttractionList(), getStayList(), getAreaList()]);

  attractions.forEach((a, index) => {
    docs.push({
      id: `attraction-${a.slug}`,
      kind: "Thing to do",
      section: sectionForKind("Thing to do"),
      title: a.name,
      subtitle: `${a.city} · ${a.country} · ${a.kind}`,
      href: `/things-to-do#${a.slug}`,
      names: [a.name, a.city, a.country, a.kind, a.slug.replace(/-/g, " "), extraSpellings([a.slug, a.city])].filter(Boolean),
      keywords: ["thing to do", "things to do", "attraction", "attractions", "activity", "activities", a.kind, "sightseeing", "museum", "day out"],
      body: a.summary,
      city: a.city,
      country: a.country,
      rankWeight: index,
      heritage: false,
      vacation: false,
    });
  });

  stays.forEach((s, index) => {
    docs.push({
      id: `stay-${s.slug}`,
      kind: "Hotel or stay",
      section: sectionForKind("Hotel or stay"),
      title: s.name,
      subtitle: `${s.city} · ${s.country} · ${s.kind}`,
      href: `/hotels#${s.slug}`,
      names: [s.name, s.city, s.country, s.kind, s.anchor.name, s.slug.replace(/-/g, " "), extraSpellings([s.slug, s.city])].filter(Boolean),
      keywords: [
        "hotel",
        "hotels",
        "kosher hotel",
        "kosher hotels",
        "where to stay",
        "places to stay",
        "seasonal programme",
        "seasonal program",
        s.season ?? "",
        s.kind,
      ].filter(Boolean),
      body: s.summary,
      city: s.city,
      country: s.country,
      rankWeight: index,
      heritage: false,
      vacation: false,
    });
  });

  areas.forEach((a, index) => {
    docs.push({
      id: `area-${a.slug}`,
      kind: "Neighborhood",
      section: sectionForKind("Neighborhood"),
      title: a.name,
      subtitle: `${a.city} · ${a.country}`,
      href: `/hotels#${a.slug}`,
      names: [a.name, a.city, a.country, a.slug.replace(/-/g, " "), extraSpellings([a.slug, a.city])].filter(Boolean),
      keywords: ["neighborhood", "neighbourhood", "quarter", "jewish quarter", "eruv", "walkable", "shabbos"],
      body: a.note,
      city: a.city,
      country: a.country,
      rankWeight: index,
      heritage: false,
      vacation: false,
    });
  });
}

/**
 * Practical listings live on destination pages, so they used to be invisible
 * to global search even after the owner had published them. This is a
 * database-only additive read; with no database the existing static index
 * remains exactly as it was.
 */
async function pushPublishedPracticalPlaces(docs: DraftDoc[]) {
  if (!process.env.DATABASE_URL) return;
  try {
    const { prisma } = await import("@/lib/prisma");
    const rows = await prisma.practicalPlace.findMany({
      where: { status: "PUBLISHED" },
      select: {
        id: true,
        category: true,
        name: true,
        address: true,
        notes: true,
        sourceUrl: true,
        destination: { select: { slug: true, city: true, country: true } },
      },
      orderBy: [{ destination: { country: "asc" } }, { destination: { city: "asc" } }, { name: "asc" }],
    });
    rows
      .filter((place) => !isDisallowedImportSource({
        sourceUrl: place.sourceUrl ?? "",
        sourceName: "",
        attribution: "",
      }))
      .forEach((place, index) => {
      docs.push(publishedPracticalPlaceSearchDocument(place, index));
      });
  } catch {
    // Search is a navigation aid, not a reason to blank its static index if an
    // optional DB table is temporarily unavailable.
  }
}

/**
 * One published practical listing's global-search representation. Exported so
 * the publish/search contract can be tested without requiring a live database.
 */
export function publishedPracticalPlaceSearchDocument(
  place: PublishedPracticalPlaceSearchRow,
  rankWeight = 0,
  /**
   * The merged destination list, when the caller has already read it. Defaults
   * to the built-in list: this decides which URL the document points at, and
   * an owner-added destination that is not in the list here would be linked as
   * a heritage town instead of as itself.
   */
  destinations: readonly VacationDestination[] = vacationDestinations,
): SearchDocument {
  const staticDestination = getDestination(place.destination.slug);
  const vacationDestination = destinations.find((item) => item.slug === place.destination.slug);
  const href = vacationDestination
    ? vacationHref(vacationDestination)
    : staticDestination
      ? heritageDestinationHref(staticDestination)
      : heritageTownHref(place.destination.slug);
  return finalize({
    id: `practical-${place.id}`,
    kind: "Practical travel",
    section: sectionForKind("Practical travel"),
    title: place.name,
    subtitle: `${place.destination.city} · ${place.destination.country} · ${place.category.replace(/_/g, " ")}`,
    href,
    names: [
      place.name,
      place.destination.city,
      place.destination.country,
      place.category.replace(/_/g, " "),
      extraSpellings([place.destination.slug, place.destination.city, place.name]),
    ].filter(Boolean),
    keywords: [
      "practical travel",
      "travel information",
      place.category.replace(/_/g, " "),
      ...(place.category === "MIKVAH"
        ? ["mikvah", "mikvaos", "mikveh", "mikve", "tvilah", "ritual bath"]
        : place.category === "MINYAN"
          ? ["minyan", "minyanim", "shul", "davening"]
          : []),
    ],
    body: [place.address ?? "", place.notes ?? ""].join(" "),
    city: place.destination.city,
    country: place.destination.country,
    rankWeight,
    heritage: false,
    vacation: Boolean(vacationDestination),
  });
}

function pushEateries(docs: DraftDoc[]) {
  kosherEateries.forEach((e, index) => {
    docs.push({
      id: `eatery-${e.slug}`,
      kind: "Kosher food",
      section: sectionForKind("Kosher food"),
      title: e.name,
      subtitle: `${e.city} · ${e.country} · ${e.kind}`,
      href: `/kosher#${e.slug}`,
      names: [e.name, e.city, e.country, e.kind, e.diet, e.slug.replace(/-/g, " "), extraSpellings([e.slug, e.city])].filter(
        (value): value is string => Boolean(value),
      ),
      keywords: [
        "kosher",
        "kosher food",
        "restaurant",
        "restaurants",
        "bakery",
        "bakeries",
        "grocery",
        "groceries",
        "eatery",
        "food",
        e.kind,
        // diet is optional on the directory set — a certifier listing a place
        // as kosher without saying meat/dairy. Dropped when absent rather than
        // fed to the index as undefined.
        ...(e.diet ? [e.diet] : []),
      ],
      body: e.summary,
      city: e.city,
      country: e.country,
      rankWeight: index,
      heritage: false,
      vacation: false,
    });
  });
}

/**
 * Public site pages a traveler might search for by topic — flights, Shabbos,
 * hechsherim, the itinerary planner, and so on. Private/admin/access pages stay out.
 */
function pushSitePages(docs: DraftDoc[]) {
  const pages: Array<{
    id: string;
    kind: SearchDocument["kind"];
    title: string;
    subtitle: string;
    href: string;
    names: string[];
    keywords: string[];
    body?: string;
    rankWeight?: number;
  }> = [
    {
      id: "page-destinations",
      kind: "Site page",
      title: "Vacation destinations",
      subtitle: "Every published kosher vacation idea",
      href: "/destinations",
      names: ["vacation destinations", "destinations", "vacation ideas", "getaways"],
      keywords: ["vacation", "holiday", "where to go"],
    },
    {
      id: "page-hotels",
      kind: "Site page",
      title: "Where to stay",
      subtitle: "Kosher hotels, seasonal programmes and recommended neighborhoods",
      href: "/hotels",
      names: ["where to stay", "hotels", "kosher hotels", "kosher hotel", "places to stay"],
      keywords: ["hotel", "hotels", "kosher hotel", "seasonal programme", "seasonal program"],
    },
    {
      id: "page-things-to-do",
      kind: "Site page",
      title: "Things to do",
      subtitle: "Attractions and days out",
      href: "/things-to-do",
      names: ["things to do", "attractions", "activities", "activity"],
      keywords: ["sightseeing", "attraction", "attractions", "activities", "day out"],
    },
    {
      id: "page-kosher",
      kind: "Site page",
      title: "Kosher food finder",
      subtitle: "Restaurants, bakeries and groceries",
      href: "/kosher",
      names: ["kosher food finder", "kosher food", "kosher restaurants", "bakeries", "groceries"],
      keywords: ["kosher", "restaurant", "bakery", "grocery"],
    },
    {
      id: "page-kosher-travel",
      kind: "Travel guide",
      title: "Kosher travel",
      subtitle: "Food, Shabbos, minyanim, mikvaos and hechsherim",
      href: "/kosher-travel",
      names: ["kosher travel", "shabbos", "shabos", "shabbat", "minyanim", "mikvaos", "mikvah", "eruvim", "eruv", "hechsherim", "shul", "shuls", "בית כנסת"],
      keywords: ["shabbos", "shabos", "minyan", "mikvah", "eruv", "hechsher", "walkable", "shul"],
    },
    {
      id: "page-hechsherim",
      kind: "Travel guide",
      title: "Hechsherim",
      subtitle: "The certifying bodies the site knows by name",
      href: "/hechsherim",
      names: ["hechsherim", "hechsher", "kashrus", "certification"],
      keywords: ["hechsher", "kosher certification", ...HECHSHERIM.flatMap((h) => [h.name, h.mark, ...h.aliases])],
    },
    {
      id: "page-mikvaos",
      kind: "Travel guide",
      title: "Mikvaos",
      subtitle: "Source-backed mikvah listings for travel",
      href: "/mikvaos",
      names: ["mikvaos", "mikvah", "mikveh", "mikve", "ritual bath", "מקוה", "מקווה", "מקוואות"],
      keywords: ["mikvah", "mikvaos", "mikveh", "tvilah", "kosher travel"],
    },
    {
      id: "page-zmanim",
      kind: "Travel guide",
      title: "Zmanim",
      subtitle: "Halachic times for a place and date",
      href: "/zmanim",
      names: ["zmanim", "zman", "halachic times", "candle lighting", "alos", "tzeit", "זמנים"],
      keywords: ["zmanim", "sof zman shema", "chatzos", "mincha", "sunset", "sunrise", "candle-lighting"],
    },
    {
      id: "page-travel-guide",
      kind: "Travel guide",
      title: "Travel guide",
      subtitle: "Documents, borders and paying for the trip",
      href: "/travel-guide",
      names: ["travel guide", "practical info", "entry documents", "visa", "passport"],
      keywords: ["documents", "border", "insurance", "points"],
    },
    {
      id: "page-esim",
      kind: "Site page",
      title: "eSIMs and data abroad",
      subtitle: "A data plan installed before you fly",
      href: "/esim",
      names: [
        "esim",
        "e-sim",
        "e sim",
        "esims",
        "e-sims",
        "sim",
        "sim card",
        "data",
        "data plan",
        "mobile data",
        "phone data",
        "internet",
        "roaming",
        "phone",
        "airalo",
        "yesim",
        "סים",
      ],
      keywords: ["esim", "e-sim", "e sim", "sim card", "data", "connectivity", "roaming", "travel essentials"],
    },
    {
      id: "page-transfers",
      kind: "Site page",
      title: "Airport transfers",
      subtitle: "A booked ride from the airport to your first stop",
      href: "/transfers",
      names: ["transfers", "transfer", "airport transfer", "airport pickup", "taxi", "private transfer"],
      keywords: ["transfers", "airport", "arrival", "travel essentials"],
    },
    {
      id: "page-book",
      kind: "Site page",
      title: "Search booking partners",
      subtitle: "Flights, hotels and cars",
      href: "/book",
      // The flight and car words live here rather than on pages of their own:
      // /flights and /cars were these same searches and now redirect to this
      // one, so a visitor typing "airfare" or "rental car" should land on the
      // page that actually runs it.
      names: [
        "book",
        "booking",
        "booking partners",
        "flights",
        "flight",
        "airfare",
        "plane",
        "airline",
        "cars",
        "car hire",
        "car rental",
        "rental car",
        "hire car",
        "travel essentials",
      ],
      keywords: ["flights", "hotels", "cars", "air travel", "driving", "partners"],
    },
    {
      id: "page-travel-essentials",
      kind: "Site page",
      title: "Travel Essentials",
      subtitle: "eSIMs, insurance, transfers, cars and flights",
      href: "/book",
      names: ["travel essentials", "essentials", "before you go"],
      keywords: ["esim", "insurance", "transfers", "cars", "flights", "tours"],
    },
    {
      id: "page-plan",
      kind: "Service",
      title: "Get recommendations",
      subtitle: "Three short steps to destination ideas that fit",
      href: "/plan",
      names: ["get recommendations", "plan", "recommendations", "trip ideas"],
      keywords: ["planning", "recommendations"],
    },
    {
      id: "page-itinerary",
      kind: "Service",
      title: "Itinerary planner",
      subtitle: "Build the trip yourself — days, stops and Shabbos",
      href: "/itinerary",
      names: ["itinerary planner", "itinerary", "trip planner", "route planner"],
      keywords: ["itinerary", "planning", "route planning"],
    },
    {
      id: "page-heritage",
      kind: "Site page",
      title: "Jewish heritage journeys",
      subtitle: "Towns, batei hachaim and tzaddikim",
      href: "/heritage",
      names: ["heritage", "jewish heritage", "nesios", "שתוליכנו לשלום"],
      keywords: ["heritage", "kever", "tzaddik"],
    },
    {
      id: "page-cemeteries",
      kind: "Site page",
      title: "Batei hachaim",
      subtitle: "Cemetery directory",
      href: "/cemeteries",
      names: ["batei hachaim", "cemeteries", "cemetery directory", "בית החיים"],
      keywords: ["cemetery", "beis hachaim", "kever"],
    },
    {
      id: "page-tzaddikim",
      kind: "Site page",
      title: "Tzaddikim",
      subtitle: "Find a kever by the person",
      href: "/tzaddikim",
      names: ["tzaddikim", "tzadikim", "kevarim directory", "kevarim"],
      keywords: ["tzaddik", "rebbe", "kever"],
    },
    {
      id: "page-travel-insurance",
      kind: "Site page",
      title: "Travel insurance",
      subtitle: "Cover for the trip",
      href: "/travel-insurance",
      names: ["travel insurance", "insurance"],
      keywords: ["insurance", "travel essentials"],
    },
    {
      id: "page-sample-itinerary",
      kind: "Travel guide",
      title: "Sample itinerary",
      subtitle: "An example of how a White Glove trip is shaped",
      href: "/sample-itinerary",
      names: ["sample itinerary"],
      keywords: ["itinerary", "example"],
    },
    {
      id: "page-about",
      kind: "Site page",
      title: "About White Glove",
      subtitle: "What this site is for, and what its information is worth",
      href: "/about",
      names: ["about", "about us", "about white glove", "who we are", "אודות"],
      keywords: ["about", "white glove"],
    },
    {
      id: "page-contact",
      kind: "Site page",
      title: "Contact",
      subtitle: "Write to White Glove",
      href: "/contact",
      names: ["contact", "get in touch", "email", "write", "צור קשר"],
      keywords: ["contact", "message"],
    },
    {
      id: "page-rate",
      kind: "Site page",
      title: "Rate how it went",
      subtitle: "Private feedback after a place or a trip",
      href: "/rate",
      names: ["rate", "rate how it went", "feedback", "rating"],
      keywords: ["rate", "feedback"],
    },
    {
      id: "page-directory",
      kind: "Site page",
      title: "Provider directory",
      subtitle: "Drivers, agencies and operators",
      href: "/directory",
      names: ["directory", "provider directory", "drivers", "agencies"],
      keywords: ["directory", "provider"],
    },
    {
      id: "page-map",
      kind: "Site page",
      title: "Map",
      subtitle: "Towns and batei hachaim on a map",
      href: "/map",
      names: ["map", "maps"],
      keywords: ["map", "heritage"],
    },
    {
      id: "page-verification",
      kind: "Site page",
      title: "How we verify",
      subtitle: "How practical claims on this site are sourced",
      href: "/verification",
      names: ["verification", "how we verify", "sources"],
      keywords: ["verify", "source"],
    },
    {
      id: "page-stops",
      kind: "Site page",
      title: "Towns and guides",
      subtitle: "Heritage towns with practical notes",
      href: "/stops",
      names: ["stops", "towns and guides", "heritage towns"],
      keywords: ["heritage", "towns"],
    },
    {
      id: "page-travel-gear",
      kind: "Site page",
      title: "Travel gear",
      subtitle: "A blech, a hotplate, an adapter, and the rest of the shelf",
      href: "/travel-gear",
      names: ["travel gear", "travel blech", "travel hotplate", "plug adapter"],
      keywords: ["gear", "blech", "hotplate", "adapter", "amazon"],
    },
    {
      id: "page-case-studies",
      kind: "Site page",
      title: "Case studies",
      subtitle: "Trip outcomes published with permission",
      href: "/case-studies",
      names: ["case studies", "proof"],
      keywords: ["case study"],
    },
    {
      id: "page-submit",
      kind: "Site page",
      title: "Send in a listing",
      subtitle: "A kever, cemetery, provider, or a correction",
      href: "/submit",
      names: ["submit", "send in", "correction"],
      keywords: ["submit"],
    },
  ];

  for (const [index, page] of pages.entries()) {
    docs.push({
      id: page.id,
      kind: page.kind,
      section: sectionForKind(page.kind),
      title: page.title,
      subtitle: page.subtitle,
      href: page.href,
      names: page.names,
      keywords: page.keywords,
      body: page.body ?? "",
      rankWeight: page.rankWeight ?? index,
      heritage: page.href.startsWith("/heritage") || page.href.startsWith("/cemeteries") || page.href.startsWith("/tzaddikim") || page.href === "/stops",
      vacation: page.href === "/destinations",
    });
  }

}

async function pushPublishedInfoPages(docs: DraftDoc[]) {
  if (!process.env.DATABASE_URL) return;
  try {
    const { prisma } = await import("@/lib/prisma");
    const { editablePages } = await import("@/data/pages");
    const predefined = new Set(editablePages.map((p) => p.slug));
    const rows = await prisma.page.findMany({
      where: { status: "PUBLISHED" },
      select: { slug: true, title: true, body: true, seoDescription: true },
    });
    for (const row of rows) {
      if (predefined.has(row.slug)) continue;
      docs.push({
        id: `info-${row.slug}`,
        kind: "Site page",
        section: sectionForKind("Site page"),
        title: row.title,
        subtitle: "Travel guide",
        href: `/info/${row.slug}`,
        names: [row.title, row.slug.replace(/-/g, " ")],
        keywords: ["guide", "info"],
        body: (row.seoDescription || row.body || "").slice(0, 400),
        rankWeight: 50,
        heritage: false,
        vacation: false,
      });
    }
  } catch {
    // Fail safe: built-in index still works without the DB.
  }
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value.trim());
  }
  return out;
}

/**
 * Source-backed mikvaos and minyanim that ship in the repo. Database-published
 * practical rows are added separately; this keeps those names searchable when
 * the database is off, and fills gaps the public mikvaos page already shows.
 */
function pushStaticPracticalPlaces(docs: DraftDoc[], destinations: readonly VacationDestination[]) {
  const seen = new Set(docs.filter((d) => d.kind === "Practical travel").map((d) => `${normalize(d.title)}|${normalize(d.city ?? "")}`));

  for (const listing of staticMikvahListings()) {
    const key = `${normalize(listing.name)}|${normalize(listing.city)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    docs.push(
      publishedPracticalPlaceSearchDocument(
        {
          id: listing.id,
          category: "MIKVAH",
          name: listing.name,
          address: listing.address,
          notes: listing.notes,
          sourceUrl: listing.sourceUrl,
          destination: { slug: listing.destinationSlug, city: listing.city, country: listing.country },
        },
        0,
      ),
    );
  }

  for (const [slug, content] of Object.entries(practicalContent)) {
    for (const [index, place] of (content.places ?? []).entries()) {
      if (place.category !== "MINYAN") continue;
      const sourceUrl = place.source?.trim();
      if (!sourceUrl || isDisallowedImportSource({ sourceUrl, sourceName: "", attribution: "" })) continue;
      const staticDestination = getDestination(slug);
      const vacationDestination = destinations.find((item) => item.slug === slug);
      const city = staticDestination?.city ?? vacationDestination?.cities[0] ?? slug;
      const country = staticDestination?.country ?? vacationDestination?.country ?? "";
      const key = `${normalize(place.name)}|${normalize(city)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      docs.push(
        publishedPracticalPlaceSearchDocument(
          {
            id: `static-minyan-${slug}-${index}`,
            category: "MINYAN",
            name: place.name,
            address: place.address ?? null,
            notes: place.notes ?? null,
            sourceUrl,
            destination: { slug, city, country },
          },
          index,
        ),
      );
    }
  }
}
