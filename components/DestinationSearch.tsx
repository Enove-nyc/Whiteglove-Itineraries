"use client";

import { BUILT_IN_WORDS } from "@/data/site-words";
import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BilingualLabel from "@/components/BilingualLabel";
import {
  heritageKindHeading,
  kindLabel,
  sectionHeading,
  SITE_SEARCH_LABEL,
  SITE_SEARCH_PLACEHOLDER,
} from "@/lib/site-search-labels";
import type { SearchResponse, SiteHit, SiteHitKind } from "@/lib/site-search-types";
import { SITE_HIT_SECTIONS } from "@/lib/site-search-types";

// The search bar in the navbar, on every page.
//
// Asks /api/search on the server so the browser never downloads the cemetery
// or content databases. Empty focus lists every published vacation destination
// (editorial order). Typing searches the full public index with typo tolerance.
// AI answers never appear here — this is published White Glove content only.

type Suggestion = Pick<SiteHit, "id" | "kind" | "section" | "title" | "yiddish" | "subtitle" | "href" | "matchRank" | "fuzzy">;

type FooterAction = { id: string; label: string; href: string };

function recordSearch(value: string, found: number) {
  if (!value.trim()) return;
  void fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "search", value: value.trim(), found }),
    keepalive: true,
  });
}

function recordSelect(kind: string) {
  void fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "search_select", kind }),
    keepalive: true,
  });
}

function SearchGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

/** Highlight the query (or close prefix) inside a title/subtitle for a11y. */
function HighlightText({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q || q.length < 1) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const index = lower.indexOf(needle);
  if (index < 0) {
    const token = needle.split(/\s+/)[0];
    const ti = token.length >= 2 ? lower.indexOf(token) : -1;
    if (ti < 0) return <>{text}</>;
    return (
      <>
        {text.slice(0, ti)}
        <mark className="rounded-sm bg-[var(--gold-light)]/50 text-inherit">{text.slice(ti, ti + token.length)}</mark>
        {text.slice(ti + token.length)}
      </>
    );
  }
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-[var(--gold-light)]/50 text-inherit">{text.slice(index, index + needle.length)}</mark>
      {text.slice(index + needle.length)}
    </>
  );
}

type DisplayGroup = { key: string; heading: string; hits: Suggestion[] };

function groupSuggestions(matches: Suggestion[], emptyMode: boolean): DisplayGroup[] {
  if (emptyMode) {
    return matches.length ? [{ key: "Vacation", heading: sectionHeading("Vacation"), hits: matches }] : [];
  }

  const groups: DisplayGroup[] = [];
  for (const section of SITE_HIT_SECTIONS) {
    const sectionHits = matches.filter((m) => m.section === section);
    if (!sectionHits.length) continue;

    if (section === "Heritage") {
      const order: SiteHitKind[] = ["Kever or tzaddik", "Beis hachaim", "Heritage town"];
      for (const kind of order) {
        const hits = sectionHits.filter((h) => h.kind === kind);
        if (!hits.length) continue;
        groups.push({
          key: `${section}-${kind}`,
          heading: heritageKindHeading(kind) ?? sectionHeading(section),
          hits,
        });
      }
      const leftover = sectionHits.filter((h) => !order.includes(h.kind));
      if (leftover.length) {
        groups.push({ key: `${section}-other`, heading: sectionHeading(section), hits: leftover });
      }
      continue;
    }

    groups.push({ key: section, heading: sectionHeading(section), hits: sectionHits });
  }
  return groups;
}

