import type { HeritageCardModel } from "@/lib/destination-directory";
/**
 * What the site can honestly say about a vacation destination.
 *
 * THE TWO THINGS A KOSHER TRAVELER ASKS FIRST, before the beaches and the
 * museums, are "what will we eat" and "what happens on Shabbos". Every travel
 * site answers the first with a list of restaurants it copied from somewhere
 * and the second not at all.
 *
 * So both answers here are COMPUTED from what the site actually holds — the
 * quarters in data/kosher-stays.ts with their published anchors, the stays and
 * their `kosherClaim` and seasons, the eateries and their hechsher states, the
 * attractions and their Shabbos notes. Nothing in data/vacation-destinations.ts
 * asserts either one, and nothing here invents a level for a destination whose
 * cities match nothing: that comes out as "not checked yet", which is the true
 * answer and the one a traveler can act on.
 *
 * WHY A QUARTER IS THE STRONGEST SIGNAL FOR SHABBOS. The `kosherAreas` records
 * are not marketing — each is a real quarter with a published coordinate for
 * the shul or street it is measured from, and the note on each says what is
 * within walking distance of it. "There is a Jewish quarter with shuls and
 * kosher shops in it, here is where" is a fact about Shabbos that a hotel star
 * rating is not.
 *
 * WHY THE ALPINE CASE HAS ITS OWN LEVEL. The single most useful sentence this
 * site can say about a mountain holiday is that the scenery is in the valley
 * and the butcher is two hours away in the nearest city. `kosherBase` on a
 * destination names that city; this reads what is on record there and says so
 * plainly rather than reporting the valley as having nothing.
 *
 * Everything below is pure and takes its data as arguments, so the same
 * functions serve the page (which reads through lib/attractions-view.ts, and
 * therefore sees anything the owner has added) and the tests (which pass the
 * built-in files).
 */

import { deriveYomTovThemes, type Season, type TripTheme, type VacationDestination } from "@/data/vacation-destinations";
import type { VacationDestinationItem } from "@/lib/vacation-destinations-view";
import { vacationDestinationHref } from "@/lib/route-migration";

/* ---- the shapes this needs, and no more --------------------------------- */
//
// Structural rather than imported concretely, so both the built-in data files
// and the owner-augmented lists from lib/attractions-view.ts fit without a
// cast, and so a test can hand in three objects.

/**
 * What a destination page is allowed to know about an attraction.
 *
 * IT WAS TOO NARROW, and the narrowing was invisible: `getAttractionList()`
 * has always returned the whole record, so the address, the official site and
 * the practical notes were arriving at the page and being dropped by the type
 * alone. The Rome page could show a name and a sentence and nothing else —
 * no way to see where a place is, open its own site for hours and tickets, or
 * put it on a trip, which are the three things this site is for.
 *
 * `shabbos` went with the field itself; see the note at the top of
 * data/attractions.ts.
 */
export type AttractionLike = {
  slug: string;
  name: string;
  city: string;
  country: string;
  kind: string;
  summary: string;
  /** A street address where there is one. A valley has coordinates instead. */
  address?: string;
  /** The place's own site — where hours and tickets actually live. */
  website?: string;
  /** This site's own fuller page, when there is one. */
  internalHref?: string;
  /** Practical notes, kosher-travel first. */
  notes?: string[];
  /**
   * "lat, lng" — a real, navigable position for a public landmark.
   *
   * Safe to store and to navigate to, unlike a kever's; see the note at the
   * top of data/attractions.ts. A stop with no coordinate cannot be routed,
   * which is why the planner templates skip those.
   */
  coordinates?: string;
};

export type StayLike = {
  slug: string;
  name: string;
  city: string;
  country: string;
  kind: string;
  summary: string;
  season?: string;
  kosherClaim: "none" | "reported" | "confirmed";
  anchor: { name: string; coordinates: string };
};

export type EateryLike = {
  slug: string;
  name: string;
  city: string;
  country: string;
  kind: string;
  diet?: string;
  summary: string;
  hechsher: { state: "certified" | "reported" | "none" | "unverified" };
};

