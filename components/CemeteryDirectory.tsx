"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import ListToolbar, { listMatches } from "@/components/ListToolbar";
import { extraSpellings } from "@/lib/place-search";
import type { CemeteryListItem } from "@/lib/cemeteries-view";

// The batei hachaim directory, with a way to find one in it.
//
// A hundred and fifty-odd cards in one grid is not a directory, it is a wall.
// Somebody who knows they want Sanz, or wants everything in Hungary, or is
// looking for the Chozeh without remembering which town he is in, had nothing
// to do but scroll.
//
// So: search across the town, the country and the names of everybody buried
// there — in English or Yiddish — plus a country filter and a choice of order.
// Each card is just the names of the place — Yiddish and English, town and
// country — and the whole card is the link; the kevarim themselves, the
// counts and everything else live on the detail page.
//
// ONE DIRECTORY, TWO SETS BEHIND IT. There used to be a second browser lower on
// the page — the Nesiya Tova "batei hachaim worldwide" locator, with its own
// country dropdowns — so the page asked you to pick a country twice. They are
// one directory now: the curated kevarim guides are what you see by default
// (rich cards, ~150), and the moment you search a town or choose a country the
// far larger set located from Nesiya Tova joins in for that place. The Nesiya
// Tova set stays out of the default view on purpose — nearly two thousand
// location-only entries would bury the guides — and never carries a per-card
// source line; its own detail page forwards to Nesiya Tova for the details.

type Order = "city" | "country" | "tzaddik" | "kevarim";

/** A Nesiya Tova located ground — a place with a source, not a full guide. */
export type HeritageEntry = { slug: string; city: string; country: string };

export default function CemeteryDirectory({
  cemeteries,
  heritage = [],
  initialCountry = "",
}: {
  cemeteries: CemeteryListItem[];
  /** The Nesiya Tova located set, shown once a town or country narrows the list. */
  heritage?: HeritageEntry[];
  /**
   * Arrived from "Browse by country" on the heritage landing page.
   *
   * A prop rather than a query the component reads for itself, so this stays
   * the same self-contained filter it has always been and the page above it
   * decides what a link means.
   */
  initialCountry?: string;
}) {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState(initialCountry);
  const [order, setOrder] = useState<Order>("city");

  // Every country either set knows, so the one dropdown reaches all of them.
  const countries = useMemo(
    () =>
      [...new Set([...cemeteries.map((c) => c.country), ...heritage.map((h) => h.country)])]
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ value, label: value })),
    [cemeteries, heritage],
  );

  const shown = useMemo(() => {
    const filtered = cemeteries.filter(
      (c) =>
        (!country || c.country === country) &&
        // The same alternate spellings the /stops search has always used. A
        // kever town is written a dozen ways and this page knew none of them:
        // "Lezajsk" and "Leżajsk" found nothing while "Lizhensk" worked.
        listMatches([c.city, c.yiddishCity, c.name, c.yiddishName, c.country, ...c.burials, extraSpellings([c.slug, c.city])].join(" "), query),
    );
    const by: Record<Order, (a: CemeteryListItem, b: CemeteryListItem) => number> = {
      city: (a, b) => a.city.localeCompare(b.city),
      country: (a, b) => a.country.localeCompare(b.country) || a.city.localeCompare(b.city),
      // The name people actually come for. A ground with nobody named yet
      // sorts last rather than first, so the list opens with the ones that
      // have something to show.
      tzaddik: (a, b) => (a.burials[0] ?? "￿").localeCompare(b.burials[0] ?? "￿"),
      kevarim: (a, b) => b.burialCount - a.burialCount || a.city.localeCompare(b.city),
    };
    return [...filtered].sort(by[order]);
  }, [cemeteries, country, query, order]);

  // The located set joins in only once the list is narrowed — otherwise nearly
  // two thousand location-only entries would swamp the guides on first sight.
  const narrowed = Boolean(country || query.trim());
  const heritageShown = useMemo(() => {
    if (!narrowed) return [];
    return heritage
      .filter((h) => (!country || h.country === country) && listMatches([h.city, h.country, extraSpellings([h.slug, h.city])].join(" "), query))
      .sort((a, b) =>
        order === "country" ? a.country.localeCompare(b.country) || a.city.localeCompare(b.city) : a.city.localeCompare(b.city),
      );
  }, [heritage, country, query, order, narrowed]);

  return (
    <>
      <ListToolbar
        query={query}
        onQuery={setQuery}
        placeholder="Town, country, or who is buried there — Sanz, Kraków, קאָװנע, the Chozeh…"
        searchLabel="Search batei hachaim"
        empty={shown.length === 0 && heritageShown.length === 0}
        mapHref="/map"
        filters={[
          { label: "Country", value: country, onChange: setCountry, options: countries, allLabel: "Everywhere" },
          {
            label: "Order",
            value: order === "city" ? "" : order,
            onChange: (v) => setOrder((v || "city") as Order),
            allLabel: "By town",
            options: [
              { value: "country", label: "By country" },
              { value: "tzaddik", label: "By tzaddik" },
              { value: "kevarim", label: "Most kevarim first" },
            ],
          },
        ]}
      />

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {shown.map((cemetery) => (
          <Link
            key={cemetery.slug}
            href={`/cemeteries/${cemetery.slug}`}
            className="min-w-0 border border-[var(--gold-light)] bg-[#FAF8F3] p-5 transition hover:border-[var(--gold)] hover:shadow-md sm:p-7"
          >
            <h2 dir="rtl" lang="yi" className="font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--navy)] [overflow-wrap:anywhere] sm:text-4xl">{cemetery.yiddishName}</h2>
            <p className="mt-2 font-[family-name:var(--font-display)] text-xl text-stone-500">{cemetery.name}</p>
            <p className="mt-3 break-words text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)] sm:tracking-[0.18em]">{cemetery.city} · {cemetery.country}</p>
          </Link>
        ))}
      </div>

      {/* The located-from-Nesiya-Tova batei hachaim for the same search or
          country. Compact — a town and a country — each opening a page with
          directions and a forward to Nesiya Tova for the details. */}
      {heritageShown.length > 0 && (
        <div className="mt-12 border-t border-[var(--gold-light)] pt-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--gold-ink)]">Located from Nesiya Tova</p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
            Batei hachaim located for this search — locations rather than full guides. Each opens with directions and
            forwards to Nesiya Tova for access, hours and contacts. Many grounds are locked; confirm access before
            travelling.
          </p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {heritageShown.map((h) => (
              <li key={h.slug}>
                <Link
                  href={`/cemeteries/heritage/${h.slug}`}
                  className="block min-w-0 border border-[var(--gold-light)] bg-[var(--surface)] p-4 transition hover:border-[var(--gold)] hover:shadow-sm"
                >
                  <span className="block truncate font-semibold text-[var(--navy)]">{h.city}</span>
                  <span className="mt-0.5 block truncate text-xs text-stone-500">{h.country}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Nothing typed and no country chosen: say the located set is there, and
          how to bring it in — without a count, and without a wall of it. */}
      {!narrowed && heritage.length > 0 && (
        <p className="mt-10 max-w-3xl border-l-4 border-[var(--gold)] bg-[#FAF8F3] px-5 py-4 text-sm leading-6 text-stone-600">
          Search a town or choose a country to include the batei hachaim located worldwide from Nesiya Tova. Many grounds
          are locked; confirm access before travelling.
        </p>
      )}
    </>
  );
}
