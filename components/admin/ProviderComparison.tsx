"use client";

import { useState } from "react";
import { cheapestFirst } from "@/lib/travel/compare";
import { CATEGORY_LABELS, PROVIDER_LABELS, type ProviderId, type TravelCategory } from "@/lib/travel/types";

/**
 * The comparison tool — one search, every provider, side by side.
 *
 * It exists to answer the question the audit could not: which company is
 * actually better for White Glove. Results, response time and failures per
 * provider, from the same query at the same moment.
 *
 * It never names a cheapest across providers. Whether two offers may even be
 * compared is decided by lib/travel/compare.ts, and the honest answer is
 * usually no — so this shows each provider's own lowest price in its own
 * column and leaves the judgement to a person.
 */

type Attempt = { provider: ProviderId; ok: boolean; ms: number; count: number; error?: string; timedOut?: boolean; detail?: string };
type Offer = {
  id: string;
  headline: string;
  detail?: string;
  price?: { amount: number; currency: string };
  fulfilment: string;
  provider: ProviderId;
};
type Result = { tried: Attempt[]; offers: Offer[]; partial: boolean } | { error: string };

const field =
  "min-h-11 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none";

/** What the two dates are called in each category. */
const DATE_LABELS: Record<TravelCategory, [string, string]> = {
  flight: ["Depart", "Return"],
  hotel: ["Check in", "Check out"],
  car: ["Pick up", "Drop off"],
};

export default function ProviderComparison() {
  const [category, setCategory] = useState<TravelCategory>("car");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("Kraków");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/travel/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, origin, destination, startDate, endDate }),
      });
      const data = await res.json();
      setResult(res.ok ? data : { error: data?.error || "That search could not run." });
    } catch {
      setResult({ error: "Could not reach the server." });
    } finally {
      setBusy(false);
    }
  }

  /**
   * CHEAPEST FIRST, BECAUSE THE HEADING ALREADY SAYS CHEAPEST.
   *
   * The column heading reports a provider's lowest price and the list below it
   * used to show whichever five the provider happened to send first. On a Pune
   * search that read "lowest USD 251.49" above five hotels priced 591, 994,
   * 1086, 1131 and 292 — so the provider with the better price looked like the
   * expensive one. Same order in both columns or there is nothing to compare.
   */
  const byProvider = (provider: ProviderId) =>
    cheapestFirst(
      result && "offers" in result ? result.offers.filter((offer) => offer.provider === provider) : [],
    );

  return (
    <div className="rounded-xl border border-[var(--gold-light)] bg-white p-5 sm:p-6">
      <form onSubmit={run} className="grid gap-3 sm:grid-cols-6">
        <label className="text-xs font-semibold text-stone-600">
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value as TravelCategory)} className={`mt-1 ${field}`}>
            {(["car", "hotel", "flight"] as const).map((value) => (
              <option key={value} value={value}>{CATEGORY_LABELS[value]}</option>
            ))}
          </select>
        </label>
        {/* A flight is the one search with two ends. Both flight adapters return
            nothing rather than guessing a departure city, so the field appears
            where it is needed and stays out of the way where it is not. */}
        {category === "flight" ? (
          <label className="text-xs font-semibold text-stone-600">
            Leaving from
            <input value={origin} onChange={(e) => setOrigin(e.target.value)} className={`mt-1 ${field}`} placeholder="London" />
          </label>
        ) : null}
        <label className={`text-xs font-semibold text-stone-600 ${category === "flight" ? "" : "sm:col-span-2"}`}>
          {category === "flight" ? "Going to" : "Where"}
          <input value={destination} onChange={(e) => setDestination(e.target.value)} className={`mt-1 ${field}`} placeholder="Kraków" />
        </label>
        {/* NOT "FROM" AND "TO". A flight search already has a place it leaves
            from and a place it goes to, and two more boxes wearing the same two
            words sat beside them. The first flight comparison came back marked
            one way in both columns because the second date never got filled in.
            Each category names its own dates. */}
        <label className="text-xs font-semibold text-stone-600">
          {DATE_LABELS[category][0]}
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`mt-1 ${field}`} />
        </label>
        <label className="text-xs font-semibold text-stone-600">
          {DATE_LABELS[category][1]}
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`mt-1 ${field}`} />
        </label>
        <div className="sm:col-span-6">
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 rounded-md border border-[var(--navy)] bg-[var(--navy)] px-6 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] hover:border-[var(--gold)] disabled:opacity-60"
          >
            {busy ? "Searching…" : "Run comparison"}
          </button>
        </div>
      </form>

      {result && "error" in result && (
        <p className="mt-5 text-sm font-semibold text-red-700">{result.error}</p>
      )}

      {result && "tried" in result && (
        <div className="mt-6">
          {result.tried.length === 0 ? (
            <p className="text-sm text-stone-600">
              No provider is switched on for this category. Set one to Testing above and run it again.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {result.tried.map((attempt) => {
                const offers = byProvider(attempt.provider);
                const lowest = offers
                  .map((offer) => offer.price)
                  .filter((price): price is { amount: number; currency: string } => Boolean(price))
                  .sort((a, b) => a.amount - b.amount)[0];
                return (
                  <div key={attempt.provider} className="rounded-lg border border-[var(--gold-light)] bg-[#FAF8F3] p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="font-semibold text-[var(--navy)]">{PROVIDER_LABELS[attempt.provider]}</h3>
                      <span className="tabular-nums text-xs text-stone-500">{attempt.ms}ms</span>
                    </div>
                    {attempt.ok ? (
                      <p className="mt-1 text-sm text-stone-700">
                        {attempt.count} result{attempt.count === 1 ? "" : "s"}
                        {lowest ? <> · lowest {lowest.currency} {lowest.amount}</> : null}
                      </p>
                    ) : (
                      <>
                        <p className="mt-1 text-sm font-semibold text-red-700">
                          {attempt.error === "not-configured"
                            ? "No key set"
                            : attempt.timedOut
                              ? // SAY WHOSE PATIENCE RAN OUT. "Timed out" alone
                                // cannot tell a slow provider from a limit of
                                // ours set too low, and the two want opposite
                                // responses. The number is the whole diagnosis.
                                `Timed out — we stopped waiting at ${(attempt.ms / 1000).toFixed(1)}s`
                              : attempt.error}
                        </p>
                        {attempt.detail ? (
                          <p className="mt-1 break-words text-xs leading-5 text-stone-500">{attempt.detail}</p>
                        ) : null}
                      </>
                    )}
                    <ul className="mt-3 space-y-1.5">
                      {offers.slice(0, 5).map((offer) => (
                        <li key={offer.id} className="text-xs leading-5 text-stone-600">
                          <span className="font-semibold text-[var(--navy)]">{offer.headline}</span>
                          {offer.price ? <> — {offer.price.currency} {offer.price.amount}</> : null}
                          {offer.detail ? <span className="block text-stone-500">{offer.detail}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-4 text-xs leading-5 text-stone-500">
            Each column shows that provider&rsquo;s own five cheapest, and its own lowest price. No cheapest is named
            across providers — two offers are only comparable when cabin, bags, room type, car class, refundability and
            the rest actually match, and on a hotel search they rarely do: one company&rsquo;s list can be apartments
            where the other&rsquo;s is hotels.
          </p>
        </div>
      )}
    </div>
  );
}
