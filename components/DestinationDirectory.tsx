"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  countriesIn,
  filterDirectory,
  lettersIn,
  NO_FILTERS,
  type DirectoryEntry,
  type DirectoryFilters,
} from "@/lib/directory-browse";
import { TRUST_LEVELS } from "@/lib/trust-status";

/**
 * "Being checked", from the one place the site keeps that wording.
 *
 * A record with no researched guide behind it is in exactly the state the
 * shared scale calls Being checked, and this filter was saying so in its own
 * words before that scale existed. Read rather than repeated, so the directory
 * and every badge on the site cannot drift apart.
 */
const BEING_CHECKED = TRUST_LEVELS["being-checked"].label;

/**
 * The destination directory: 297 records, filtered, and shown a page at a
 * time.
 *
 * It used to render every card at once. "297 destinations available" is
 * impressive and unusable — nothing to narrow it with, and a wall of cards
 * that costs a phone real time to lay out.
 *
 * The search box and the filters are one thing here. The old page had two
 * modes, browsing and results, so choosing a country and then typing threw
 * the country away.
 */

const PAGE = 24;

const KINDS: Array<{ value: DirectoryFilters["kind"]; label: string }> = [
  { value: "", label: "Everything" },
  { value: "guide", label: "Full guides" },
  { value: "cemetery", label: "Batei hachaim" },
  { value: "destination", label: BEING_CHECKED },
];

const NEEDS: Array<{ value: keyof DirectoryEntry["f"]; label: string }> = [
  { value: "kosher", label: "Kosher food" },
  { value: "mikvah", label: "Mikvah" },
  { value: "stay", label: "Somewhere to stay" },
  { value: "contact", label: "Local contact" },
];

const chip = "inline-flex min-h-11 items-center rounded-full border px-4 text-xs font-bold uppercase tracking-[0.1em] transition";
const chipOff = `${chip} border-[var(--gold-light)] text-stone-600 hover:border-[var(--gold)] hover:text-[var(--navy)]`;
const chipOn = `${chip} border-[var(--navy)] bg-[var(--navy)] text-white`;

const KIND_LABEL: Record<DirectoryEntry["k"], string> = {
  guide: "Full guide",
  cemetery: "Beis hachaim",
  destination: BEING_CHECKED,
};

