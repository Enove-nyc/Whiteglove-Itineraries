"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { normalize } from "@/lib/place-search";

type Dest = {
  slug: string;
  city: string;
  yiddishCity: string;
  country: string;
  _count: { places: number; contacts: number };
};

export default function DestinationPicker({
  destinations,
  selectedSlug,
}: {
  destinations: Dest[];
  selectedSlug?: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    // Folded, not just lowercased. "Krakow" has to find Kraków and "Lezajsk"
    // has to find Leżajsk — nobody types the accent, and a picker that only
    // answers to the accented spelling is a picker you cannot find the town in.
    // Hebrew survives the folding, so the Yiddish name still matches.
    const q = normalize(query);
    if (!q) return destinations;
    return destinations.filter((d) =>
      normalize(`${d.city} ${d.yiddishCity} ${d.country} ${d.slug}`).includes(q),
    );
  }, [query, destinations]);

  return (
    <div className="border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
      <label htmlFor="dest-search" className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">
        Find a destination
      </label>
      <input
        id="dest-search"
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search city, country…"
        className="mt-3 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] transition focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]"
      />
      <p className="mt-3 text-xs text-stone-500">
        Destinations
      </p>
      <div className="mt-3 max-h-[60vh] space-y-1 overflow-y-auto pr-1">
        {filtered.map((d) => {
          const active = d.slug === selectedSlug;
          const count = d._count.places + d._count.contacts;
          return (
            <Link
              key={d.slug}
              href={`/admin/destinations?slug=${encodeURIComponent(d.slug)}`}
              className={`block rounded-md border px-3 py-2.5 text-sm transition ${
                active
                  ? "border-[var(--navy)] bg-[var(--navy)] text-white"
                  : "border-transparent text-[var(--navy)] hover:bg-[var(--cream-deep)]"
              }`}
            >
              <span className="font-semibold">{d.city}</span>
              <span className={`ml-2 text-xs ${active ? "text-white/70" : "text-stone-500"}`}>{d.country}</span>
              {count > 0 && (
                <span className={`ml-2 text-xs ${active ? "text-white/70" : "text-[var(--gold-ink)]"}`}>
                </span>
              )}
            </Link>
          );
        })}
        {filtered.length === 0 && <p className="px-3 py-4 text-sm text-stone-500">No matches.</p>}
      </div>
    </div>
  );
}
