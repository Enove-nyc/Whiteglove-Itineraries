"use client";

import Link from "next/link";
import { useState } from "react";

type Audience = "clients" | "own";
const COPY: Record<Audience, { heading: string; body: string }> = {
  clients: {
    heading: "A new way to plan and manage client trips.",
    body: "Bring your itinerary, your client’s travel app and the work between them into one connected experience.",
  },
  own: {
    heading: "A more connected way to plan your own trip.",
    body: "Keep your flights, accommodation, documents and day-by-day plans together, ready to use on your phone.",
  },
};

const CTA = "inline-flex min-h-11 items-center justify-center rounded-full px-6 py-3 text-sm font-semibold";

export default function HomeAudience() {
  const [who, setWho] = useState<Audience>("clients");
  const copy = COPY[who];
  return (
    <>
      <fieldset className="mt-7">
        <legend className="sr-only">Who are you planning for?</legend>
        <div className="mx-auto inline-flex flex-wrap justify-center gap-1 rounded-full border border-[var(--header-border)] p-1">
          {([["clients", "Planning trips for clients"], ["own", "Planning my own trip"]] as const).map(([value, label]) => (
            <label key={value} className={`inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-sm font-semibold focus-within:ring-2 focus-within:ring-[var(--gold-ink)] ${who === value ? "bg-[var(--header-ink)] text-white" : "text-[var(--header-muted)]"}`}>
              <input type="radio" name="audience" value={value} checked={who === value} onChange={() => setWho(value)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <h1 className="mt-7 font-[family-name:var(--font-display)] text-4xl leading-tight sm:text-6xl">{copy.heading}</h1>
      <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-[var(--header-muted)] sm:text-lg">{copy.body}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/sample-itinerary" className={`${CTA} bg-[var(--header-ink)] text-white`}>Explore a sample itinerary</Link>
        <Link href="/about" className={`${CTA} border border-[var(--header-border)] text-[var(--header-ink)]`}>Explore the platform</Link>
      </div>
    </>
  );
}

