"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Who is reading this page, asked in one row of two.
 *
 * WHY IT NEEDED ASKING. The hero spoke to one of the two audiences and only
 * one: "The trip you plan, in your client's pocket", "One link per client".
 * Somebody planning a single trip of their own — which is a plan this product
 * sells, at a one-time fee — read a page about running clients and had to work
 * out for themselves that it was also for them. The other half of that page,
 * the free self-service doors, is several screens down.
 *
 * WHAT CHANGES AND WHAT DOES NOT. The headline, the sentence under it and the
 * first button change. The brand, the navigation, the colours and everything
 * below the hero do not — this is one product with two ways in, not two
 * products, and a page that repaints itself is a page somebody stops trusting.
 *
 * THE ADVISER IS THE DEFAULT, so the server renders that and a crawler is
 * given it. It is the larger audience and the one the pricing is built around;
 * the other is one press away rather than behind a guess about who arrived.
 */

type Audience = "clients" | "own";

const COPY: Record<Audience, { heading: string; body: string; primary: { href: string; label: string } }> = {
  clients: {
    heading: "The trip you plan, in your client's pocket.",
    body:
      "Build an itinerary a day at a time, then hand it over as an app on their phone — the days, the map, a travel wallet kept for when there is no signal, and a chat with you. One link per client.",
    primary: { href: "/itinerary", label: "Build a trip" },
  },
  own: {
    heading: "Your whole trip, on your phone, in order.",
    body:
      "Flights, hotels, transport and the days themselves in one place — with the map, the documents and the travel wallet kept for when there is no signal. One trip, one small fee, no subscription.",
    primary: { href: "/itinerary", label: "Start my trip" },
  },
};

const CTA = "inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition";

export default function HomeAudience() {
  const [who, setWho] = useState<Audience>("clients");
  const copy = COPY[who];

  return (
    <>
      {/* Radios, not buttons: this is one question with two answers and a
          screen reader should be told that, and told which is chosen. */}
      <fieldset className="mt-7">
        <legend className="sr-only">Who are you planning for?</legend>
        <div className="mx-auto inline-flex flex-wrap justify-center gap-1 rounded-full border border-white/25 p-1">
          {([
            ["clients", "Planning trips for clients"],
            ["own", "Planning my own trip"],
          ] as const).map(([value, label]) => (
            <label
              key={value}
              className={`inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-sm font-semibold transition ${
                who === value ? "bg-white text-[var(--navy)]" : "text-[#c9d3da] hover:text-white"
              }`}
            >
              <input
                type="radio"
                name="audience"
                value={value}
                checked={who === value}
                onChange={() => setWho(value)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <h1 className="mt-7 font-[family-name:var(--font-display)] text-4xl leading-tight sm:text-6xl">
        {copy.heading}
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-[#c9d3da] sm:text-lg">{copy.body}</p>

      {/* THE SECOND ACTION IS THE SAMPLE, not the app.
          Both of the old two asked a visitor to start using the product before
          they had seen what it produces: "Build a trip" opens an empty planner
          and "See the app" opened their own, which is empty too.
          /sample-itinerary is the finished document — a real week, rendered by
          the same component that prints a customer's trip — and it needs no
          account. It is the same evidence whichever audience is reading, so it
          does not change with the switch. */}
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <Link href={copy.primary.href} className={`${CTA} bg-white text-[var(--navy)] hover:bg-[var(--gold-light)]`}>
          {copy.primary.label}
        </Link>
        <Link href="/sample-itinerary" className={`${CTA} border border-white/40 text-white hover:bg-white/10`}>
          See a finished one
        </Link>
      </div>

      {/* WHICH OF THE TWO NEEDS AN ACCOUNT, SAID BEFORE THEY PRESS ONE.
          The planner is signed-in only, at the owner's word, so pressing the
          first button as a new visitor is a redirect to a login form —
          measured: /itinerary answers 307 to /login?next=%2Fitinerary. Nothing
          on this page said so, which makes a login form the first thing this
          product shows somebody who liked the headline.

          Nothing is being opened up here: the sentence is what was missing,
          not the gate. It also puts the weight on the right button — the
          sample is the one to look at first, and it opens straight away. */}
      <p className="mx-auto mt-5 max-w-lg text-sm leading-6 text-[#c9d3da]">
        The planner opens once you are signed in — it is free, and the account is what keeps a trip
        and puts it on your other devices. The finished one opens straight away, with no account.
      </p>
    </>
  );
}