export type AreaLike = {
  slug: string;
  city: string;
  country: string;
  name: string;
  note: string;
  /**
   * The quarter's own published position — the shul or the street it is
   * measured from, not a guess at the middle of the city. It is what a live
   * kosher lookup on a destination page is centred on, which is why an
   * approximate one would be worse than none.
   */
  coordinates: string;
};

export type VacationSources = {
  attractions: readonly AttractionLike[];
  stays: readonly StayLike[];
  eateries: readonly EateryLike[];
  areas: readonly AreaLike[];
};

export const NO_SOURCES: VacationSources = { attractions: [], stays: [], eateries: [], areas: [] };

/** Everything on record for one destination, and for the town it shops in. */
export type VacationFacts = {
  attractions: AttractionLike[];
  stays: StayLike[];
  eateries: EateryLike[];
  areas: AreaLike[];
  /** The kosherBase town's own listings, when the destination names one. */
  base: { cities: string[]; note: string; stays: StayLike[]; eateries: EateryLike[]; areas: AreaLike[] } | null;
};

function inCities<T extends { city: string }>(items: readonly T[], cities: readonly string[]): T[] {
  const wanted = new Set(cities);
  return items.filter((item) => wanted.has(item.city));
}

export function factsFor(destination: VacationDestination, sources: VacationSources): VacationFacts {
  const base = destination.kosherBase
    ? {
        cities: [...destination.kosherBase.cities],
        note: destination.kosherBase.note,
        stays: inCities(sources.stays, destination.kosherBase.cities),
        eateries: inCities(sources.eateries, destination.kosherBase.cities),
        areas: inCities(sources.areas, destination.kosherBase.cities),
      }
    : null;
  return {
    attractions: inCities(sources.attractions, destination.cities),
    stays: inCities(sources.stays, destination.cities),
    eateries: inCities(sources.eateries, destination.cities),
    areas: inCities(sources.areas, destination.cities),
    base,
  };
}

/* ---- the two indicators -------------------------------------------------- */

export type SignalTone = "good" | "workable" | "plan" | "unknown";

export type Signal<L extends string> = {
  level: L;
  /** Short, for the card. */
  label: string;
  /**
   * Never colour alone. The card puts a glyph beside the label so the level
   * survives a screen that cannot separate the greens from the ambers.
   */
  glyph: string;
  tone: SignalTone;
  /** The sentence under it, and the accessible name of the whole indicator. */
  detail: string;
};

export type KosherLevel = "in-town" | "from-a-base" | "not-checked";
export type ShabbosLevel = "walkable-quarter" | "seasonal" | "arrange-ahead" | "not-checked";

/**
 * What we hold about kosher food where you are going.
 *
 * Phrased throughout as what is ON RECORD HERE, not as what exists in the
 * town. The site holding nothing about Merano is a fact about the site; the
 * page must not turn it into a claim about Merano, and must not turn one
 * listing into "great kosher food".
 */
export function kosherAvailability(destination: VacationDestination, facts: VacationFacts): Signal<KosherLevel> {
  const listings = facts.eateries.length;
  const quarters = facts.areas.length;

  if (listings > 0 || quarters > 0) {
    // No tallies. "3 kosher food listings" advertised the size of the
    // database, not the state of the town — the fact a traveler needs is
    // that kosher food is on record here, and the listings themselves are
    // one press away.
    return {
      level: "in-town",
      label: "Kosher food in town",
      glyph: "●",
      tone: "good",
      // "On record" describes White Glove's filing rather than the town, and
      // AGENTS.md keeps that language out of customer copy. What a traveler
      // needs is that there is kosher food here, and to confirm it.
      detail: `There is kosher food in ${destination.name}. Confirm current certification and opening details before visiting.`,
    };
  }

  if (facts.base && (facts.base.eateries.length > 0 || facts.base.areas.length > 0)) {
    return {
      level: "from-a-base",
      label: "Plan supplies ahead",
      glyph: "◐",
      tone: "workable",
      detail: facts.base.note,
    };
  }

  return {
    level: "not-checked",
    label: "Plan ahead",
    glyph: "○",
    tone: "unknown",
    detail: `Plan kosher meals and supplies before traveling to ${destination.name}.`,
  };
}

