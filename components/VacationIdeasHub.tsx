"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import VacationCard from "@/components/VacationCard";
import { SEASONS, TRIP_THEMES, type Season, type TripTheme } from "@/data/vacation-destinations";
import {
  activeFilterCount,
  countryOptions,
  filterVacations,
  kosherOptions,
  seasonOptions,
  shabbosOptions,
  themeOptions,
  vacationBrowseHref,
  type FilterOption,
  type KosherLevel,
  type ShabbosLevel,
  cardSlug,
  type DirectoryCard,
  type VacationFilters,
} from "@/lib/vacation-ideas";

/**
 * Browsing the vacation destinations.
 *
 * THREE THINGS THIS DOES THAT THE OLD DIRECTORIES DID NOT.
 *
 * 1. **No empty filters.** Every option carries the number of destinations
 *    behind it and an option with none is not rendered. A row of chips that
 *    includes "Beach and resort (0)" is a promise the site cannot keep, and
 *    pressing one to find an empty page is worse than never offering it. The
 *    counts come from lib/vacation-ideas.ts, which computes them from the same
 *    data the cards are built from.
 *
 * 2. **The result count is announced.** Filtering with a keyboard or a screen
 *    reader used to change the page silently: you pressed "Mountains", nothing
 *    said anything, and the only way to find out what happened was to tab
 *    through the whole list. The count lives in a polite live region — and in
 *    a live region that holds NOTHING BUT the count. The "Clear all filters"
 *    button used to be inside it, so every press announced the button's label
 *    along with the number, and appearing or disappearing changed the region's
 *    structure rather than its text, which some screen readers read out whole
 *    and others do not read at all.
 *
 * 3. **Each filter group is a real fieldset with a legend.** Six loose rows of
 *    buttons read as thirty unrelated controls; grouped, each one is announced
 *    with what it is filtering.
 *
 * The holiday type and season also live in the address. Those are the two
 * browse choices visitors make before arriving at the full filter set, so a
 * copied link and the browser's Back button should keep them. Search and the
 * more detailed refinements stay local, which keeps typing and narrowing
 * immediate.
 */

const chip = "inline-flex min-h-11 items-center rounded-full border px-4 text-xs font-bold tracking-[0.04em] transition";
const chipOff = `${chip} border-[var(--gold-light)] bg-white text-stone-700 hover:border-[var(--gold)] hover:text-[var(--navy)]`;
const chipOn = `${chip} border-[var(--navy)] bg-[var(--navy)] text-white`;

type LocalVacationFilters = Omit<VacationFilters, "theme" | "season">;

const NO_LOCAL_VACATION_FILTERS: LocalVacationFilters = {
  query: "",
  country: "",
  kosher: "",
  shabbos: "",
};

