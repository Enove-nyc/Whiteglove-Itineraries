"use client";

import { useEffect, useState } from "react";
import { moneyLabel } from "@/components/PartnerResultsPanel";

/**
 * Rental car prices on White Glove's own page.
 *
 * WHY THIS LOADS AFTER THE PAGE INSTEAD OF WITH IT. The company behind these
 * prices takes about ten seconds to answer — measured, repeatedly, on their
 * live market. Ten seconds of blank page is a broken site as far as anybody
 * looking at it is concerned, so nothing waits for this: the partner search
 * below is already there and already usable, and prices arrive above it when
 * they arrive. If they never do, the page is exactly what it was before.
 *
 * WHITE GLOVE TAKES NO PAYMENT. Every button here leaves for the rental
 * company's own checkout, which is where the card is entered and where the
 * booking lives. The wording says so rather than leaving somebody to find out.
 */

/** The free hand-off shown when there are no prices of our own. */
type Partner = { href: string; message: string };

type Car = {
  id: string;
  headline: string;
  detail?: string;
  price?: { amount: number; currency: string };
  carClass?: string;
  mileage?: string;
  cancellation?: string;
  deposit?: string;
  image?: string;
  supplier?: string;
  supplierLogo?: string;
  bookHref?: string;
};

export default function CarPrices({
  destination,
  startDate,
  endDate,
}: {
  destination: string;
  startDate: string;
  endDate: string;
}) {
  // The answer carries the search it belongs to, so nothing has to be cleared
  // when the traveler edits the form. A result for a search they have moved on
  // from is simply not the current one, and the effect sets state only after
  // an await — a synchronous reset in here is a second render for nothing.
  const key = `${destination.trim()}|${startDate}|${endDate}`;
  const ready = Boolean(destination.trim() && startDate && endDate);
  const [answer, setAnswer] = useState<{ key: string; cars: Car[]; partner?: Partner } | null>(null);

  useEffect(() => {
    if (!ready) return;
    // A search already in flight is abandoned when the traveler edits the
    // form, so a slow first answer cannot overwrite a fast second one.
    const abort = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/travel/cars/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destination, startDate, endDate }),
          signal: abort.signal,
        });
        const data = await response.json();
        if (!abort.signal.aborted) {
          setAnswer({
            key,
            cars: response.ok && Array.isArray(data.cars) ? data.cars : [],
            partner: response.ok && data.partner?.href ? data.partner : undefined,
          });
        }
      } catch {
        // Never an error message about an API. The partner search below is a
        // complete answer on its own and is already on the page.
        if (!abort.signal.aborted) setAnswer({ key, cars: [] });
      }
    })();
    return () => abort.abort();
  }, [key, ready, destination, startDate, endDate]);

  const cars = answer?.key === key ? answer.cars : null;
  const partner = answer?.key === key ? answer.partner : undefined;

  if (!ready) return null;

  if (cars === null) {
    return (
      <p className="mb-4 text-sm text-stone-600" role="status">
        Checking rental prices for {destination}…
      </p>
    );
  }

  if (!cars.length) {
    // NO PRICES IS NOT NO CAR SEARCH. The provider that gives us prices is on
    // a small monthly allowance and can be spent, switched off, or simply
    // having a bad afternoon; the hand-off below costs nothing per search and
    // cannot run out. Shown only when there is nothing better — a "compare
    // with a partner" row under real prices is a worse version of what
    // somebody is already reading.
    if (!partner) return null;
    return (
      <section className="mb-6" aria-labelledby="car-partner-heading">
        <h3 id="car-partner-heading" className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">
          Rental cars in {destination}
        </h3>
        <div className="mt-3 rounded-2xl border border-[var(--gold-light)] bg-[#fcfaf6] px-5 py-4">
          <p className="text-sm leading-6 text-stone-700">{partner.message}</p>
          <a
            href={partner.href}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex min-h-11 items-center rounded-full border border-[var(--navy)] bg-[var(--navy)] px-4 text-xs font-bold uppercase tracking-[0.1em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]"
          >
            Compare cars
          </a>
          <p className="mt-2 text-xs leading-5 text-stone-500">
            Opens the partner&rsquo;s own search with your dates — White Glove does not take payment.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6" aria-labelledby="car-prices-heading">
      <h3 id="car-prices-heading" className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">
        Rental cars in {destination}
      </h3>
      <ul className="mt-3 divide-y divide-[var(--gold-light)] rounded-2xl border border-[var(--gold-light)] bg-[#fcfaf6]">
        {cars.map((car) => (
          <li key={car.id} className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              {/* PLAIN img, NOT next/image. These are a provider's own CDN and
                  the set changes with every search, so there is nothing to
                  configure a remote pattern against and nothing to optimise
                  that they have not already sized. A car with no photograph
                  shows no box at all — see the adapter for why a quarter of
                  them have none. */}
              {car.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={car.image}
                  alt=""
                  loading="lazy"
                  className="h-14 w-24 shrink-0 rounded-lg bg-white object-contain"
                />
              ) : null}
              <div className="min-w-0">
                <p className="text-base font-semibold text-[var(--navy)]">{car.headline}</p>
                {car.detail ? <p className="mt-1 text-sm leading-6 text-stone-600">{car.detail}</p> : null}
                <p className="mt-1 text-xs leading-5 text-stone-500">
                  {[car.mileage, car.cancellation, car.deposit].filter(Boolean).join(" · ")}
                </p>
                {car.supplierLogo ? (
                  // The rental company's own mark. The alt text names them,
                  // because a traveler is choosing a desk as much as a car.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={car.supplierLogo}
                    alt={car.supplier ?? ""}
                    loading="lazy"
                    className="mt-2 h-5 w-auto max-w-[7rem] object-contain"
                  />
                ) : car.supplier ? (
                  <p className="mt-2 text-xs font-semibold text-stone-600">{car.supplier}</p>
                ) : null}
              </div>
            </div>
            <div className="shrink-0 text-right">
              {car.price ? (
                <p className="text-base font-semibold tabular-nums text-[var(--navy)]">
                  {/* Use the shared currency formatter, as the rest of /book
                      does — a raw "EUR 340.5" was showing here instead. */}
                  {moneyLabel(car.price.amount, car.price.currency)}
                </p>
              ) : null}
              {car.bookHref ? (
                <a
                  href={car.bookHref}
                  // The checkout is the rental company's own site — open it in a
                  // new tab like every other partner hand-off, and with rel set.
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex min-h-11 items-center rounded-full border border-[var(--navy)] bg-[var(--navy)] px-4 text-xs font-bold uppercase tracking-[0.1em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]"
                >
                  Continue
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-5 text-stone-500">
        Prices for the dates above. Continue opens the rental company&rsquo;s own checkout, where the booking and the
        payment are made — White Glove does not take payment.
      </p>
    </section>
  );
}