/**
 * Whether Shabbos works without a car.
 *
 * The order matters and is deliberately pessimistic. A quarter beats a hotel:
 * a seasonal kosher hotel that is not running the week you arrive gets you a
 * room and nothing to eat, and that failure is exactly what the season field
 * in data/kosher-stays.ts exists to prevent.
 */
export function shabbosPracticality(destination: VacationDestination, facts: VacationFacts): Signal<ShabbosLevel> {
  if (facts.areas.length > 0) {
    const named = facts.areas[0];
    return {
      level: "walkable-quarter",
      label: "Walkable quarter",
      glyph: "●",
      tone: "good",
      detail: `${named.name} places synagogues and kosher options within walking distance for Shabbos.`,
    };
  }

  const seasonal = facts.stays.filter((stay) => Boolean(stay.season));
  if (seasonal.length > 0 && seasonal.length === facts.stays.filter((s) => s.kosherClaim !== "none").length) {
    return {
      level: "seasonal",
      label: "Seasonal kosher programme",
      glyph: "◐",
      tone: "workable",
      detail: `Kosher options operate seasonally (${seasonal[0].season}). Confirm program dates before booking.`,
    };
  }

  if (facts.stays.length > 0 || facts.base) {
    return {
      level: "arrange-ahead",
      label: "Arrange Shabbos ahead",
      glyph: "◐",
      tone: "plan",
      detail: `Arrange food, davening, and Shabbos logistics in ${destination.name} before you travel.`,
    };
  }

  return {
    level: "not-checked",
    label: "Plan ahead",
    glyph: "○",
    tone: "unknown",
    detail: `Confirm Shabbos arrangements in ${destination.name} before you plan a Friday around it.`,
  };
}

/* ---- the card ------------------------------------------------------------ */

export type VacationCardModel = {
  destination: VacationDestinationItem;
  kosher: Signal<KosherLevel>;
  shabbos: Signal<ShabbosLevel>;
  /** How many things to do we hold for it. Shown only when it is not zero. */
  thingsToDo: number;
  /** How many places to stay we hold. Same rule. */
  places: number;
};

export function cardModel(destination: VacationDestinationItem, sources: VacationSources): VacationCardModel {
  const facts = factsFor(destination, sources);
  return {
    destination,
    kosher: kosherAvailability(destination, facts),
    shabbos: shabbosPracticality(destination, facts),
    thingsToDo: facts.attractions.length,
    places: facts.stays.length,
  };
}

export function cardModels(
  destinations: readonly VacationDestinationItem[],
  sources: VacationSources,
): VacationCardModel[] {
  return destinations.map((destination) => cardModel(destination, sources));
}

/* ---- filtering ----------------------------------------------------------- */

export type VacationFilters = {
  query: string;
  theme: TripTheme | "";
  season: Season | "";
  country: string;
  kosher: KosherLevel | "";
  shabbos: ShabbosLevel | "";
};

export const NO_VACATION_FILTERS: VacationFilters = {
  query: "",
  theme: "",
  season: "",
  country: "",
  kosher: "",
  shabbos: "",
};

/**
 * The shareable part of the destination browse state.
 *
 * `kind` and `season` are deliberately built only from the canonical
 * taxonomies above. That gives links and client-side navigation one safe URL
 * shape, while the other filters can still refine the list immediately.
 */
export function vacationBrowseHref({
  theme,
  season,
}: Pick<VacationFilters, "theme" | "season">): string {
  const params = new URLSearchParams();
  if (theme) params.set("kind", theme);
  if (season) params.set("season", season);
  const query = params.toString();
  return query ? `/destinations?${query}` : "/destinations";
}

/* ---- the directory: both kinds of destination ---------------------------- */

/**
 * A card in the directory — a holiday destination, or a heritage town.
 *
 * ONE LIST, TWO SHAPES, AND THE SHAPES ARE NOT MADE TO MATCH. A holiday
 * destination carries editorial and two assessed signals; a heritage town
 * carries its name, its country and how many kevarim are on record. Widening
 * the heritage half to fit the holiday one would mean writing sentences nobody
 * wrote, so the card renders what each actually has. See
 * lib/destination-directory.ts for why they belong in one list at all.
 */
