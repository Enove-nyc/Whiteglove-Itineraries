"use client";

import Link from "next/link";
import { useIsItineraries } from "@/components/useSiteBrand";
import { useMemo, useState, type ReactNode } from "react";
import BilingualLabel from "@/components/BilingualLabel";
import {
  heritageKindHeading,
  kindLabel,
  sectionHeading,
} from "@/lib/site-search-labels";
import type { SiteHit, SiteHitKind, SiteHitSection } from "@/lib/site-search-types";
import { SITE_HIT_KINDS, SITE_HIT_SECTIONS } from "@/lib/site-search-types";

const SECTION_ORDER: SiteHitSection[] = [...SITE_HIT_SECTIONS];

/** Where somebody goes when the search found nothing — the guide's own
 *  sections, on the kosher brand. */
const NO_RESULT_DOORS = [
  { label: "Destinations", href: "/destinations" },
  { label: "Where to stay", href: "/hotels" },
  { label: "Kosher food", href: "/kosher" },
  { label: "Things to do", href: "/things-to-do" },
  { label: "Map", href: "/map" },
];
/** The itineraries brand carries none of those guide pages — each redirects
 *  off the domain — so a dead-end search there offers the planner instead,
 *  exactly as the empty-query branch does. */
const NO_RESULT_DOORS_ITINERARIES = [
  { label: "Plan a trip", href: "/plan" },
  { label: "Build the trip yourself", href: "/itinerary" },
  { label: "Search booking partners", href: "/book" },
];
const HERITAGE_FIRST: SiteHitSection[] = [
  "Heritage",
  "Vacation",
  "Stay",
  "Things to do",
  "Kosher travel",
  "Guides and services",
];

type DisplayGroup = { key: string; heading: string; hits: SiteHit[] };

function buildGroups(hits: SiteHit[], order: SiteHitSection[]): DisplayGroup[] {
  const groups: DisplayGroup[] = [];
  for (const section of order) {
    const sectionHits = hits.filter((h) => h.section === section);
    if (!sectionHits.length) continue;
    if (section === "Heritage") {
      const kindOrder: SiteHitKind[] = ["Kever or tzaddik", "Beis hachaim", "Heritage town"];
      for (const kind of kindOrder) {
        const kindHits = sectionHits.filter((h) => h.kind === kind);
        if (!kindHits.length) continue;
        groups.push({
          key: `${section}-${kind}`,
          heading: heritageKindHeading(kind) ?? sectionHeading(section),
          hits: kindHits,
        });
      }
      continue;
    }
    groups.push({ key: section, heading: sectionHeading(section), hits: sectionHits });
  }
  return groups;
}

