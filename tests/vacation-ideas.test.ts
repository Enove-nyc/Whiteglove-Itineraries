import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { attractions } from "@/data/attractions";
import { kosherEateries } from "@/data/kosher-eateries";
import { kosherAreas, kosherStays } from "@/data/kosher-stays";
import {
  getVacationDestination,
  TRIP_THEMES,
  SEASONS,
  vacationDestinations,
  YOM_TOV_THEMES,
  type VacationDestination,
} from "@/data/vacation-destinations";

// The Yom Tov themes are derived from bestFor and floor-gated, so they are
// allowed to be empty and simply not offered — exempt from the "every theme has
// destinations behind it" rule the stored themes keep.
const isStoredTheme = (value: string) => !(YOM_TOV_THEMES as readonly string[]).includes(value);
import {
  addToTripHref,
  cardModel,
  cardCountry,
  cardModels,
  cardThemes,
  countryOptions,
  factsFor,
  filterVacations,
  kosherAvailability,
  kosherOptions,
  NO_SOURCES,
  NO_VACATION_FILTERS,
  seasonOptions,
  shabbosOptions,
  shabbosPracticality,
  themeOptions,
  vacationBrowseHref,
  type VacationSources,
} from "@/lib/vacation-ideas";

/**
 * The vacation destinations, and the two answers a kosher traveler wants
 * before any of the sightseeing: what will we eat, and what happens on
 * Shabbos.
 *
 * THE RULE THESE TESTS PROTECT is that neither answer is ever written by hand.
 * Both are computed from the records the site already holds, so a destination
 * page can only claim what some other file already stands behind — and a
 * destination we hold nothing for says so instead of guessing.
 */

const SOURCES: VacationSources = { attractions, stays: kosherStays, eateries: kosherEateries, areas: kosherAreas };
/**
 * The built-in destinations in the shape the directory actually works in.
 *
 * data/vacation-destinations.ts ships the plain record; everything downstream
 * takes the overlaid one, which also carries whether the owner added or edited
 * the destination and any photos he uploaded. A built-in with no owner edits on
 * top of it is exactly this — which is what lib/vacation-destinations-view.ts
 * builds when it reads the same list.
 */
const asItem = (d: VacationDestination) => ({ ...d, ownerAdded: false, edited: false, photos: [] });
const CARDS = cardModels(vacationDestinations.map(asItem), SOURCES);
/**
 * The same cards as directory entries.
 *
 * The directory holds two kinds now — holiday destinations and heritage towns
 * — so the filters take the union. These are all the first kind, spread with
 * the tag rather than passed through asDirectoryCards() so the assertions
 * below can still reach `.destination` without narrowing on every line.
 */
const DIRECTORY = CARDS.map((card) => ({ kind: "vacation" as const, ...card }));

function destination(slug: string) {
  const found = getVacationDestination(slug);
  assert.ok(found, `no destination ${slug}`);
  return asItem(found);
}

describe("the destination list itself", () => {
  it("has no duplicate slugs, and every slug is url-shaped", () => {
    const slugs = vacationDestinations.map((d) => d.slug);
    assert.equal(new Set(slugs).size, slugs.length);
    for (const slug of slugs) assert.match(slug, /^[a-z0-9-]+$/, slug);
  });

  it("says something real in every editorial field", () => {
    for (const d of vacationDestinations) {
      assert.ok(d.whyGo.length > 40, `${d.slug}: whyGo`);
      assert.ok(d.overview.length > 120, `${d.slug}: overview`);
      assert.ok(d.bestTime.length > 40, `${d.slug}: bestTime`);
      assert.ok(d.suits.length > 40, `${d.slug}: suits`);
      assert.ok(d.transport.length > 40, `${d.slug}: transport`);
      assert.ok(d.whyVisit.length >= 3, `${d.slug}: whyVisit is thin`);
      assert.ok(d.bestFor.length >= 2, `${d.slug}: bestFor`);
      assert.ok(d.cautions.length >= 1, `${d.slug}: no cautions at all`);
      assert.ok(d.themes.length >= 1 && d.seasons.length >= 1, d.slug);
    }
  });

  it("NAMES CITIES THAT EXIST IN THE DATA", () => {
    // A typo here is silent: the destination page renders with every practical
    // section empty and reads as a place nobody has researched. This is the
    // test that catches it, and it is why `cities` must match the spelling in
    // the three data files exactly.
    const known = new Set<string>([
      ...attractions.map((a) => a.city),
      ...kosherStays.map((s) => s.city),
      ...kosherEateries.map((e) => e.city),
      ...kosherAreas.map((a) => a.city),
    ]);
    const unknown: string[] = [];
    for (const d of vacationDestinations) {
      for (const city of [...d.cities, ...(d.kosherBase?.cities ?? [])]) {
        if (!known.has(city)) unknown.push(`${d.slug}: ${city}`);
      }
    }
    assert.deepEqual(unknown, [], `cities matching nothing on the site: ${unknown.join(", ")}`);
  });

  it("holds something worth publishing for every destination", () => {
    // A destination appears on the hub once the site can be useful about it.
    // One with nothing behind it at all is a page of empty states, and it
    // should not have been added yet.
    for (const card of CARDS) {
      const facts = factsFor(card.destination, SOURCES);
      const held = facts.attractions.length + facts.stays.length + facts.eateries.length + facts.areas.length;
      assert.ok(held > 0, `${card.destination.slug} has no records behind it at all`);
    }
  });

  it("prints no price, no opening time and no phone number", () => {
    // The line data/vacation-destinations.ts says it does not cross. A stale
    // hour sends a family to a locked door on erev Shabbos.
    for (const d of vacationDestinations) {
      const prose = [d.whyGo, d.overview, d.bestTime, d.suits, d.transport, ...d.whyVisit, ...d.cautions].join(" ");
      assert.doesNotMatch(prose, /[€$£]\s?\d/, `${d.slug} quotes a price`);
      assert.doesNotMatch(prose, /\b(open|opens|closes)\s+(at\s+)?\d{1,2}(:\d\d)?\s?(am|pm)\b/i, `${d.slug} states an opening time`);
      assert.doesNotMatch(prose, /\+\d[\d\s-]{7,}/, `${d.slug} carries a phone number`);
    }
  });

  it("offers every theme and season it advertises", () => {
    // A filter chip with nothing behind it is a promise the site cannot keep —
    // for the STORED themes. The Yom Tov themes are derived and floor-gated, so
    // an empty one is not offered rather than shown, and is exempt here.
    for (const theme of TRIP_THEMES) {
      if (!isStoredTheme(theme.value)) continue;
      assert.ok(
        vacationDestinations.some((d) => d.themes.includes(theme.value)),
        `${theme.value} is offered as a category with no destinations in it`,
      );
    }
    for (const season of SEASONS) {
      assert.ok(vacationDestinations.some((d) => d.seasons.includes(season.value)), season.value);
    }
  });
});