function FilterGroup<V extends string>({
  legend,
  options,
  value,
  onChange,
  allLabel,
}: {
  legend: string;
  options: Array<FilterOption<V>>;
  value: V | "";
  onChange: (next: V | "") => void;
  allLabel: string;
}) {
  // An entire group with nothing behind it is not rendered either — that is
  // the same rule one level up.
  if (options.length === 0) return null;
  return (
    <fieldset className="min-w-0">
      <legend className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">{legend}</legend>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => onChange("")} aria-pressed={value === ""} className={value === "" ? chipOn : chipOff}>
          {allLabel}
        </button>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(value === option.value ? "" : option.value)}
            aria-pressed={value === option.value}
            className={value === option.value ? chipOn : chipOff}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function VacationIdeasHub({
  cards,
  initialTheme = "",
  initialSeason = "",
}: {
  cards: DirectoryCard[];
  /** Set when the visitor arrived from a category on the front page. */
  initialTheme?: TripTheme | "";
  /** Set when the visitor arrived from a time of year on the front page. */
  initialSeason?: Season | "";
}) {
  const router = useRouter();
  const [localFilters, setLocalFilters] = useState<LocalVacationFilters>(NO_LOCAL_VACATION_FILTERS);
  // The page supplies these two values again on every same-route navigation.
  // Keeping them out of local state makes style-card links and Back/Forward
  // immediately authoritative without discarding a search or other refinement.
  const filters = useMemo<VacationFilters>(
    () => ({ ...localFilters, theme: initialTheme, season: initialSeason }),
    [initialSeason, initialTheme, localFilters],
  );

  const themes = useMemo(() => themeOptions(cards, TRIP_THEMES), [cards]);
  const seasons = useMemo(() => seasonOptions(cards, SEASONS), [cards]);
  const countries = useMemo(() => countryOptions(cards), [cards]);
  const kosher = useMemo(() => kosherOptions(cards), [cards]);
  const shabbos = useMemo(() => shabbosOptions(cards), [cards]);
  const results = useMemo(() => filterVacations(cards, filters), [cards, filters]);

  const active = activeFilterCount(filters);
  const set = <K extends keyof LocalVacationFilters>(key: K, value: LocalVacationFilters[K]) =>
    setLocalFilters((current) => ({ ...current, [key]: value }));
  const setTheme = (theme: TripTheme | "") => {
    router.push(vacationBrowseHref({ theme, season: filters.season }), { scroll: false });
  };
  const setSeason = (season: Season | "") => {
    router.push(vacationBrowseHref({ theme: filters.theme, season }), { scroll: false });
  };
  const clearFilters = () => {
    setLocalFilters({ ...NO_LOCAL_VACATION_FILTERS });
    router.push(vacationBrowseHref({ theme: "", season: "" }), { scroll: false });
  };

  return (
    <div>
      <div className="rounded-2xl border border-[var(--gold-light)] bg-[#FAF8F3] p-5 sm:p-7">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* A REAL LABEL, TIED TO THE FIELD BY ID, and visible whether or
              not anything has been typed. The placeholder is a hint and not a
              name: it disappears at the first keystroke, so a person who tabs
              back to a filled field has nothing left telling them what it is,
              and voice control has no name to speak. The two are different
              things and this field needs both. */}
          <div className="lg:col-span-2">
            <label htmlFor="vacation-search" className="block text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">
              Search
            </label>
            <input
              id="vacation-search"
              type="search"
              value={filters.query}
              onChange={(event) => set("query", event.target.value)}
              placeholder="Rome, Switzerland, mountains…"
              className="mt-2 w-full rounded-md border border-[var(--gold-light)] bg-white px-4 py-3 text-sm text-[var(--navy)] shadow-sm focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]"
            />
          </div>

          <details className="lg:col-span-2 rounded-xl border border-[var(--gold-light)] bg-white px-4 py-1" open={active > 0}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold text-[var(--navy)] [&::-webkit-details-marker]:hidden">
              Filter
            </summary>
            <div className="grid gap-6 border-t border-[var(--gold-light)] py-4 lg:grid-cols-2">
          <FilterGroup legend="Trip type" allLabel="Any" options={themes} value={filters.theme} onChange={(v) => setTheme(v as TripTheme | "")} />
          <FilterGroup legend="Season" allLabel="Any season" options={seasons} value={filters.season} onChange={(v) => setSeason(v as Season | "")} />
          <FilterGroup legend="Country" allLabel="Anywhere" options={countries} value={filters.country} onChange={(v) => set("country", v)} />
          <div className="grid gap-6">
            <FilterGroup
              legend="Kosher food"
              allLabel="Any"
              options={kosher}
              value={filters.kosher}
              onChange={(v) => set("kosher", v as KosherLevel | "")}
            />
            <FilterGroup
              legend="Shabbos"
              allLabel="Any"
              options={shabbos}
              value={filters.shabbos}
              onChange={(v) => set("shabbos", v as ShabbosLevel | "")}
            />
          </div>
            </div>
          </details>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Politely, so a filter press is not announced over whatever is being
            read — but announced, which is the part that was missing. Text
            only: a live region that also holds a button announces the button
            every time the number changes, and announces nothing reliably when
            the button appears or disappears. */}
        <p role="status" aria-live="polite" className="text-sm font-semibold text-[var(--navy)]">
          {active > 0 ? "Filtered destinations" : "All destinations"}
        </p>
        {active > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-[0.1em] text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
          >
            All destinations
            <span className="sr-only"> — clear filters</span>
          </button>
        )}
      </div>

      {results.length > 0 ? (
        <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {results.map((card) => (
            <VacationCard key={`${card.kind}-${cardSlug(card)}`} card={card} />
          ))}
        </div>
      ) : (
        /* An empty result has to say what to do next. "No matches" and a blank
           page is where somebody leaves. */
        <div className="mt-4 rounded-2xl border border-dashed border-[var(--gold)] bg-[#FAF8F3] p-8 text-center">
          <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
            Nothing here matches all of those at once.
          </p>
          <p className="mx-auto mt-3 max-w-xl leading-7 text-stone-600">
            We publish a destination when we hold enough real information to be useful about it, so the list is shorter
            than a booking site&apos;s. Widen one filter — or tell us where you are thinking of and we will look into it
            for you.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex min-h-11 items-center rounded-md border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.1em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]"
            >
              Show every destination
            </button>
            <Link
              href="/plan"
              className="inline-flex min-h-11 items-center rounded-md border border-[var(--gold)] px-5 text-xs font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:bg-[var(--cream-deep)]"
            >
              Tell us what you are looking for
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