export type DirectoryCard =
  | ({ kind: "vacation" } & VacationCardModel)
  | ({ kind: "heritage" } & HeritageCardModel);

export function asDirectoryCards(cards: readonly VacationCardModel[]): DirectoryCard[] {
  return cards.map((card) => ({ kind: "vacation" as const, ...card }));
}

export function asHeritageCards(cards: readonly HeritageCardModel[]): DirectoryCard[] {
  return cards.map((card) => ({ kind: "heritage" as const, ...card }));
}

/** What a card is called, whichever kind it is. */
export function cardName(card: DirectoryCard): string {
  return card.kind === "vacation" ? card.destination.name : card.name;
}

export function cardCountry(card: DirectoryCard): string {
  return card.kind === "vacation" ? card.destination.country : card.country;
}

export function cardSlug(card: DirectoryCard): string {
  return card.kind === "vacation" ? card.destination.slug : card.slug;
}

/**
 * The trip types a card answers to.
 *
 * A HERITAGE TOWN IS A HERITAGE TRIP AND NOTHING ELSE. It is not being called
 * a beach or a short break by omission — it is that the one thing anybody has
 * assessed about it is that this is where the kevarim are, and the filter says
 * only that.
 */
export function cardThemes(card: DirectoryCard): readonly TripTheme[] {
  if (card.kind !== "vacation") return ["heritage"];
  return [...card.destination.themes, ...deriveYomTovThemes(card.destination.bestFor)];
}

/**
 * The seasons a card answers to — none, for a heritage town.
 *
 * Deliberately empty rather than "all four". Nobody has written when in the
 * year Lizhensk is best, and answering a season filter with a town that was
 * never assessed for it is the site inventing an opinion. An empty list means
 * a season filter narrows to the destinations that have one, which is what a
 * filter is for.
 */
export function cardSeasons(card: DirectoryCard): readonly Season[] {
  return card.kind === "vacation" ? card.destination.seasons : [];
}

function haystack(card: DirectoryCard): string {
  if (card.kind === "heritage") {
    return [card.name, card.yiddishName, card.country, card.summary].filter(Boolean).join(" ").toLowerCase();
  }
  const d = card.destination;
  return [d.name, d.country, d.region, ...d.cities, ...d.bestFor, d.whyGo].filter(Boolean).join(" ").toLowerCase();
}

export function filterVacations(cards: readonly DirectoryCard[], filters: VacationFilters): DirectoryCard[] {
  const query = filters.query.trim().toLowerCase();
  return cards.filter((card) => {
    if (query && !haystack(card).includes(query)) return false;
    if (filters.theme && !cardThemes(card).includes(filters.theme)) return false;
    if (filters.season && !cardSeasons(card).includes(filters.season)) return false;
    if (filters.country && cardCountry(card) !== filters.country) return false;
    // The two assessed signals exist only on a holiday destination. Filtering
    // by one narrows to the destinations that have been assessed for it,
    // rather than guessing on behalf of the towns that have not.
    if (filters.kosher && (card.kind !== "vacation" || card.kosher.level !== filters.kosher)) return false;
    if (filters.shabbos && (card.kind !== "vacation" || card.shabbos.level !== filters.shabbos)) return false;
    return true;
  });
}

export function activeFilterCount(filters: VacationFilters): number {
  return (["theme", "season", "country", "kosher", "shabbos"] as const).filter((key) => filters[key] !== "").length +
    (filters.query.trim() ? 1 : 0);
}

/**
 * Only the filter options that would actually return something.
 *
 * A filter row with "Beach and resort (0)" in it is a promise the site cannot
 * keep, and pressing it to find an empty page is worse than never offering it.
 * So every option carries its own count and an option with no destinations
 * behind it is not rendered at all.
 */
export type FilterOption<V extends string> = { value: V; label: string; count: number };

function tally<V extends string>(
  cards: readonly DirectoryCard[],
  options: ReadonlyArray<{ value: V; label: string }>,
  has: (card: DirectoryCard, value: V) => boolean,
  minCount = 1,
): Array<FilterOption<V>> {
  return options
    .map((option) => ({ ...option, count: cards.filter((card) => has(card, option.value)).length }))
    .filter((option) => option.count >= minCount);
}

