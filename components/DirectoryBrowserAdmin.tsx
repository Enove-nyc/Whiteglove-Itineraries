"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  countriesIn,
  filterDirectory,
  kindLabel,
  type DirectoryEntry,
  type DirectoryKind,
} from "@/lib/directory-index";

// One searchable list of everything in the directory.
//
// 260-odd entries, so it loads a page at a time rather than rendering the lot —
// a sidebar listing every town was the old shape and it was unusable.

const PAGE_SIZE = 25;

const KIND_TONE: Record<DirectoryKind, string> = {
  kever: "bg-[var(--cream-deep)] text-[var(--navy)]",
  town: "bg-sky-100 text-sky-900",
  business: "bg-emerald-100 text-emerald-900",
};

const inputClass =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-[#FAF8F3] px-3 py-2.5 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const captionClass = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";
const smallButton =
  "min-h-[36px] border border-[var(--gold-light)] px-3 text-[11px] font-bold uppercase leading-9 tracking-[0.1em] text-[var(--navy)] transition hover:border-[var(--gold)] hover:bg-[var(--cream-deep)]";

export default function DirectoryBrowserAdmin({ entries }: { entries: DirectoryEntry[] }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<DirectoryKind | "all">("all");
  const [country, setCountry] = useState<string | "all">("all");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);

  const countries = useMemo(() => countriesIn(entries), [entries]);
  const rows = useMemo(
    () => filterDirectory(entries, { query, kind, country, onlyMissing }),
    [entries, query, kind, country, onlyMissing],
  );

  // Changing a filter should start from the top of the new result set.
  const reset = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setShown(PAGE_SIZE);
  };

  const visible = rows.slice(0, shown);

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block lg:col-span-2">
          <span className={captionClass}>Search</span>
          <input
            value={query}
            onChange={(e) => reset(setQuery)(e.target.value)}
            placeholder="A town, a tzaddik, a country…"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={captionClass}>Kind</span>
          <select value={kind} onChange={(e) => reset(setKind)(e.target.value as DirectoryKind | "all")} className={inputClass}>
            <option value="all">Everything</option>
            <option value="kever">Batei hachaim</option>
            <option value="town">Towns</option>
            <option value="business">Businesses</option>
          </select>
        </label>
        <label className="block">
          <span className={captionClass}>Country</span>
          <select value={country} onChange={(e) => reset(setCountry)(e.target.value)} className={inputClass}>
            <option value="all">Anywhere</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(e) => reset(setOnlyMissing)(e.target.checked)}
            className="h-4 w-4 accent-[var(--navy)]"
          />
          Only ones missing something
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 border border-dashed border-[var(--gold-light)] p-8 text-center text-sm text-stone-600">
          Nothing matches that. Try a shorter search, or set the country back to Anywhere.
        </p>
      ) : (
        <>
          <ul className="mt-5 divide-y divide-[var(--gold-light)] border border-[var(--gold-light)] bg-[#FAF8F3]">
            {visible.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] ${KIND_TONE[entry.kind]}`}>
                      {kindLabel(entry.kind)}
                    </span>
                    <p className="font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--navy)]">
                      {entry.name}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-stone-500">
                    {entry.city}
                    {entry.country ? ` · ${entry.country}` : ""}
                  </p>
                  {entry.missing.length > 0 && (
                    <p className="mt-1 text-sm text-amber-800">Missing: {entry.missing.join(", ")}.</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Link href={entry.editHref} className={smallButton}>
                    Edit
                  </Link>
                  {entry.viewHref && (
                    <a href={entry.viewHref} target="_blank" rel="noreferrer" className={smallButton}>
                      View
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {shown < rows.length && (
            <div className="mt-5 text-center">
              <button type="button" onClick={() => setShown((n) => n + PAGE_SIZE)} className={smallButton}>
                Show {Math.min(PAGE_SIZE, rows.length - shown)} more
              </button>
              <p className="mt-2 text-xs text-stone-500">
                Showing {visible.length} of {rows.length}.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
