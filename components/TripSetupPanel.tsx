"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import type { Itinerary } from "@/data/itinerary";
import { vacationDestinations } from "@/data/vacation-destinations";
import { answersAreFresh, describeAnswered, hasAnswers, plannerSeed, readAnswers, summarize, TRIP_PLAN_KEY, type TripPlanAnswers } from "@/lib/trip-plan";
import { destinationForTrip, setupProgress, setupSteps, tripIsUntouched, type TripTemplate } from "@/lib/trip-setup";
import { destinationHref } from "@/lib/vacation-ideas";

/**
 * The part in front of the planner.
 *
 * WHAT IT IS FOR. Everything the planner can do is available from the first
 * second, and nothing said which of it to do first. This says: here is what
 * this trip still needs and why each one matters, here is somewhere real to
 * start from, here is where the trip is being kept — and, throughout, the
 * offer to hand the whole thing over, in a strip that does not interrupt
 * anybody who would rather carry on themselves.
 *
 * IT IS NOT A WIZARD AND IT DOES NOT GATE ANYTHING. The planner underneath is
 * fully usable with this panel ignored, collapsed, or finished. That matters:
 * the people who already know this tool are the ones who use it most, and a
 * step-by-step introduction in their way every time would be a downgrade.
 *
 * WHAT THE PROGRESS INDICATOR IS NOT. Not a completion score for the trip —
 * "62% planned" says nothing true about whether a holiday is ready. It is a
 * checklist of the five things the planner itself needs in order to be able to
 * do its work, and each one says what it unlocks.
 */

/* ---- reading the answers from /plan -------------------------------------- */
//
// Through useSyncExternalStore rather than copied into state in an effect —
// same reason as everywhere else in this codebase: localStorage is an outside
// thing, and the server cannot see it, so the server snapshot is null.

let cachedRaw: string | null = null;
let cachedAnswers: TripPlanAnswers | null = null;

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function storedAnswers(): TripPlanAnswers | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(TRIP_PLAN_KEY);
  } catch {
    return null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedAnswers = readAnswers(raw);
  }
  return cachedAnswers;
}

