"use client";

import { fuzzyMatch, normalize } from "@/lib/place-search";
import { Icon } from "@/components/icons/Icon";
import { IconLink } from "@/components/icons/IconAction";

// The search bar and filters that belong at the top of any long list.
//
// The rule this exists for: a page that lists a hundred and fifty things needs
// a way to find one of them. Scrolling is not a way to find one of them.
//
// It is only the controls — the page keeps its own markup for the list itself,
// so the look of each page stays the page's own. What is shared is the
// behaviour and the shape of the controls, so a search box means the same
// thing and sits in the same place wherever it appears.
//
// ONE SEARCH BAR, ONE FILTER BUTTON, TAGS FOR WHAT IS SET. The selects used
// to sit open on the page; they now live behind a single Filter control, and
// each filter that has been set shows as a small removable tag beside it —
// so what is narrowing the list is always visible even while the panel is
// closed, and any one filter comes off with one press rather than reopening
// the panel to find it.
//
// NO COUNTS. This used to print "Showing 12 of 149 batei hachaim". The
// redesign removes result totals everywhere — what matters is whether the
// list is narrowed (the tags say so) and whether it is empty (said in words).

export type ListFilter = {
  /** Shown above the select, and on the tag when set. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** "" is always offered first, with `allLabel` as its wording. */
  options: Array<{ value: string; label: string }>;
  allLabel: string;
};

const inputClass =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const captionClass = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";

export default function ListToolbar({
  query,
  onQuery,
  placeholder,
  filters = [],
  empty = false,
  searchLabel = "Search",
  mapHref,
  onReset,
}: {
  query: string;
  onQuery: (value: string) => void;
  placeholder: string;
  filters?: ListFilter[];
  /** True when nothing matches — the toolbar says so, without a number. */
  empty?: boolean;
  /** The accessible name of the search box, e.g. "Search places to stay". */
  searchLabel?: string;
  /** Where this list can be seen on a map, when it can. Renders the map icon. */
  mapHref?: string;
  /**
   * Put every control back to "everything", in one press.
   *
   * WHY A PAGE NEEDS THIS. Three selects and a search box is four places a
   * list can be narrowed from, and the way somebody ends up with an empty
   * page is by setting two of them and forgetting the first. Clearing the
   * search — which was the only recovery offered — fixed the one filter they
   * could see. Optional, so a list with a search box and nothing else does not
   * grow a button that undoes typing.
   */
  onReset?: () => void;
}) {
  const setFilters = filters.filter((filter) => filter.value);
  const active = Boolean(query.trim()) || setFilters.length > 0;

  return (
    <div className="rounded-xl border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-0 flex-1 basis-64">
          <span className={captionClass}>{searchLabel}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            className={inputClass}
            placeholder={placeholder}
            aria-label={searchLabel}
          />
        </label>
        {mapHref && <IconLink icon="map" label="Map" href={mapHref} className="mb-0.5 border border-[var(--gold-light)] bg-white" />}
      </div>

      {filters.length > 0 && (
        <details className="mt-3 rounded-xl border border-[var(--gold-light)] bg-white px-4 py-1" open={setFilters.length > 0}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold text-[var(--navy)] [&::-webkit-details-marker]:hidden">
            <Icon name="chevron-down" className="h-4 w-4" />
            Filter
          </summary>
          <div className="grid gap-4 border-t border-[var(--gold-light)] py-4 sm:grid-cols-2 lg:grid-cols-3">
            {filters.map((filter) => (
              <label key={filter.label} className="block">
                <span className={captionClass}>{filter.label}</span>
                <select value={filter.value} onChange={(e) => filter.onChange(e.target.value)} className={inputClass}>
                  <option value="">{filter.allLabel}</option>
                  {filter.options.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </details>
      )}

      {/* Each set filter, as a tag that comes off with one press. The value
          shown is the option's own label, so the tag reads "Poland", not a
          slug. */}
      {setFilters.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {setFilters.map((filter) => {
            const chosen = filter.options.find((option) => option.value === filter.value);
            return (
              <li key={filter.label}>
                <button
                  type="button"
                  onClick={() => filter.onChange("")}
                  aria-label={`Remove filter: ${chosen?.label ?? filter.value}`}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--gold)] bg-white px-3 text-xs font-semibold text-[var(--navy)] transition hover:bg-[var(--cream-deep)]"
                >
                  {chosen?.label ?? filter.value}
                  <span aria-hidden="true">✕</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
        <p className="text-sm text-stone-600" role="status">
          {empty ? (
            <>
              No results.{" "}
              <button
                type="button"
                onClick={() => (onReset ? onReset() : onQuery(""))}
                className="underline decoration-[var(--gold)] underline-offset-2"
              >
                {onReset ? "Start again" : "Clear the search"}
              </button>
            </>
          ) : null}
        </p>
        {/* The address bar is carrying the filters (components/useListUrl.ts),
            so a narrowed list is a link somebody can send. */}
        {onReset && active && !empty && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
          >
            Reset filters
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Does this entry match what was typed?
 *
 * THIS USED TO BE ITS OWN MATCHER — accent-folded substring, every word had to
 * appear — while the planner and /stops used the spelling-tolerant one in
 * lib/place-search. Two matchers meant the same query gave two answers:
 * "Colosseom" found the Colosseum in the planner and nothing at all on the
 * page that lists it, and "Lezajsk" found Lizhensk on /stops and nothing on
 * /cemeteries. The page a visitor actually browses was the one that could not
 * spell.
 *
 * So this now delegates. Everything the site searches goes through one matcher,
 * and a fix to it fixes every page at once.
 */
export function listMatches(haystack: string, needle: string): boolean {
  return fuzzyMatch(needle, haystack);
}

/**
 * How close a hit is to what was typed, lower being closer. Sort by this only
 * while there IS a query — with an empty box the page's own order is the right
 * one, and a relevance sort would scramble it for nothing.
 *
 * The city is compared whole and BEFORE the name, for the reason recorded in
 * lib/attraction-search.ts: substring-scoring the two together ranked the
 * Promenade des Anglais as a strong hit for "Rome", because "P-rome-nade"
 * contains it, and a search for Rome opened in Nice.
 */
export function listRank(query: string, city: string, name: string): number {
  const nq = normalize(query);
  if (!nq) return 0;
  if (normalize(city) === nq) return 0;
  if (normalize(city).startsWith(nq)) return 1;
  if (normalize(name).includes(nq)) return 2;
  return 3;
}