describe("what we can say about kosher food", () => {
  it("reports what is on record where there is something", () => {
    const rome = cardModel(destination("rome"), SOURCES);
    assert.equal(rome.kosher.level, "in-town");
    assert.match(rome.kosher.detail, /Rome/);
  });

  it("names the town you shop in when the destination has nothing", () => {
    // The alpine case, and the single most useful sentence this site can say
    // about a mountain holiday.
    const jungfrau = cardModel(destination("jungfrau-region"), SOURCES);
    assert.equal(jungfrau.kosher.level, "from-a-base");
    assert.match(jungfrau.kosher.detail, /Zurich/);
  });

  it("TELLS THE TRAVELER WHAT TO DO WHEN WE HOLD NOTHING", () => {
    // The failure this prevents is a page that looks researched because the
    // template filled every section with something. The level still fires and
    // still reads "unknown" to every filter — what changed is that the
    // sentence is an instruction rather than a report on our own coverage.
    // AGENTS.md: do not expose internal workflows or content status.
    const invented: VacationDestination = { ...destination("rome"), slug: "nowhere", name: "Nowhere", cities: ["Nowhere"] };
    const signal = kosherAvailability(invented, factsFor(invented, NO_SOURCES));
    assert.equal(signal.level, "not-checked");
    assert.equal(signal.tone, "unknown");
    assert.match(signal.detail, /Nowhere/, "it does not say which place it is about");
    assert.match(signal.detail, /plan|arrange|confirm/i, "it does not say what to do");
    for (const leak of [/do not yet hold/i, /not checked/i, /on record/i, /we have not/i]) {
      assert.doesNotMatch(signal.detail, leak, "the signal reports on our own coverage");
    }
  });

  it("describes the site's records rather than judging the town", () => {
    for (const card of CARDS) {
      assert.doesNotMatch(card.kosher.detail, /\b(excellent|great|best|world-class)\b/i, card.destination.slug);
    }
  });
});

describe("what we can say about Shabbos", () => {
  it("treats a quarter with a published anchor as the strong answer", () => {
    const zurich = cardModel(destination("zurich"), SOURCES);
    assert.equal(zurich.shabbos.level, "walkable-quarter");
    assert.match(zurich.shabbos.detail, /Wiedikon/);
  });

  it("WARNS WHEN THE ONLY KOSHER PROVISION IS A SEASON", () => {
    // Turning up in November at a hotel that ran a kosher programme in August
    // gets you a room and nothing to eat. This is the case that costs somebody
    // a Shabbos, so it gets its own level rather than being rounded into
    // "arrange ahead".
    const seasonalOnly: VacationDestination = { ...destination("rome"), slug: "seasonal", name: "Seasonal", cities: ["Seasonaltown"] };
    const sources: VacationSources = {
      attractions: [],
      eateries: [],
      areas: [],
      stays: [
        {
          slug: "seasonal-stay",
          name: "A kosher programme",
          city: "Seasonaltown",
          country: "Nowhere",
          kind: "Seasonal kosher programme",
          summary: "Runs for a few weeks a year.",
          season: "July and August only",
          kosherClaim: "reported",
          anchor: { name: "The shul", coordinates: "1, 1" },
        },
      ],
    };
    const signal = shabbosPracticality(seasonalOnly, factsFor(seasonalOnly, sources));
    assert.equal(signal.level, "seasonal");
    // The season itself and the instruction to check it. This is the one that
    // costs somebody a Shabbos, so the warning survives the rewording — what
    // went is the graphic half of the sentence, not the caution.
    assert.match(signal.detail, /July and August only/);
    assert.match(signal.detail, /confirm/i);
  });

  it("says to arrange it where there is no walkable quarter", () => {
    const tyrol = cardModel(destination("austrian-tyrol"), SOURCES);
    assert.equal(tyrol.shabbos.level, "arrange-ahead");
  });

  it("admits when it has not been checked", () => {
    const invented: VacationDestination = { ...destination("rome"), slug: "nowhere", cities: ["Nowhere"], kosherBase: undefined };
    assert.equal(shabbosPracticality(invented, factsFor(invented, NO_SOURCES)).level, "not-checked");
  });
});

