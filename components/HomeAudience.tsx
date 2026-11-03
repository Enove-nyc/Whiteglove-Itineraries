"use client";

import Link from "next/link";
import { useState } from "react";

type Audience = "clients" | "own";
const COPY: Record<Audience, { heading: string; body: string }> = {
  clients: {
    heading: "A new way to plan and manage client trips.",
    body: "We are building tools to bring an adviser’s itinerary, their client’s travel app and the work between them into one connected experience.",
  },
  own: {
    heading: "A more connected way to plan your own trip.",
    body: "We are developing a place for your flights, accommodation, documents and day-by-day plans, with the goal of keeping the whole trip together on your phone.",
  },
};

export default function HomeAudience() {
  const [who, setWho] = useState<Audience>("clients");
  const copy = COPY[who];
  return (
    <>
      <fieldset className="mt-7">
        <legend className="sr-only">Who are you planning for?</legend>
        <div className="mx-auto inline-flex flex-wrap justify-center gap-1 rounded-full border border-white/30 p-1">
          {([["clients", "Planning trips for clients"], ["own", "Planning my own trip"]] as const).map(([value, label]) => (
            <label key={value} className={`inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-sm font-semibold focus-within:ring-2 focus-within:ring-white ${who === value ? "bg-white text-[var(--navy)]" : "text-[#e0e7e7]"}`}>
              <input type="radio" name="audience" value={value} checked={who === value} onChange={() => setWho(value)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <h1 className="mt-7 font-[family-name:var(--font-display)] text-4xl leading-tight sm:text-6xl">{copy.heading}</h1>
      <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-[#e0e7e7] sm:text-lg">{copy.body}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/sample-itinerary" className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-[var(--navy)]">Explore a sample itinerary</Link>
        <Link href="/about" className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/50 px-6 py-3 text-sm font-semibold text-white">What we are building</Link>
      </div>
    </>
  );
}
