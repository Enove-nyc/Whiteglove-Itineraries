"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useOnValueChange } from "@/components/useOnValueChange";
import { anchoredStyle, measureAnchor, useAnchorTracking, type AnchorBox } from "@/lib/anchored-panel";
import { AIRPORTS, type Airport } from "@/data/airports";
import { foldAccents, metroMatches } from "@/lib/flight-endpoint";
import { searchTermFor } from "@/lib/kayak-search";
import { type AddedAirport, type AddedMetro, mergeAirports, mergeMetros } from "@/lib/airport-admin";

/**
 * The airports the owner added, fetched once and shared by every picker.
 *
 * ONE REQUEST FOR THE WHOLE PAGE, not one per box — a multi-city form has six
 * of these. Kept at module level because the answer is the same for all of
 * them and does not change while somebody is typing.
 *
 * THE BUILT-IN LIST IS NEVER WAITED FOR. It is already in the bundle and
 * answers the instant somebody types; this only ever adds to it. If the
 * request fails the box keeps working with the hundred it shipped with, which
 * is the right way for this to fail.
 */
let extrasPromise: Promise<{ airports: AddedAirport[]; metros: AddedMetro[] }> | null = null;
function loadExtras() {
  extrasPromise ??= fetch("/api/airports")
    .then((r) => (r.ok ? r.json() : { airports: [], metros: [] }))
    .catch(() => ({ airports: [], metros: [] }));
  return extrasPromise;
}

// Airport picker for flight search. The dropdown only appears once the traveler
// types, sits directly under the box, and matches by city too — so "NYC" or
// "New York" surfaces every New York airport (JFK, EWR, LGA).
//
// A city served by several airports is offered FIRST, as one option covering
// all of them. That is nearly always the question being asked: somebody flying
// to London does not usually mind which of the five they land at, and picking
// Heathrow off the list hides whatever Gatwick was charging. The individual
// airports stay underneath for when it does matter.
export default function AirportAutocomplete({
  value,
  onChange,
  placeholder,
  className,
  required = false,
  allowGroups = true,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Passed straight to the input, so a starred label is actually enforced. */
  required?: boolean;
  /**
   * Offer a city as one option covering every airport in it — right for a
   * flight SEARCH ("flying to London" rarely cares which of five it lands
   * at), wrong for a stop on a CONFIRMED itinerary, which always lands at
   * one specific airport. Off in the itinerary builder; on everywhere else.
   */
  allowGroups?: boolean;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [extras, setExtras] = useState<{ airports: AddedAirport[]; metros: AddedMetro[] }>({ airports: [], metros: [] });
  const boxRef = useRef<HTMLDivElement>(null);
  // Drawn against the viewport rather than inside the field, because the
  // booking card hides its overflow and clipped this list. See
  // lib/anchored-panel.ts.
  const [anchor, setAnchor] = useState<AnchorBox | null>(null);
  // Same preferBelow as AddressAutocomplete — stay under the field whenever
  // there is a usable strip of room. See lib/anchored-panel.ts.
  const remeasure = useCallback(() => setAnchor(measureAnchor(boxRef.current, 320, { preferBelow: true })), []);
  useAnchorTracking(open, remeasure);

  // Written from the promise's own callback, not from the effect body.
  useEffect(() => {
    let alive = true;
    loadExtras().then((found) => { if (alive) setExtras(found); });
    return () => { alive = false; };
  }, []);

  // Sync when the value is set from outside (e.g. after a flight-number
  // lookup). During render, not after it: as an effect the field showed the
  // old code for one paint after it had already been filled in.
  useOnValueChange(value, () => setQuery(value));

  // ONCE SOMETHING IS PICKED, SEARCH ON ITS CODE. The box then holds the whole
  // label — "New York — all airports (NYC)" — which matches nothing, so the
  // list reopened empty and there was no way to choose a different airport
  // without deleting the text by hand. Picking one airport locked the field.
  // Folded, so "Kraków" finds the airport filed as "Krakow". See
  // lib/flight-endpoint.ts for what typing the correct spelling used to cost.
  const q = foldAccents(searchTermFor(query));
  // The built-in list with the owner's on top. Until the fetch lands `extras`
  // is empty, so this is exactly the built-in list and the box works at once.
  const all: Airport[] = extras.airports.length ? mergeAirports(extras.airports) : AIRPORTS;
  const cities = allowGroups && q.length >= 1 ? metroMatches(q, all, mergeMetros(extras.metros)) : [];
  const matches = q.length >= 1
    ? all.filter((a) => foldAccents(`${a.code} ${a.name} ${a.city} ${a.country} ${a.aliases.join(" ")}`).includes(q)).slice(0, 8)
    : [];

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  /**
   * Open the list and select what is in the box.
   *
   * The select happens AFTER the paint. Opening the list re-renders, and a
   * controlled input being handed the same value again drops any selection —
   * so selecting first is undone a moment later, and the next keystroke lands
   * wherever the caret happened to be. That is how somebody typing over a
   * pick got "New York — all ai|krak|rports (NYC)".
   */
  function openAndSelect(el: HTMLInputElement) {
    remeasure();
    setOpen(true);
    requestAnimationFrame(() => el.select());
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); remeasure(); setOpen(true); }}
        // ON CLICK AS WELL AS ON FOCUS. Picking from the list keeps the focus
        // in this input — the option's onMouseDown prevents default so the box
        // never blurs — so clicking back into it fires NO focus event at all.
        // With only onFocus the list stayed shut after a pick and the caret
        // landed mid-word, which is how "New York — all ai|krak|rports (NYC)"
        // happened.
        onFocus={(e) => openAndSelect(e.currentTarget)}
        onClick={(e) => openAndSelect(e.currentTarget)}
        placeholder={placeholder || "City or airport"}
        autoComplete="off"
        required={required}
        className={className}
      />
      {open && (cities.length > 0 || matches.length > 0) && (
        <ul style={{ ...anchoredStyle(anchor), width: anchor?.width }} className="z-[var(--wg-z-popover)] border border-[var(--gold)] bg-[#fcfaf6] shadow-[0_16px_36px_rgba(23,45,82,.14)]">
          {cities.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                // Written back WITH the code, the same shape as an airport
                // pick, so the value in the box says plainly what will be
                // searched and reads back as the same place.
                onMouseDown={(e) => { e.preventDefault(); const label = `${c.label} (${c.code})`; setQuery(label); onChange(label); setOpen(false); }}
                className="block w-full border-b border-[var(--gold-light)] bg-[var(--cream)] px-3 py-2 text-left text-sm font-normal normal-case tracking-normal text-stone-700 transition hover:bg-[var(--cream-deep)] hover:text-[var(--navy)]"
              >
                {c.label} <strong className="text-[var(--navy)]">({c.code})</strong>
                <span className="block text-xs text-stone-500">Searches {c.airports.join(", ")} together</span>
              </button>
            </li>
          ))}
          {matches.map((a) => (
            <li key={a.code}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); const label = `${a.city} (${a.code})`; setQuery(label); onChange(label); setOpen(false); }}
                className="block w-full px-3 py-2 text-left text-sm font-normal normal-case tracking-normal text-stone-700 transition hover:bg-[var(--cream-deep)] hover:text-[var(--navy)]"
              >
                {a.city} — {a.name} <strong className="text-[var(--navy)]">({a.code})</strong>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