describe("the indicators never rest on colour", () => {
  it("carries a glyph on every level of both signals", () => {
    for (const card of CARDS) {
      assert.ok(card.kosher.glyph.trim(), card.destination.slug);
      assert.ok(card.shabbos.glyph.trim(), card.destination.slug);
      assert.ok(card.kosher.detail.length > 40, card.destination.slug);
      assert.ok(card.shabbos.detail.length > 40, card.destination.slug);
    }
  });
});

describe("filtering", () => {
  it("returns everything when nothing is chosen", () => {
    assert.equal(filterVacations(DIRECTORY, NO_VACATION_FILTERS).length, CARDS.length);
  });

  it("narrows by theme, season and country together", () => {
    const filtered = filterVacations(DIRECTORY, { ...NO_VACATION_FILTERS, theme: "mountains", country: "Switzerland" });
    assert.ok(filtered.length > 0);
    for (const card of filtered) {
      assert.ok(cardThemes(card).includes("mountains"));
      assert.equal(cardCountry(card), "Switzerland");
    }
  });

  it("searches the name, the country and the cities behind it", () => {
    assert.ok(filterVacations(DIRECTORY, { ...NO_VACATION_FILTERS, query: "rome" }).length > 0);
    assert.ok(filterVacations(DIRECTORY, { ...NO_VACATION_FILTERS, query: "lauterbrunnen" }).length > 0);
    assert.equal(filterVacations(DIRECTORY, { ...NO_VACATION_FILTERS, query: "qqqqq" }).length, 0);
  });

  it("OFFERS NO FILTER WITH NOTHING BEHIND IT", () => {
    // THE ONE THAT MATTERS for the hub. Pressing a chip and landing on an
    // empty page is worse than never being offered the chip.
    for (const options of [
      themeOptions(DIRECTORY, TRIP_THEMES),
      seasonOptions(DIRECTORY, SEASONS),
      countryOptions(DIRECTORY),
      kosherOptions(DIRECTORY),
      shabbosOptions(DIRECTORY),
    ]) {
      for (const option of options) {
        assert.ok(option.count > 0, `${option.label} is offered with nothing behind it`);
        const found = filterVacations(DIRECTORY, { ...NO_VACATION_FILTERS }).length;
        assert.ok(found >= option.count);
      }
    }
  });

  it("counts what the filter will actually show", () => {
    for (const option of themeOptions(DIRECTORY, TRIP_THEMES)) {
      assert.equal(filterVacations(DIRECTORY, { ...NO_VACATION_FILTERS, theme: option.value }).length, option.count);
    }
  });

  it("gives every advertised style a canonical URL for exactly its matching destinations", () => {
    const options = new Map(themeOptions(DIRECTORY, TRIP_THEMES).map((option) => [option.value, option]));
    for (const theme of TRIP_THEMES) {
      const option = options.get(theme.value);
      // A derived Yom Tov theme with nothing behind it is correctly absent from
      // the advertised options — skip it rather than demand a count it has none
      // of. Every stored theme must still be advertised with an exact count.
      if (!option && !isStoredTheme(theme.value)) continue;
      assert.ok(option, `${theme.value} is shown without a destination count`);
      assert.equal(vacationBrowseHref({ theme: theme.value, season: "" }), `/destinations?kind=${theme.value}`);
      assert.equal(filterVacations(DIRECTORY, { ...NO_VACATION_FILTERS, theme: theme.value }).length, option.count);
    }
  });

  it("keeps a selected season in a shareable style URL", () => {
    assert.equal(vacationBrowseHref({ theme: "mountains", season: "winter" }), "/destinations?kind=mountains&season=winter");
    assert.equal(vacationBrowseHref({ theme: "", season: "" }), "/destinations");
  });
});

describe("where the buttons go", () => {
  it("sends “add to trip” into the guided flow with the destination named", () => {
    // A destination is not a stop. Pressing this means "I want to go here",
    // and the next question is when and with whom.
    assert.equal(addToTripHref(destination("rome")), "/plan?destination=rome");
  });
});