export default function TripSetupPanel({
  itin,
  templates,
  signedIn,
  onApply,
}: {
  itin: Itinerary;
  /** Built on the server from the destinations that have an outline. */
  templates: TripTemplate[];
  /** Null while the answer is still being fetched. */
  signedIn: boolean | null;
  onApply: (patch: Partial<Itinerary>, template?: TripTemplate) => void;
}) {
  const [open, setOpen] = useState(true);
  const answers = useSyncExternalStore(subscribe, storedAnswers, () => null);

  const steps = setupSteps(itin);
  const progress = setupProgress(steps);
  const untouched = tripIsUntouched(itin);
  const suggested = destinationForTrip(itin, vacationDestinations);
  // A DAY, NOT FOREVER. These answers exist to carry somebody from /plan into
  // the planner in one sitting. Past that they are a week-old note about a
  // family's travel plans sitting in a browser on a machine that may not be
  // theirs, offered back to whoever opens the page next.
  const canSeed = hasAnswers(answers) && answersAreFresh(answers) && untouched;

  return (
    <section aria-labelledby="trip-setup-heading" className="rounded-2xl border border-[var(--gold-light)] bg-[#FAF8F3] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="trip-setup-heading" className="font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]">
            {progress.done === progress.total ? "This trip has everything the planner needs." : "Getting this trip started"}
          </h2>
          {/* No "N of 5 basics done" counter: the checklist below already says
              what is done and what is next, one card at a time. */}
          {progress.next && (
            <p aria-live="polite" className="mt-1 text-sm leading-6 text-stone-600">
              Next: {progress.next.label.toLowerCase()}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="trip-setup-body"
          className="inline-flex min-h-11 items-center rounded-md border border-[var(--gold-light)] px-4 text-xs font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:border-[var(--gold)] hover:bg-[var(--cream-deep)]"
        >
          {open ? "Hide the setup help" : "Show the setup help"}
        </button>
      </div>

      {open && (
        <div id="trip-setup-body" className="mt-5 space-y-5">
          {/* ---- carry the answers over ------------------------------------ */}
          {canSeed && answers && (
            <div className="rounded-xl border border-[var(--gold)] bg-white p-5">
              {/* WHEN, TRUTHFULLY. This said "a moment ago" whatever the age,
                  so somebody returning after a week was told they had just
                  typed their family's travel dates. */}
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">
                You answered these {describeAnswered(answers)}
              </p>
              <ul className="mt-3 grid gap-x-8 gap-y-1 text-sm text-stone-600 sm:grid-cols-2">
                {summarize(answers).slice(0, 6).map(([term, value]) => (
                  <li key={term}>
                    <span className="font-semibold text-[var(--navy)]">{term}:</span> {value}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => {
                  const seed = plannerSeed(answers);
                  onApply({
                    title: seed.title,
                    startDate: seed.startDate,
                    endDate: seed.endDate,
                    travelers: seed.travelers.map((traveler, index) => ({
                      id: `seed-${index}`,
                      name: traveler.name,
                      kind: traveler.kind,
                    })),
                    travelerName: "",
                    notes: seed.notes,
                  });
                }}
                className="mt-4 inline-flex min-h-11 items-center rounded-md border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.1em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]"
              >
                Use these answers
              </button>
            </div>
          )}

          {/* ---- the five basics, with reasons ----------------------------- */}
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((step) => (
              <li
                key={step.id}
                className={`rounded-xl border p-4 ${
                  step.done ? "border-emerald-700 bg-emerald-50" : "border-[var(--gold-light)] bg-white"
                }`}
              >
                <p className="flex items-center gap-2 text-sm font-bold text-[var(--navy)]">
                  {/* A tick or a dash as well as the tint, so "done" is not
                      carried by colour alone. */}
                  <span aria-hidden="true" className={step.done ? "text-emerald-800" : "text-stone-400"}>
                    {step.done ? "✓" : "○"}
                  </span>
                  {step.label}
                  <span className="sr-only">{step.done ? " — done" : " — still to do"}</span>
                </p>
                <p className="mt-1.5 text-xs leading-5 text-stone-600">{step.done ? step.why : step.hint}</p>
                {!step.done && <p className="mt-1.5 text-xs leading-5 text-stone-500">{step.why}</p>}
              </li>
            ))}
          </ol>

          {/* ---- somewhere to start from ----------------------------------- */}
          {untouched && templates.length > 0 && (
            <div className="rounded-xl border border-[var(--gold-light)] bg-white p-5">
              <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">
                Or start from a template
              </h3>
              <p className="mt-1.5 text-sm leading-6 text-stone-600">
                Fills in the outline and adds real places, unscheduled. Nothing is booked; change or remove any of it.
              </p>
              <ul className="mt-4 grid gap-3 md:grid-cols-2">
                {templates.map((template) => (
                  <li key={template.slug} className="rounded-lg border border-[var(--gold-light)] bg-[#FAF8F3] p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">
                      {template.destination} · {template.country}
                    </p>
                    <p className="mt-1 font-semibold text-[var(--navy)]">{template.title}</p>
                    {/* Days are a duration the traveler needs; how many records
                        the template will add is a count the site was
                        advertising, so it is gone. */}
                    <p className="mt-1 text-xs leading-5 text-stone-600">{template.days} days</p>
                    <button
                      type="button"
                      onClick={() => onApply({}, template)}
                      className="mt-3 inline-flex min-h-11 items-center rounded-md border border-[var(--gold)] px-4 text-xs font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:bg-[var(--cream-deep)]"
                    >
                      Start from {template.destination}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ---- what we hold for where this trip is going ------------------ */}
          {suggested && (
            <div className="rounded-xl border border-[var(--gold-light)] bg-white p-5">
              <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">
                We hold a page for {suggested.name}
              </h3>
              <p className="mt-1.5 text-sm leading-6 text-stone-600">
                Things to do, where to stay, kosher food and Shabbos.
              </p>
              <Link
                href={destinationHref(suggested)}
                className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
              >
                Open the {suggested.name} page
              </Link>
            </div>
          )}

          {/* ---- where this is being kept ----------------------------------- */}
          <div className="rounded-xl border border-[var(--gold-light)] bg-white p-5">
            <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">Where this trip is saved</h3>
            {signedIn === false ? (
              <>
                <p className="mt-1.5 text-sm leading-6 text-stone-600">
                  Trips are saved securely to your account, so yours is on every device you sign in on.
                  Sign in and the first thing you add starts it.
                </p>
                <Link
                  href="/login?next=%2Fitinerary"
                  className="mt-3 inline-flex min-h-11 items-center rounded-md border border-[var(--gold)] px-5 text-xs font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:bg-[var(--cream-deep)]"
                >
                  Sign in or create an account
                </Link>
              </>
            ) : signedIn ? (
              <p className="mt-1.5 text-sm leading-6 text-stone-600">Saved securely to your account as you type.</p>
            ) : (
              /* Still asking. Nothing is kept in the browser either way — the
                 account is the only place a trip is written. */
              <p className="mt-1.5 text-sm leading-6 text-stone-500">Checking where this trip is being kept…</p>
            )}
          </div>

          {/* "Would rather not do this part? … Have us plan it" sat here, in
              the middle of the planner. It read as the tool giving up on the
              person using it, and the service it offered has since been
              removed from the site outright. See AGENTS.md. */}
        </div>
      )}
    </section>
  );
}
