"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useOnValueChange } from "@/components/useOnValueChange";
import { anchoredStyle, measureAnchor, useAnchorTracking, type AnchorBox } from "@/lib/anchored-panel";

// Real-address autocomplete backed by Photon (OpenStreetMap) — free, no API
// key. As the user types, a dropdown of real addresses appears; picking one
// fills the address string and its coordinates. Runs entirely in the browser.

type Suggestion = { label: string; coordinates: string };

type PhotonFeature = {
  properties?: { name?: string; street?: string; housenumber?: string; city?: string; town?: string; village?: string; state?: string; country?: string; postcode?: string; type?: string; osm_key?: string };
  geometry?: { coordinates?: [number, number] };
};

const CITY_TYPES = new Set(["city", "town", "village", "municipality", "locality", "district", "region", "state", "county", "country"]);

function toSuggestion(feature: PhotonFeature, mode: "address" | "city"): Suggestion | null {
  const p = feature.properties ?? {};
  const coords = feature.geometry?.coordinates;
  const coordinates = coords ? `${coords[1].toFixed(6)}, ${coords[0].toFixed(6)}` : "";

  if (mode === "city") {
    // Only real places (cities/towns), not streets or house numbers.
    const isPlace = p.osm_key === "place" || (p.type ? CITY_TYPES.has(p.type) : false);
    if (!isPlace || !p.name) return null;
    const label = [p.name, p.state, p.country].filter(Boolean).join(", ");
    return { label, coordinates };
  }

  const main = p.name || [p.housenumber, p.street].filter(Boolean).join(" ");
  const parts = [main, p.city || p.town || p.village, p.state, p.country].filter(Boolean);
  const label = parts.join(", ");
  if (!label) return null;
  return { label, coordinates };
}

export default function AddressAutocomplete({
  value = "",
  onChange,
  placeholder,
  className,
  name,
  mode = "address",
  required = false,
}: {
  value?: string;
  onChange?: (address: string, coordinates?: string) => void;
  placeholder?: string;
  className?: string;
  name?: string; // when used inside a plain <form> (server action), submits by this name
  mode?: "address" | "city";
  /** Passed straight to the input, so a starred label is actually enforced. */
  required?: boolean;
}) {
  const [query, setQuery] = useState(value);
  /**
   * The suggestions, kept with the query they answer.
   *
   * Clearing them at the top of the effect was the setState the lint rule
   * refuses, and moving that clear behind the 280ms debounce would have left
   * suggestions for a deleted query sitting under whatever was typed next.
   * Holding the query alongside its own answer settles both: the list below is
   * derived during render and can only ever show rows that answer what is in
   * the box right now.
   */
  const [answered, setAnswered] = useState<{ query: string; rows: Suggestion[] }>({ query: "", rows: [] });
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // Drawn against the viewport rather than inside the field, because the
  // booking card hides its overflow and clipped this list. See
  // lib/anchored-panel.ts.
  const [anchor, setAnchor] = useState<AnchorBox | null>(null);
  // preferBelow: a short Photon list must stay under the field. The calendar
  // flips when its full height will not fit; doing that here parked six city
  // rows near the top of /book instead of under Destination.
  const remeasure = useCallback(() => setAnchor(measureAnchor(boxRef.current, 288, { preferBelow: true })), []);
  useAnchorTracking(open, remeasure);

  const q = query.trim();
  const tooShort = q.length < 3;
  // Shown only when they answer what is in the box right now, so suggestions
  // for a previous query cannot appear under a new one even for a frame.
  const results = !tooShort && answered.query === q ? answered.rows : [];

  // Results arrive after a debounce. Remeasure once they land so the panel
  // tracks the field after any scroll-into-view the focus caused.
  useEffect(() => {
    if (open && results.length > 0) remeasure();
  }, [open, results.length, remeasure]);

  // Sync when the value is set from outside (e.g. prefilled by the kever
  // picker). During render, not after it: as an effect the field showed the
  // old text for one paint after it had already been filled in.
  useOnValueChange(value, () => setQuery(value));

  useEffect(() => {
    // The short-query case has no effect to run at all now — it is answered by
    // `results` above, so nothing here happens synchronously.
    if (tooShort) return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const layer = mode === "city" ? "&layer=city&layer=district&layer=locality&layer=county&layer=state" : "";
        const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8${layer}`);
        const data = (await res.json()) as { features?: PhotonFeature[] };
        if (!active) return;
        const mapped = (data.features ?? []).map((f) => toSuggestion(f, mode)).filter((s): s is Suggestion => s !== null);
        // De-duplicate identical labels (Photon can repeat).
        const seen = new Set<string>();
        setAnswered({ query: q, rows: mapped.filter((s) => (seen.has(s.label) ? false : (seen.add(s.label), true))).slice(0, 6) });
      } catch {
        if (active) setAnswered({ query: q, rows: [] });
      }
    }, 280);
    return () => { active = false; clearTimeout(timer); };
  }, [q, tooShort, mode]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <input
        name={name}
        value={query}
        onChange={(e) => { setQuery(e.target.value); onChange?.(e.target.value); remeasure(); setOpen(true); }}
        onFocus={() => { remeasure(); setOpen(true); }}
        placeholder={placeholder || "Start typing an address…"}
        autoComplete="off"
        required={required}
        className={className}
      />
      {open && results.length > 0 && (
        <ul style={{ ...anchoredStyle(anchor), width: anchor?.width }} className="z-[var(--wg-z-popover)] border border-[var(--gold)] bg-[#fcfaf6] shadow-[0_16px_36px_rgba(23,45,82,.14)]">
          {results.map((s, i) => (
            <li key={`${s.label}-${i}`}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setQuery(s.label); onChange?.(s.label, s.coordinates); setOpen(false); }}
                className="block w-full px-3 py-2 text-left text-sm font-normal normal-case tracking-normal text-stone-700 transition hover:bg-[var(--cream-deep)] hover:text-[var(--navy)]"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
