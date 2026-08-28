"use client";

import { useState } from "react";
import CompanionApp from "@/components/companion/CompanionApp";
import PrintableItinerary from "@/components/PrintableItinerary";
import { buildDays, formatDateLong, type Itinerary } from "@/data/itinerary";
import { buildPrintTimeline } from "@/data/itinerary-print";
import type { CompanionTrip } from "@/data/companion-demo";
import type { SiteBrand } from "@/lib/site-brand-core";

/**
 * The same week, in the three places a trip actually lives.
 *
 * WHAT THIS PAGE USED TO BE. One printable document, and nothing else. That
 * document is a real deliverable and it stays — but it is the last of the
 * three things a trip is, and it was standing in for all of them. Somebody
 * deciding whether to plan a trip here was shown a PDF and asked to imagine
 * the planner and the phone.
 *
 * ONE TRIP BEHIND ALL THREE. Every view is built from the same
 * SAMPLE_ITINERARY: the days come from buildDays(), the same function that
 * lays out a customer's trip, and the app view is converted by
 * buildCompanionFromItinerary() — the same conversion a real client link goes
 * through. Nothing here is a mock-up of a screen. If the planner changes, this
 * page changes with it, which is the only way a sample stays true.
 *
 * THE SITE VIEW IS NOT THE PRINT VIEW SHRUNK. Paper wants a sheet per day and
 * a fixed measure; a page wants to be read down. Same entries, same order,
 * same computed times — laid out for a screen.
 */

type View = "site" | "app" | "print";

const TABS: ReadonlyArray<{ value: View; label: string; blurb: string }> = [
  { value: "site", label: "On the site", blurb: "The trip as the planner lays it out." },
  { value: "app", label: "In the app", blurb: "What the traveller opens on their phone." },
  { value: "print", label: "Printed", blurb: "The document, as it comes out of a printer." },
];

export default function SampleItineraryViews({
  itin,
  companion,
  siteBrand,
}: {
  itin: Itinerary;
  /** Built on the server by the same conversion a real client link uses. Null when the trip has no dates. */
  companion: CompanionTrip | null;
  siteBrand: SiteBrand;
}) {
  const [view, setView] = useState<View>("site");
  const chosen = TABS.find((tab) => tab.value === view)!;

  return (
    <>
      <fieldset>
        <legend className="sr-only">How would you like to see the sample?</legend>
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => {
            const on = tab.value === view;
            // Not offered when the conversion produced nothing — a tab that
            // opens on an empty frame is worse than one that is not there.
            if (tab.value === "app" && !companion) return null;
            return (
              <label
                key={tab.value}
                className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border px-5 text-sm font-semibold transition ${
                  on
                    ? "border-[var(--navy)] bg-[var(--navy)] text-white"
                    : "border-[var(--gold-light)] bg-white text-[var(--navy)] hover:border-[var(--gold)]"
                }`}
              >
                <input
                  type="radio"
                  name="sample-view"
                  value={tab.value}
                  checked={on}
                  onChange={() => setView(tab.value)}
                  className="sr-only"
                />
                {tab.label}
              </label>
            );
          })}
        </div>
        <p className="mt-3 text-sm leading-6 text-stone-600">{chosen.blurb}</p>
      </fieldset>

      <div className="mt-8">
        {view === "site" && <SiteView itin={itin} />}
        {view === "app" && companion && (
          /* The client's side, and only that. previewAsClient takes away the
             three controls no client will ever have, the same way
             /app/preview does — and advisorInbox is left off. What is drawn is
             what a traveller opens. */
          <div className="overflow-hidden rounded-2xl border border-[var(--gold-light)]">
            <CompanionApp trip={{ ...companion, previewAsClient: true }} />
          </div>
        )}
        {view === "print" && <PrintableItinerary itin={itin} burials={{}} embedded siteBrand={siteBrand} />}
      </div>
    </>
  );
}

/**
 * The trip as the site shows it: a day at a time, read down the page.
 *
 * Deliberately plain. It is not the planner's editing surface — there is
 * nothing here to edit and no account behind it — it is what the planner
 * produces, which is the thing somebody is deciding about.
 */
function SiteView({ itin }: { itin: Itinerary }) {
  const days = buildDays(itin);

  return (
    <div className="space-y-8">
      {days.map((day) => {
        const entries = buildPrintTimeline(day);
        return (
          <section key={day.date} className="rounded-2xl border border-[var(--gold-light)] bg-[var(--surface)] p-5 sm:p-7">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]">
                {day.label || formatDateLong(day.date)}
              </h3>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">
                Day {day.index + 1}
              </p>
            </div>

            {day.lodging?.name && (
              <p className="mt-2 text-sm leading-6 text-stone-600">Sleeping: {day.lodging.name}</p>
            )}

            {entries.length === 0 ? (
              /* A day with nothing on it is a decision, not a gap — the
                 Shabbos in this week is deliberately empty. */
              <p className="mt-4 text-sm leading-6 text-stone-600">Nothing scheduled.</p>
            ) : (
              <ol className="mt-5 space-y-4">
                {entries.map((entry, i) => (
                  <li key={`${entry.title}-${i}`} className="grid gap-x-4 gap-y-1 sm:grid-cols-[5.5rem_1fr]">
                    <p className="text-sm font-bold text-[var(--navy)]">{entry.time || "—"}</p>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">
                        {entry.kind}
                      </p>
                      <p className="mt-0.5 font-semibold leading-6 text-[var(--navy)]">{entry.title}</p>
                      {entry.secondaryTitle && (
                        <p className="text-sm leading-6 text-stone-600">{entry.secondaryTitle}</p>
                      )}
                      {entry.detail && <p className="mt-0.5 text-sm leading-6 text-stone-600">{entry.detail}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}