export default function DestinationDirectory({ entries, initialQuery = "" }: { entries: DirectoryEntry[]; initialQuery?: string }) {
  const [filters, setFilters] = useState<DirectoryFilters>({ ...NO_FILTERS, query: initialQuery });
  const [shown, setShown] = useState(PAGE);

  const countries = useMemo(() => countriesIn(entries), [entries]);
  const letters = useMemo(() => lettersIn(entries), [entries]);
  const results = useMemo(() => filterDirectory(entries, filters), [entries, filters]);

  /**
   * How many records could ever answer each filter.
   *
   * A chip that can only return nothing is worse than no chip: somebody taps
   * "Mikvah", gets an empty page, and concludes the site has no mikvaos
   * anywhere rather than that we have not published them yet. So the count is
   * on the chip, and at zero it is disabled and says why.
   */
  const available = useMemo(() => ({
    kosher: entries.filter((e) => e.f.kosher).length,
    mikvah: entries.filter((e) => e.f.mikvah).length,
    stay: entries.filter((e) => e.f.stay).length,
    contact: entries.filter((e) => e.f.contact).length,
    checked: entries.filter((e) => e.v > 0).length,
  }), [entries]);

  // Any change to the filters starts the list again — leaving somebody 200
  // cards deep into a list they have just replaced is disorienting.
  const set = (patch: Partial<DirectoryFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setShown(PAGE);
  };

  const toggleNeed = (need: keyof DirectoryEntry["f"]) =>
    set({ needs: filters.needs.includes(need) ? filters.needs.filter((n) => n !== need) : [...filters.needs, need] });

  const active =
    filters.country || filters.kind || filters.verifiedOnly || filters.needs.length > 0 || filters.letter || filters.query;

  return (
    <div>
      <div className="rounded-2xl border border-[var(--gold-light)] bg-[#FAF8F3] p-5 sm:p-6">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">Search the directory</span>
          <input
            type="search"
            value={filters.query}
            onChange={(event) => set({ query: event.target.value })}
            placeholder="Town, tzaddik, country — Sanz, Kraków, קאָװנע…"
            className="mt-2 min-h-11 w-full rounded-xl border border-[var(--gold-light)] bg-white px-4 py-3 text-base text-[var(--navy)] outline-none focus:border-[var(--gold)]"
          />
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          {KINDS.map((kind) => (
            <button key={kind.label} type="button" onClick={() => set({ kind: kind.value })} aria-pressed={filters.kind === kind.value} className={filters.kind === kind.value ? chipOn : chipOff}>
              {kind.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => set({ verifiedOnly: !filters.verifiedOnly })}
            aria-pressed={filters.verifiedOnly}
            disabled={available.checked === 0}
            className={`${filters.verifiedOnly ? chipOn : chipOff} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <span aria-hidden="true" className="mr-1.5">{filters.verifiedOnly ? "✓" : "○"}</span>
            Verified details
          </button>
          {NEEDS.map((need) => {
            const on = filters.needs.includes(need.value);
            const count = available[need.value];
            return (
              <button
                key={need.value}
                type="button"
                onClick={() => toggleNeed(need.value)}
                aria-pressed={on}
                disabled={count === 0}
                title={count === 0 ? `No ${need.label.toLowerCase()} listed.` : undefined}
                className={`${on ? chipOn : chipOff} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <span aria-hidden="true" className="mr-1.5">{on ? "✓" : "○"}</span>
                {need.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]">
            Country
            <select value={filters.country} onChange={(event) => set({ country: event.target.value })} className="mt-1.5 block min-h-11 w-full min-w-52 rounded-xl border border-[var(--gold-light)] bg-white px-3 text-sm font-normal normal-case tracking-normal text-[var(--navy)]">
              <option value="">Everywhere</option>
              {countries.map((country) => <option key={country.value} value={country.value}>{country.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]">
            Order
            <select value={filters.sort} onChange={(event) => set({ sort: event.target.value as DirectoryFilters["sort"] })} className="mt-1.5 block min-h-11 w-full min-w-52 rounded-xl border border-[var(--gold-light)] bg-white px-3 text-sm font-normal normal-case tracking-normal text-[var(--navy)]">
              <option value="az">A to Z</option>
              <option value="country">By country</option>
              <option value="kevarim">Most kevarim first</option>
              <option value="checked">Most complete first</option>
            </select>
          </label>
        </div>

        {/* A–Z. Only letters that have something behind them, so nobody taps
            one and lands on an empty list. */}
        <div className="mt-4 flex flex-wrap gap-1">
          <button type="button" onClick={() => set({ letter: "" })} aria-pressed={!filters.letter} className={`flex h-11 min-w-11 items-center justify-center rounded-md px-2 text-xs font-bold transition ${!filters.letter ? "bg-[var(--navy)] text-white" : "text-stone-600 hover:bg-[var(--cream-deep)]"}`}>
            All
          </button>
          {letters.map((letter) => (
            <button key={letter} type="button" onClick={() => set({ letter: filters.letter === letter ? "" : letter })} aria-pressed={filters.letter === letter} className={`flex h-11 w-11 items-center justify-center rounded-md text-sm font-bold transition ${filters.letter === letter ? "bg-[var(--navy)] text-white" : "text-stone-600 hover:bg-[var(--cream-deep)]"}`}>
              {letter}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--gold-light)] pt-4">
          <p className="text-sm text-stone-600" role="status">
            {results.length === entries.length ? "All places" : "Filtered places"}
          </p>
          {active ? (
            <button type="button" onClick={() => { setFilters({ ...NO_FILTERS }); setShown(PAGE); }} className="inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4">
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {results.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-[var(--gold-light)] p-10 text-center">
          <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Nothing matches all of that.</p>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Try removing a filter — asking for
            kosher food and a mikvah together narrows it quickly.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {results.slice(0, shown).map((entry) => (
              <Link key={`${entry.k}-${entry.s}`} href={entry.h} className="flex min-w-0 flex-col rounded-2xl border border-[var(--gold-light)] bg-[#FAF8F3] p-5 transition hover:border-[var(--gold)] hover:shadow-md sm:p-7">
                <p className="break-words text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">{entry.c} · {KIND_LABEL[entry.k]}</p>
                <h3 dir="rtl" lang="yi" className="mt-3 font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--navy)] [overflow-wrap:anywhere]">{entry.y}</h3>
                <p className="mt-2 font-[family-name:var(--font-display)] text-xl text-stone-500">{entry.n}</p>
                {entry.b > 0 && <p className="mt-3 text-sm leading-6 text-stone-600">{entry.b} known {entry.b === 1 ? "kever" : "kevarim"} listed</p>}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {entry.v === 2 && <span className="rounded-full border border-emerald-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-800">✓ Checked</span>}
                  {entry.v === 1 && <span className="rounded-full border border-[var(--gold)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--navy)]">◐ Partly checked</span>}
                  {entry.f.kosher && <span className="rounded-full border border-[var(--gold-light)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-stone-600">Kosher food</span>}
                  {entry.f.mikvah && <span className="rounded-full border border-[var(--gold-light)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-stone-600">Mikvah</span>}
                  {entry.f.stay && <span className="rounded-full border border-[var(--gold-light)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-stone-600">Stay</span>}
                </div>
                <span className="mt-auto pt-6 text-xs font-bold uppercase tracking-[0.14em] text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4">Open →</span>
              </Link>
            ))}
          </div>

          {shown < results.length && (
            <div className="mt-8 text-center">
              <button type="button" onClick={() => setShown((current) => current + PAGE)} className="inline-flex min-h-12 items-center rounded-full border border-[var(--navy)] bg-[var(--navy)] px-8 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]">
                Show more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
