"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { adminHref, allAdminDestinations } from "@/lib/admin-nav";
import { canOpen, type AdminArea } from "@/lib/admin-permissions";
import type { AdminHit, AdminSearchResponse } from "@/lib/admin-search-types";
import { ADMIN_HIT_SECTIONS } from "@/lib/admin-search-types";

/**
 * Persistent admin search — listings, review candidates, and screens.
 * Not the public site search bar.
 */

function SearchGlyph() {
  return (
    <svg className="h-4 w-4 shrink-0 text-[var(--gold-ink)]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export default function AdminSearch({ areas, pathname }: { areas: AdminArea[] | null; pathname: string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [hits, setHits] = useState<{ query: string; response: AdminSearchResponse } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = "admin-search-results";
  const to = (href: string) => adminHref(href, pathname);

  const screens = useMemo(() => allAdminDestinations().filter((d) => canOpen(areas, d.href)), [areas]);
  const trimmed = query.trim();
  const searching = Boolean(trimmed) && hits?.query !== trimmed;

  const emptyMatches: AdminHit[] = useMemo(
    () =>
      screens.map((d) => ({
        id: `screen:${d.href}:${d.label}`,
        section: "Screens" as const,
        kind: d.section,
        title: d.label,
        subtitle: `${d.section} · ${d.blurb}`,
        href: d.href,
      })),
    [screens],
  );

  const results: AdminHit[] = trimmed ? (hits?.query === trimmed ? hits.response.results : []) : emptyMatches;

  const groups = useMemo(() => {
    return ADMIN_HIT_SECTIONS.map((section) => ({
      section,
      hits: results.filter((hit) => hit.section === section),
    })).filter((group) => group.hits.length > 0);
  }, [results]);

  const flat = useMemo(() => groups.flatMap((group) => group.hits), [groups]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, []);

  useEffect(() => {
    if (!trimmed) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/admin/search?q=${encodeURIComponent(trimmed)}&limit=24`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { query: trimmed, results: [] }))
        .then((payload: AdminSearchResponse) => setHits({ query: trimmed, response: payload }))
        .catch(() => {
          if (!controller.signal.aborted) setHits({ query: trimmed, response: { query: trimmed, results: [] } });
        });
    }, 160);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  function go(hit: AdminHit) {
    window.location.href = to(hit.href);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative ml-auto min-w-0 flex-1 sm:max-w-md">
      <div className="flex items-center gap-2 rounded-md border border-[var(--gold-light)] bg-white px-3 focus-within:border-[var(--gold)] focus-within:ring-2 focus-within:ring-[var(--gold-light)]">
        <SearchGlyph />
        <input
          ref={inputRef}
          type="search"
          value={query}
          aria-label="Search listings, candidates and admin screens"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-activedescendant={open && flat[active] ? `${listId}-opt-${active}` : undefined}
          role="combobox"
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (flat.length === 0) return;
              setActive((i) => Math.max(0, Math.min(flat.length - 1, e.key === "ArrowDown" ? i + 1 : i - 1)));
            } else if (e.key === "Enter" && flat[active]) {
              e.preventDefault();
              go(flat[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Find a page…"
          className="min-h-11 w-full bg-transparent py-2 text-sm text-[var(--navy)] outline-none placeholder:text-stone-400"
        />
      </div>
      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute right-0 top-full z-50 mt-1 w-[min(100vw-2rem,28rem)] border border-[var(--gold)] bg-[#FAF8F3] shadow-[0_18px_40px_rgba(16, 47, 53,.18)]"
        >
          {searching ? (
            <p className="px-3 py-3 text-sm text-stone-600">Searching…</p>
          ) : flat.length === 0 ? (
            <p className="px-3 py-3 text-sm text-stone-600">
              {trimmed ? "Nothing matches that." : "Type a page name. Press / from anywhere."}
            </p>
          ) : (
            <div className="max-h-80 overflow-auto">
              {groups.map((group) => (
                <div key={group.section} role="group" aria-label={group.section}>
                  <p className="sticky top-0 border-b border-[var(--gold-light)] bg-[#D5CEC3] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">
                    {group.section}
                  </p>
                  <ul>
                    {group.hits.map((hit) => {
                      const index = flat.indexOf(hit);
                      return (
                        <li key={hit.id}>
                          <Link
                            id={`${listId}-opt-${index}`}
                            href={to(hit.href)}
                            role="option"
                            aria-selected={index === active}
                            onMouseEnter={() => setActive(index)}
                            onClick={() => setOpen(false)}
                            className={`block px-3 py-2 ${index === active ? "bg-[var(--cream-deep)]" : ""}`}
                          >
                            <span className="block text-sm font-semibold text-[var(--navy)]">{hit.title}</span>
                            <span className="block text-xs text-stone-500">
                              {hit.kind} · {hit.subtitle}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