export default function SearchResults({
  query,
  results,
  interpretedAs,
  heritageIntent,
}: {
  query: string;
  results: SiteHit[];
  interpretedAs?: string;
  heritageIntent: boolean;
}) {
  // Which site this is. One line, and right on the first paint — see
  // components/useSiteBrand.ts.
  const itineraries = useIsItineraries();

  // BY LABEL, NOT BY KIND. Two kinds read as "Where to stay" — a hotel and a
  // neighbourhood — so filtering by kind put the same word on two chips beside
  // each other, each hiding half the answer. One chip per word the visitor
  // reads, matching every kind that carries it.
  const [kindFilter, setKindFilter] = useState<string>("all");

  const filtered = useMemo(
    () => (kindFilter === "all" ? results : results.filter((r) => kindLabel(r.kind) === kindFilter)),
    [results, kindFilter],
  );

  const order = heritageIntent ? HERITAGE_FIRST : SECTION_ORDER;
  const groups = buildGroups(filtered, order);
  const presentLabels = SITE_HIT_KINDS.filter((kind) => results.some((r) => r.kind === kind))
    .map(kindLabel)
    .filter((label, index, all) => all.indexOf(label) === index);

  if (!query) {
    // NOTHING TYPED YET, AND THE OFFER DEPENDS ON WHICH SITE THIS IS. The
    // destination directory is the guide's, and on the itineraries domain
    // /destinations is a guide-only path that bounces to the kosher site —
    // which, inside an installed app, means losing the verified domain. The
    // planner is what this brand has instead.
    return (
      <div className="rounded-2xl border border-[var(--gold-light)] bg-[#FAF8F3] px-6 py-10 text-center">
        {itineraries ? (
          <Link href="/itinerary" className="inline-block text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4">
            Open the planner
          </Link>
        ) : (
          <Link href="/destinations" className="inline-block text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4">
            Browse vacation destinations
          </Link>
        )}
      </div>
    );
  }

  if (results.length === 0) {
    // A dead end used to be one line and one link. Somebody who has just
    // mistyped a town, or searched for something this site does not carry,
    // needs somewhere to go next — so: what the search covers, then the
    // places most people are looking for when they end up here.
    return (
      <div className="rounded-2xl border border-[var(--gold-light)] bg-[#FAF8F3] px-6 py-10">
        <p className="text-lg text-[var(--navy)]">No results for “{query}”.</p>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Check the spelling, or try a city or country on its own — Rome, Switzerland, Antwerp.
        </p>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">Try instead</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {(itineraries ? NO_RESULT_DOORS_ITINERARIES : NO_RESULT_DOORS).map((door) => (
            <li key={door.href}>
              <Link
                href={door.href}
                className="inline-flex min-h-11 items-center rounded-full border border-[var(--gold-light)] bg-white px-4 text-sm font-semibold text-[var(--navy)] transition hover:border-[var(--gold)] hover:bg-[var(--cream-deep)]"
              >
                {door.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {interpretedAs ? (
        <p className="text-sm text-stone-600">
          Showing results for <span className="font-semibold text-[var(--navy)]">{interpretedAs}</span>
          <span className="text-stone-400"> — searched as “{query}”</span>
        </p>
      ) : null}

      {presentLabels.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by type">
          <FilterChip active={kindFilter === "all"} onClick={() => setKindFilter("all")}>
            All
          </FilterChip>
          {presentLabels.map((label) => {
            return (
              <FilterChip key={label} active={kindFilter === label} onClick={() => setKindFilter(label)}>
                {label}
              </FilterChip>
            );
          })}
        </div>
      ) : null}

      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`search-section-${group.key}`}>
          <h2
            id={`search-section-${group.key}`}
            className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]"
          >
            {group.heading}
          </h2>
          <ul className="mt-4 divide-y divide-[var(--gold-light)] rounded-2xl border border-[var(--gold-light)] bg-[#FAF8F3]">
            {group.hits.map((hit) => (
              <li key={hit.id}>
                <Link
                  href={hit.href}
                  onClick={() => {
                    void fetch("/api/analytics", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ type: "search_select", kind: hit.kind }),
                      keepalive: true,
                    });
                  }}
                  className="flex w-full max-w-full items-start justify-between gap-4 px-5 py-4 transition hover:bg-[var(--cream-deep)] sm:gap-6"
                >
                  <div className="min-w-0">
                    {hit.yiddish ? (
                      <BilingualLabel primary={hit.yiddish} secondary={hit.title} primaryClassName="text-2xl" secondaryClassName="text-base" compact />
                    ) : (
                      <p className="text-base font-semibold text-[var(--navy)]">{hit.title}</p>
                    )}
                    <p className="mt-1.5 text-sm leading-6 text-stone-600">{hit.subtitle}</p>
                  </div>
                  <span className="shrink-0 pt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gold-ink)] sm:text-xs">
                    {kindLabel(hit.kind)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "border-[var(--navy)] bg-[var(--navy)] text-white"
          : "border-[var(--gold-light)] bg-[#FAF8F3] text-[var(--navy)] hover:bg-[var(--cream-deep)]"
      }`}
    >
      {children}
    </button>
  );
}
