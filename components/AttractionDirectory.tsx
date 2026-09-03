"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import KosherNearby from "@/components/KosherNearby";
import RateExperienceLink from "@/components/RateExperienceLink";
import SuggestEditPanel from "@/components/SuggestEditPanel";
import SaveTripItemButton from "@/components/SaveTripItemButton";
import AddToItineraryButton from "@/components/AddToItineraryButton";
import { ACTION_BUTTON_CLASS } from "@/lib/action-button";
import { staySearchHref } from "@/lib/stay-search";
import ListToolbar, { listMatches, listRank } from "@/components/ListToolbar";
import { useListUrl } from "@/components/useListUrl";
import { placeDirectionsUrl } from "@/data/route-utils";
import { extraSpellings } from "@/lib/place-search";
import type { Attraction } from "@/data/attractions";

// What to do on the days that are not kevarim.
//
// Every attraction with coordinates can show White Glove's curated kosher
// listings nearby. Nothing is inferred from a map-provider business index.

/** How many cards before the page stops and asks. */
const PAGE = 24;

const DEFAULTS = { q: "", country: "", kind: "", city: "" };

export default function AttractionDirectory({ attractions }: { attractions: Attraction[] }) {
  // In the address bar, so a filtered list is a link somebody can send and
  // survives a press of the back button from an entry. components/useListUrl.ts.
  const [filters, setFilters, reset] = useListUrl(DEFAULTS);
  const { q: query, country, kind, city } = filters;
  const [openNearby, setOpenNearby] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const countries = useMemo(
    () =>
      [...new Set(attractions.map((a) => a.country))].sort().map((value) => ({ value, label: value })),
    [attractions],
  );
  const kinds = useMemo(
    () => [...new Set(attractions.map((a) => a.kind))].sort().map((value) => ({ value, label: value })),
    [attractions],
  );
  /**
   * The cities of whichever country is chosen, rather than all of them.
   *
   * This page runs to several hundred entries across a dozen countries, and a
   * flat list of every city in a select is not a filter anybody uses. Narrowed
   * by the country above it, it becomes the control somebody actually wants:
   * "the ones in Rome".
   */
  const cities = useMemo(
    () =>
      [...new Set(attractions.filter((a) => !country || a.country === country).map((a) => a.city))]
        .sort()
        .map((value) => ({ value, label: value })),
    [attractions, country],
  );

  // The notes and the alternate spellings are searched too: half of what makes
  // an entry findable is in its notes ("no kosher food", "pushchair", "toll
  // road"), and a person looking for Merano may well type Meran.
  const shown = attractions
    .filter(
      (a) =>
        (!country || a.country === country) &&
        (!kind || a.kind === kind) &&
        (!city || a.city === city) &&
        listMatches(
          [a.name, a.city, a.country, a.kind, a.summary, (a.notes ?? []).join(" "), extraSpellings([a.slug, a.city])].join(" "),
          query,
        ),
    )
    .sort((a, b) => listRank(query, a.city, a.name) - listRank(query, b.city, b.name));
  const visible = shown.slice(0, limit);

  return (
    <>
      <ListToolbar
        query={query}
        onQuery={(q) => { setFilters({ q }); setLimit(PAGE); }}
        placeholder="Rome, waterfall, ghetto, something for the children…"
        searchLabel="Search things to do"
        empty={shown.length === 0}
        mapHref="/map"
        onReset={() => { reset(); setLimit(PAGE); }}
        filters={[
          {
            label: "Country",
            value: country,
            // Changing the country empties the city, because the city that was
            // chosen is not in the new one.
            onChange: (value) => { setFilters({ country: value, city: "" }); setLimit(PAGE); },
            options: countries,
            allLabel: "Everywhere",
          },
          { label: "City", value: city, onChange: (value) => { setFilters({ city: value }); setLimit(PAGE); }, options: cities, allLabel: "Any city" },
          { label: "Category", value: kind, onChange: (value) => { setFilters({ kind: value }); setLimit(PAGE); }, options: kinds, allLabel: "Anything" },
        ]}
      />

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {visible.map((a) => (
          // The id is what /stops and the planner link to — this page is one
          // page with an anchor per entry, not a page each.
          <article key={a.slug} id={a.slug} className="min-w-0 scroll-mt-24 border border-[var(--gold-light)] bg-[#FAF8F3] p-5 sm:p-7">
            <p className="break-words text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)] sm:tracking-[0.18em]">
              {a.city} · {a.country} · {a.kind}
            </p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--navy)]">{a.name}</h2>
            <p className="mt-3 text-sm leading-7 text-stone-600">{a.summary}</p>

            {a.notes && a.notes.length > 0 && (
              <ul className="mt-4 space-y-2 text-sm leading-6 text-stone-600">
                {a.notes.map((note, i) => (
                  <li key={i} className="border-l-2 border-[var(--gold-light)] pl-3">{note}</li>
                ))}
              </ul>
            )}

            <div className="mt-5 flex flex-wrap gap-2 text-sm">
              {a.coordinates && (
                <a
                  href={placeDirectionsUrl(a.address, a.coordinates)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center rounded-md border border-[var(--gold-light)] px-3 font-semibold text-[var(--navy)]"
                >
                  Navigate →
                </a>
              )}
              {a.website && (
                <a
                  href={a.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center rounded-md border border-[var(--gold-light)] px-3 font-semibold text-[var(--navy)]"
                >
                  Website ↗
                </a>
              )}
              {a.internalHref && (
                <Link
                  href={a.internalHref}
                  className="inline-flex min-h-11 items-center rounded-md border border-[var(--navy)] px-3 font-semibold text-[var(--navy)]"
                >
                  Full guide
                </Link>
              )}
              {a.coordinates && (
                <button
                  type="button"
                  onClick={() => setOpenNearby(openNearby === a.slug ? null : a.slug)}
                  className="inline-flex min-h-11 items-center rounded-md border border-[var(--navy)] bg-[var(--navy)] px-3 font-semibold text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]"
                >
                  {openNearby === a.slug ? "Hide what's nearby" : "Kosher food near here"}
                </button>
              )}
            </div>

            {/* WHAT TO DO WITH IT, on the card that made you want to.
                Somebody who has just read that the Colosseum is twenty minutes
                from the Ghetto has one of two next thoughts — where would we
                sleep, and can I keep this — and until now the answer to both
                was to go back to the navigation and start again. Three
                specific actions instead of a way out of the page. */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--gold-light)] pt-3 text-sm">
              <SaveTripItemButton
                // A saved place needs an address to navigate to. Not every
                // attraction record carries one — a valley or a lake shore is
                // a coordinate and nothing else — so the town is the fallback
                // rather than an empty string that would print as a blank line
                // in the route.
                item={{
                  id: `attraction-${a.slug}`,
                  name: a.name,
                  address: a.address || `${a.city}, ${a.country}`,
                  coordinates: a.coordinates,
                  href: `/things-to-do#${a.slug}`,
                }}
                label="Add to my route"
              />
              {/* The route is the driving order; the itinerary is the trip.
                  The card offered only the first, so a place you wanted on
                  the trip could be saved as a stop and nothing more. */}
              <AddToItineraryButton
                place={{
                  id: `attraction-${a.slug}`,
                  name: a.name,
                  address: a.address || `${a.city}, ${a.country}`,
                  coordinates: a.coordinates,
                }}
              />
              <Link
                href={staySearchHref({ destination: a.city })}
                className="inline-flex min-h-11 items-center font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
              >
                Where to stay in {a.city} →
              </Link>
              <Link
                href={`/plan?destination=${encodeURIComponent(a.city)}`}
                className="inline-flex min-h-11 items-center font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
              >
                Plan a trip here →
              </Link>
              <RateExperienceLink kind="listing" refId={a.slug} label={a.name} />
              <SuggestEditPanel targetType="site" targetId={a.slug} title={a.name} compact />
            </div>

            {openNearby === a.slug && a.coordinates && (
              <div className="mt-4">
                <KosherNearby coordinates={a.coordinates} radiusKm={6} autoLoad showAddToTrip heading={`Kosher near ${a.name}`} />
              </div>
            )}

            {a.address && <p className="mt-4 break-words text-xs leading-5 text-stone-500">{a.address}</p>}
          </article>
        ))}
      </div>

      {/* PROGRESSIVE, NOT PAGINATED. Nearby curated listings are shown only
          when a traveler opens a card, so the directory stays quick to scan.
          Numbered
          pages would break the anchor links: /stops and the planner link
          straight to #slug on this page, and an entry on page four of a
          paginated list is a link that lands nowhere. */}
      {shown.length > visible.length && (
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => setLimit((current) => current + PAGE)}
            className={`inline-flex min-h-11 items-center ${ACTION_BUTTON_CLASS.primary}`}
          >
            Show more
          </button>
        </div>
      )}
    </>
  );
}
