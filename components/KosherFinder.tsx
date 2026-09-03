"use client";

import { useState } from "react";
import KosherNearby from "@/components/KosherNearby";

// Full kosher food finder: search White Glove's curated listings by a place,
// type of food, or listing name. It never expands the directory from an
// external map or business database.
export default function KosherFinder({ showAddToTrip = true }: { showAddToTrip?: boolean }) {
  const [query, setQuery] = useState("");

  return (
    <div>
      <p className="mb-4 border-l-4 border-[var(--gold)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-stone-600">
        Search White Glove&apos;s curated kosher restaurants, bakeries and groceries by city, country or name. Confirm
        current supervision directly before you go.
      </p>
      <div className="wg-card border border-[var(--gold-light)] bg-[#FAF8F3] p-6">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">Search White Glove listings</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="London, bakery, Miami Beach, restaurant…"
            className="mt-1 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2 text-sm text-[var(--navy)] shadow-sm focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]"
          />
        </label>
      </div>

      <div className="mt-5">
        {query.trim() ? (
          <KosherNearby
            query={query}
            limit={40}
            showAddToTrip={showAddToTrip}
            heading={`Kosher food matching “${query.trim()}”`}
          />
        ) : (
          <p className="border border-dashed border-[var(--gold-light)] p-8 text-center text-sm text-stone-500">
            Search the curated kosher food finder by city, country or listing name.
          </p>
        )}
      </div>
    </div>
  );
}