/**
 * Trip-type chip row minimum. A chip that answers for exactly one destination
 * reads as a category invented for that one place rather than a real way to
 * browse — so a trip type needs at least two real destinations behind it
 * before it is offered as a way in.
 */
const MIN_TRIP_TYPE_DESTINATIONS = 2;

export function themeOptions(
  cards: readonly DirectoryCard[],
  themes: ReadonlyArray<{ value: TripTheme; label: string }>,
): Array<FilterOption<TripTheme>> {
  return tally(cards, themes, (card, value) => cardThemes(card).includes(value), MIN_TRIP_TYPE_DESTINATIONS);
}

export function seasonOptions(
  cards: readonly DirectoryCard[],
  seasons: ReadonlyArray<{ value: Season; label: string }>,
): Array<FilterOption<Season>> {
  return tally(cards, seasons, (card, value) => cardSeasons(card).includes(value));
}

export function countryOptions(cards: readonly DirectoryCard[]): Array<FilterOption<string>> {
  const countries = [...new Set(cards.map(cardCountry))].sort();
  return tally(
    cards,
    countries.map((country) => ({ value: country, label: country })),
    (card, value) => cardCountry(card) === value,
  );
}

export const KOSHER_FILTERS: ReadonlyArray<{ value: KosherLevel; label: string }> = [
  { value: "in-town", label: "Kosher food in town" },
  { value: "from-a-base", label: "Bring it in from a base" },
  { value: "not-checked", label: "Not checked yet" },
] as const;

export const SHABBOS_FILTERS: ReadonlyArray<{ value: ShabbosLevel; label: string }> = [
  { value: "walkable-quarter", label: "Walkable quarter" },
  { value: "seasonal", label: "Seasonal programme" },
  { value: "arrange-ahead", label: "Arrange ahead" },
  { value: "not-checked", label: "Not checked yet" },
] as const;

export function kosherOptions(cards: readonly DirectoryCard[]): Array<FilterOption<KosherLevel>> {
  return tally(cards, KOSHER_FILTERS, (card, value) => card.kind === "vacation" && card.kosher.level === value);
}

export function shabbosOptions(cards: readonly DirectoryCard[]): Array<FilterOption<ShabbosLevel>> {
  return tally(cards, SHABBOS_FILTERS, (card, value) => card.kind === "vacation" && card.shabbos.level === value);
}

/** Meteorological season for the northern hemisphere, from a real month. */
export function currentSeason(now: Date = new Date()): Season {
  const month = now.getMonth(); // 0-11
  if (month <= 1 || month === 11) return "winter";
  if (month <= 4) return "spring";
  if (month <= 7) return "summer";
  return "autumn";
}

/**
 * Destinations for a compact "featured this season" row — active, opted into
 * featuring by an admin, AND actually one of the destination's own recorded
 * seasons. No hardcoded "always feature Pesach": a destination only ever
 * appears here because someone both turned it on and it genuinely answers to
 * the season it is now.
 */
export function featuredThisSeason(
  destinations: readonly VacationDestinationItem[],
  season: Season = currentSeason(),
): VacationDestinationItem[] {
  return destinations.filter(
    (d) => (d.seasonActive ?? true) && d.seasonFeatured === true && d.seasons.includes(season),
  );
}

/** Tailwind per tone. Kept here so a second component cannot invent a palette. */
export const SIGNAL_CLASSES: Record<SignalTone, string> = {
  good: "border-emerald-700 bg-emerald-50 text-emerald-900",
  workable: "border-amber-600 bg-amber-50 text-amber-900",
  plan: "border-[var(--gold)] bg-[#FAF8F3] text-[var(--navy)]",
  unknown: "border-stone-400 bg-stone-100 text-stone-700",
};

/**
 * Where "add this to a trip" goes.
 *
 * The guided flow rather than a saved list, because a destination is not a
 * stop: pressing this means "I want to go here", and the next question is when
 * and with whom. The planner is two answers away and the destination is
 * already filled in when it opens.
 */
export function addToTripHref(destination: VacationDestination): string {
  return `/plan?destination=${encodeURIComponent(destination.slug)}`;
}

export function destinationHref(destination: VacationDestination): string {
  return vacationDestinationHref(destination.slug);
}