export default function DestinationSearch({
  compact = false,
  placeholder = SITE_SEARCH_PLACEHOLDER || BUILT_IN_WORDS.searchPlaceholder,
  ariaLabel = SITE_SEARCH_LABEL,
  /** When true, start collapsed on narrow screens behind a labeled Search button. */
  mobileCollapse = false,
  autoFocus = false,
  id,
}: {
  compact?: boolean;
  placeholder?: string;
  /**
   * What this particular box is for.
   *
   * The header carries the site-wide one and is named for the whole site. A
   * page that offers a second box — the heritage landing page — must say what
   * THAT one searches.
   */
  ariaLabel?: string;
  mobileCollapse?: boolean;
  /** Ignored: heading and note are no longer shown on this control. */
  showChrome?: boolean;
  autoFocus?: boolean;
  id?: string;
}) {
  const router = useRouter();
  const listId = `${useId()}-search-results`;
  const inputId = id ?? listId.replace("-search-results", "-input");
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<{ query: string; response: SearchResponse } | null>(null);
  const [emptyHits, setEmptyHits] = useState<Suggestion[] | null>(null);
  const [active, setActive] = useState(-1);
  const [mobileOpen, setMobileOpen] = useState(!mobileCollapse);
  const blurTimer = useRef<number | undefined>(undefined);

  const trimmed = query.trim();
  const searching = Boolean(trimmed) && hits?.query !== trimmed;
  const response = trimmed ? (hits?.query === trimmed ? hits.response : null) : null;
  const matches: Suggestion[] = useMemo(() => {
    if (!trimmed) return emptyHits ?? [];
    return response?.results ?? [];
  }, [trimmed, emptyHits, response]);

  const emptyMode = !trimmed;
  const groups = useMemo(() => groupSuggestions(matches, emptyMode), [matches, emptyMode]);
  const orderedMatches = useMemo(() => groups.flatMap((group) => group.hits), [groups]);

  const footer: FooterAction | null = useMemo(() => {
    if (emptyMode) {
      return { id: "footer-destinations", label: "View all vacation destinations", href: "/destinations" };
    }
    if (!trimmed || searching) return null;
    return {
      id: "footer-all",
      label: `See all results for “${trimmed}”`,
      href: `/search?q=${encodeURIComponent(trimmed)}`,
    };
  }, [emptyMode, trimmed, searching]);

  const navItems = useMemo(() => {
    const items: Array<{ type: "hit"; hit: Suggestion } | { type: "footer"; action: FooterAction }> = orderedMatches.map((hit) => ({
      type: "hit" as const,
      hit,
    }));
    if (footer) items.push({ type: "footer", action: footer });
    return items;
  }, [orderedMatches, footer]);

  useEffect(() => {
    if (!open || trimmed || emptyHits) return;
    const controller = new AbortController();
    fetch("/api/search?limit=50", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: SearchResponse | null) => {
        if (payload?.mode === "empty") setEmptyHits(payload.results);
      })
      .catch(() => {
        if (!controller.signal.aborted) setEmptyHits([]);
      });
    return () => controller.abort();
  }, [open, trimmed, emptyHits]);

  useEffect(() => {
    if (!trimmed) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}&limit=24`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { results: [], query: trimmed, heritageIntent: false, mode: "search" as const }))
        .then((payload: SearchResponse) => setHits({ query: trimmed, response: payload }))
        .catch(() => {
          if (!controller.signal.aborted) {
            setHits({
              query: trimmed,
              response: { results: [], query: trimmed, heritageIntent: false, mode: "search" },
            });
          }
        });
    }, 160);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  useEffect(() => {
    if (autoFocus || (mobileCollapse && mobileOpen)) {
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [autoFocus, mobileCollapse, mobileOpen]);

  function go(hit: Suggestion) {
    recordSearch(query, orderedMatches.length);
    recordSelect(hit.kind);
    router.push(hit.href);
    setOpen(false);
  }

  function goFooter(action: FooterAction) {
    if (trimmed) recordSearch(query, orderedMatches.length);
    router.push(action.href);
    setOpen(false);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searching) {
      if (trimmed) {
        recordSearch(query, 0);
        router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      }
      setOpen(false);
      return;
    }

    if (active >= 0 && active < navItems.length) {
      const item = navItems[active];
      if (item.type === "footer") goFooter(item.action);
      else go(item.hit);
      return;
    }

    if (!trimmed) {
      if (footer) goFooter(footer);
      return;
    }

    recordSearch(query, orderedMatches.length);
    if (orderedMatches.length === 1 && (orderedMatches[0].matchRank ?? 99) <= 1) {
      recordSelect(orderedMatches[0].kind);
      router.push(orderedMatches[0].href);
    } else {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      if (mobileCollapse && mobileOpen) setMobileOpen(false);
      return;
    }
    if (!open || navItems.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % navItems.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i <= 0 ? navItems.length - 1 : i - 1));
    }
  }

  const hitIndexById = useMemo(() => new Map(orderedMatches.map((hit, index) => [hit.id, index])), [orderedMatches]);
  const footerIndex = orderedMatches.length;

  if (mobileCollapse && !mobileOpen) {
    return (
      <div className="w-full md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label={ariaLabel}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--gold)] bg-[#FAF8F3] px-4 text-sm font-semibold text-[var(--navy)] shadow-[0_8px_20px_rgba(16, 47, 53,.06)] transition hover:bg-[var(--cream-deep)]"
        >
          <SearchGlyph className="h-4 w-4 text-[var(--gold-ink)]" />
          <span>Search</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className={`relative ${compact ? "w-full max-w-full" : "mt-12 max-w-3xl"} ${mobileCollapse ? "md:block" : ""}`}
      data-site-search=""
    >
      <label htmlFor={inputId} className="sr-only">
        {ariaLabel}
      </label>

      <form
        className={`flex max-w-full flex-col gap-2 rounded-2xl border border-[var(--navy)]/15 bg-white shadow-[0_12px_30px_rgba(16, 47, 53,.08)] sm:flex-row ${compact ? "p-2" : "p-3"}`}
        onSubmit={submitSearch}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
          <SearchGlyph className="ml-1 h-4 w-4 shrink-0 text-[var(--gold-ink)]" />
          <input
            ref={inputRef}
            id={inputId}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(-1);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              blurTimer.current = window.setTimeout(() => setOpen(false), 150);
            }}
            onKeyDown={onKeyDown}
            className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-stone-400 ${compact ? "min-h-11 py-2 text-sm" : "min-h-11 py-3"}`}
            aria-label={ariaLabel}
            aria-expanded={open}
            aria-autocomplete="list"
            role="combobox"
            aria-controls={listId}
            aria-activedescendant={active >= 0 ? `${listId}-opt-${active}` : undefined}
            placeholder={placeholder}
            autoComplete="off"
          />
        </div>
        {/* Stacked on a phone, so the submit button spans the box rather than
            sitting as a stub under a full-width field. Side by side from sm. */}
        <div className="flex gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">
          {mobileCollapse ? (
            <button
              type="button"
              className="min-h-11 rounded-xl border border-[var(--gold-light)] px-3 text-sm font-semibold text-stone-600 transition hover:bg-[var(--cream-deep)] md:hidden"
              onClick={() => setMobileOpen(false)}
            >
              Close
            </button>
          ) : null}
          <button
            className={`rounded-xl bg-[var(--navy)] text-sm font-bold uppercase tracking-[0.13em] text-white transition hover:bg-[var(--gold)] ${compact ? "min-h-11 px-4 py-2 text-xs" : "min-h-11 px-7 py-3"}`}
            type="submit"
          >
            Search
          </button>
        </div>
      </form>

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-20 mt-2 max-h-[min(28rem,70vh)] w-full max-w-full overflow-x-hidden overflow-y-auto rounded-2xl border border-[var(--gold-light)] bg-[#FAF8F3] shadow-xl"
        >
          {response?.interpretedAs && trimmed && !searching ? (
            <p className="border-b border-[var(--gold-light)] px-5 py-2 text-xs text-stone-500">
              Showing matches for <span className="font-semibold text-[var(--navy)]">{response.interpretedAs}</span>
            </p>
          ) : null}

          {searching ? (
            <p className="px-5 py-4 text-sm text-stone-600">Searching…</p>
          ) : matches.length > 0 ? (
            <>
              {groups.map((group) => (
                <div key={group.key} role="group" aria-label={group.heading}>
                  <p className="sticky top-0 border-b border-[var(--gold-light)] bg-[#D5CEC3] px-5 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">
                    {group.heading}
                  </p>
                  {group.hits.map((match) => {
                    const optionIndex = hitIndexById.get(match.id) ?? 0;
                    return (
                      <button
                        key={match.id}
                        id={`${listId}-opt-${optionIndex}`}
                        type="button"
                        role="option"
                        aria-selected={optionIndex === active}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          window.clearTimeout(blurTimer.current);
                        }}
                        onMouseEnter={() => setActive(optionIndex)}
                        onClick={() => go(match)}
                        className={`flex w-full max-w-full items-center justify-between gap-3 border-b border-[var(--gold-light)] px-5 py-3.5 text-left transition hover:bg-[var(--cream-deep)] sm:gap-5 sm:py-4 ${optionIndex === active ? "bg-[var(--cream-deep)]" : ""}`}
                      >
                        <div className="min-w-0">
                          {match.yiddish ? (
                            <BilingualLabel
                              primary={match.yiddish}
                              secondary={match.title}
                              primaryClassName="text-2xl sm:text-3xl"
                              secondaryClassName="text-base"
                              compact
                            />
                          ) : (
                            <p className="truncate text-base font-semibold text-[var(--navy)]">
                              <HighlightText text={match.title} query={trimmed} />
                            </p>
                          )}
                          <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-stone-600">
                            <HighlightText text={match.subtitle} query={trimmed} />
                          </p>
                        </div>
                        <span className="shrink-0 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gold-ink)] sm:text-xs sm:tracking-[0.12em]">
                          {kindLabel(match.kind)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </>
          ) : (
            <p className="px-5 py-4 text-sm text-stone-600">
              {trimmed
                ? "No published match yet. Press Enter for the full results page, or try another spelling or a broader idea."
                : emptyHits === null
                  ? "Loading destinations…"
                  : "No vacation destinations to show yet."}
            </p>
          )}

          {footer && !searching ? (
            <button
              id={`${listId}-opt-${footerIndex}`}
              type="button"
              role="option"
              aria-selected={active === footerIndex}
              onMouseDown={(event) => {
                event.preventDefault();
                window.clearTimeout(blurTimer.current);
              }}
              onMouseEnter={() => setActive(footerIndex)}
              onClick={() => goFooter(footer)}
              className={`w-full border-t border-[var(--gold-light)] px-5 py-3.5 text-left text-sm font-semibold text-[var(--navy)] transition hover:bg-[var(--cream-deep)] ${active === footerIndex ? "bg-[var(--cream-deep)]" : ""}`}
            >
              {footer.label} →
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
