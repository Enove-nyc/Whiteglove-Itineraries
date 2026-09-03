"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ACTION_BUTTON_CLASS } from "@/lib/action-button";
import { BRAND_ORIGIN } from "@/lib/site-brand-core";
import { useIsItineraries } from "@/components/useSiteBrand";
import type { SiteBrand } from "@/lib/site-brand-core";
import {
  ACCESSIBILITY_NEEDS,
  emptyAnswers,
  INTERESTS,
  KOSHER_REQUIREMENTS,
  PACES,
  SHABBOS_REQUIREMENTS,
  STEPS,
  summarize,
  TRIP_KINDS,
  TRIP_PLAN_KEY,
  type PlanningMethod,
  type TripKind,
  type TripPlanAnswers,
} from "@/lib/trip-plan";

/**
 * The three short steps before the planner.
 *
 * WHAT CHANGED, AND WHY. The flow promised "three questions" and then asked
 * about ten: step two held the destination, the dates, where you were flying
 * from, who was coming, the pace, the interests, the kashrus standards, the
 * Shabbos requirements and a notes box, all on one screen, with a counter under
 * the heading reading "1 of 10 questions answered". The counter was accurate,
 * which is what made it damning. Somebody who has decided they might like to go
 * away in July met a page-long form before anything happened.
 *
 * SO STEP TWO IS NOW FOUR SHORT ANSWERS — where, when, from where, who — and
 * everything else moved into a "Personalize my recommendations" section that
 * opens after the choice in step three. A self-service visitor can reach the
 * planner having pressed two buttons and typed nothing. Somebody asking us to
 * plan it answers the detailed questions on the request form, where they are
 * the actual brief rather than a toll gate.
 *
 * WHAT DID NOT CHANGE, and must not:
 *
 *   • NOTHING IS REQUIRED. No field blocks the next step, there is no asterisk,
 *     and no email box in front of the answers. The visitor this exists for is
 *     the one who does not know where they are going.
 *
 *   • Every question offers "I don't know yet" as a real answer rather than
 *     leaving it blank, because the two are different: one is a decision to
 *     tell us, the other is a question they did not see.
 *
 *   • The answers are theirs, kept in this browser as they are typed, and used
 *     to fill in whichever of the two paths gets chosen. Nobody types their
 *     dates twice.
 *
 *   • The kevarim question is asked for a heritage journey and at no other
 *     time.
 *
 * WRITTEN FROM THE EVENT, NOT FROM AN EFFECT. Typing is what makes an answer
 * worth keeping, so the handler that hears the typing is what stores it. Same
 * rule, and the same reason, as components/useFormDraft.ts.
 *
 * FOCUS MOVES WITH THE STEP. Pressing "Continue" and leaving the focus on a
 * button that no longer exists strands a keyboard user at the top of the
 * document. The new step's heading is focused instead, which also makes a
 * screen reader announce what step it is.
 */

const field =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] shadow-sm focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const label = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-600";
const chip = "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition";
const chipOff = `${chip} border-[var(--gold-light)] bg-white text-stone-700 hover:border-[var(--gold)] hover:text-[var(--navy)]`;
const chipOn = `${chip} border-[var(--navy)] bg-[var(--navy)] text-white`;

function Toggles({
  legend,
  hint,
  options,
  chosen,
  onToggle,
}: {
  legend: string;
  hint?: string;
  options: readonly string[];
  chosen: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className={label}>{legend}</legend>
      {hint && <p className="mt-1 text-xs leading-5 text-stone-500">{hint}</p>}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {options.map((option) => {
          const on = chosen.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(option)}
              className={on ? chipOn : chipOff}
            >
              {/* A tick as well as the fill, so "chosen" is not carried by
                  colour alone. */}
              <span aria-hidden="true" className="mr-2 text-xs">
                {on ? "✓" : "+"}
              </span>
              {option}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function TripStartFlow({
  initialDestination = "",
  initialKind = "",
  brand,
}: {
  /** Arrived from a destination card: "Add Rome to a trip". */
  initialDestination?: string;
  initialKind?: TripKind | "";
  /**
   * Which site this is, settled on the server.
   *
   * WHY IT IS A PROP AND NOT THE HOOK ANY MORE. useIsItineraries falls back on
   * the server to the build's configured brand, and that variable is not set
   * on the itineraries deployment — so the HTML this page was SERVED with said
   * kosher, and only corrected itself after hydration. Which meant the markup
   * a crawler and a first paint actually got offered a group trip as "several
   * families, a school, a shul or a simcha" and a Heritage category of kevarim
   * and batei hachaim, on the general-travel domain. The server knows the
   * brand for certain, from the request; Navbar has always taken it this way.
   */
  brand?: SiteBrand;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<TripPlanAnswers>(() => ({
    ...emptyAnswers(),
    destination: initialDestination,
    kind: initialKind,
  }));
  // /plan is one of the itineraries domain's own pages. /heritage is a
  // guide-only path (middleware.ts) that does not exist there — reached on
  // that domain it silently redirects to the kosher site, which also breaks
  // out of an installed itineraries app (the Trusted Web Activity drops to an
  // ordinary browser tab, address bar and all, the moment it leaves the
  // verified domain).
  //
  // The server's answer when it gave one, because it read the request; the
  // hook only as a fallback for a caller that has not been given one yet.
  const fromHost = useIsItineraries();
  const itineraries = brand ? brand === "itineraries" : fromHost;
  const headingRef = useRef<HTMLHeadingElement>(null);

  function update(patch: Partial<TripPlanAnswers>) {
    const next = { ...answers, ...patch };
    setAnswers(next);
    try {
      // Stamped, so the planner can say truthfully when these were answered
      // and stop offering them once they are a day old. See lib/trip-plan.ts.
      localStorage.setItem(TRIP_PLAN_KEY, JSON.stringify({ ...next, savedAt: new Date().toISOString() }));
    } catch {
      // A full or blocked storage is not worth breaking the flow over. The
      // answers still work for this visit; only carrying them to the next page
      // is lost, and the pages that read them treat absence as normal.
    }
  }

  function goToStep(next: number) {
    setStep(next);
    // After the render that swaps the step in. Without this the focus is left
    // on a button that has just been removed from the document.
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  function toggle(key: "interests" | "kosher" | "shabbos" | "accessibility", value: string) {
    const current = answers[key];
    update({ [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] });
  }

  function choose(method: PlanningMethod) {
    update({ method });
    // /destinations is a guide path and does not exist on the itineraries
    // domain — reached there it bounces to the kosher site, which inside an
    // installed app means the Trusted Web Activity losing its verified domain
    // and dropping to an ordinary browser tab. The card that offers it is not
    // rendered on this brand; this is the second lock on the same door, so a
    // future caller cannot reopen it by accident.
    if (method === "myself" || itineraries) router.push("/itinerary?from=plan");
    else router.push("/destinations");
  }

  const current = STEPS[step - 1];
  const isHeritage = answers.kind === "heritage";

  return (
    <div>
      {/* ---- where you are ------------------------------------------------ */}
      <nav aria-label="Progress through planning" className="rounded-2xl border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
        <ol className="flex flex-wrap gap-x-6 gap-y-2">
          {STEPS.map((entry) => {
            const state = entry.number === step ? "current" : entry.number < step ? "done" : "todo";
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => goToStep(entry.number)}
                  aria-current={state === "current" ? "step" : undefined}
                  className={`inline-flex min-h-11 items-center gap-2 text-sm font-semibold transition ${
                    state === "current"
                      ? "text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-8"
                      : "text-stone-600 hover:text-[var(--navy)]"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs ${
                      state === "done"
                        ? "border-[var(--navy)] bg-[var(--navy)] text-white"
                        : state === "current"
                          ? "border-[var(--navy)] text-[var(--navy)]"
                          : "border-[var(--gold-light)] text-stone-500"
                    }`}
                  >
                    {state === "done" ? "✓" : entry.number}
                  </span>
                  <span>
                    <span className="sr-only">Step {entry.number}: </span>
                    {entry.title}
                    {state === "done" && <span className="sr-only"> — answered</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="mt-3 border-t border-[var(--gold-light)] pt-3">
          {/* The bar is decoration; the sentence is the information. A
              progress bar with no words beside it tells a screen reader
              nothing useful, and tells a sighted person only roughly. */}
          <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--cream-deep)]">
            <div
              className="h-full rounded-full bg-[var(--gold)] transition-all"
              style={{ width: `${Math.round((step / STEPS.length) * 100)}%` }}
            />
          </div>
          {/* OUT OF THREE, because there are three steps. It used to read
              "1 of 10 questions answered". */}
          <p aria-live="polite" className="mt-2 text-xs text-stone-600">
            Step {step} of {STEPS.length}. <span className="font-semibold text-[var(--navy)]">Nothing is required.</span>
          </p>
        </div>
      </nav>

      {/* ---- the step ------------------------------------------------------ */}
      <section className="mt-8">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--navy)] outline-none sm:text-4xl"
        >
          {current.title}
        </h2>
        {current.blurb && <p className="mt-2 text-lg leading-8 text-stone-600">{current.blurb}</p>}

        {step === 1 && (
          <fieldset className="mt-8">
            <legend className="sr-only">The kind of trip</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {/* Heritage (kevarim, batei hachaim) is Kosher Travel's own
                  journey type — Itineraries has nothing to do with kosher. */}
              {TRIP_KINDS.filter((kind) => !itineraries || kind.value !== "heritage").map((kind) => {
                const on = answers.kind === kind.value;
                return (
                  <button
                    key={kind.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      update({ kind: kind.value });
                      goToStep(2);
                    }}
                    className={`wg-card flex h-full flex-col items-start border p-5 text-left transition ${
                      on
                        ? "border-[var(--navy)] bg-[var(--navy)] text-white"
                        : "border-[var(--gold-light)] bg-[var(--surface)] hover:border-[var(--gold)]"
                    }`}
                  >
                    <span className={`font-[family-name:var(--font-display)] text-2xl leading-tight ${on ? "text-white" : "text-[var(--navy)]"}`}>
                      {kind.label}
                    </span>
                    <span className={`mt-2 text-sm leading-6 ${on ? "text-slate-200" : "text-stone-600"}`}>{(itineraries && kind.itinerariesBlurb) || kind.blurb}</span>
                    {/* No sr-only "Selected" here: aria-pressed already says
                        so, and both together read as "Rome, selected, pressed". */}
                  </button>
                );
              })}
            </div>
            <div className="mt-6">
              <button
                type="button"
                onClick={() => goToStep(2)}
                className="inline-flex min-h-11 items-center rounded-md border border-[var(--gold)] px-6 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--cream-deep)]"
              >
                Skip
              </button>
            </div>
          </fieldset>
        )}

        {/* ---- step two: four short answers, and nothing else -------------- */}
        {step === 2 && (
          <div className="mt-8 space-y-8">
            <div className="grid gap-5 rounded-2xl border border-[var(--gold-light)] bg-[var(--surface)] p-5 sm:p-6 lg:grid-cols-2">
              <div>
                <label className="block" htmlFor="plan-destination">
                  <span className={label}>Where to</span>
                </label>
                <input
                  id="plan-destination"
                  className={field}
                  value={answers.destination}
                  disabled={answers.helpMeChoose}
                  placeholder="A city, a country, or “somewhere warm”"
                  onChange={(event) => update({ destination: event.target.value })}
                />
                <label className="mt-3 flex min-h-11 items-center gap-2 text-sm text-stone-700">
                  <input
                    type="checkbox"
                    checked={answers.helpMeChoose}
                    onChange={(event) => update({ helpMeChoose: event.target.checked })}
                    className="h-4 w-4"
                  />
                  Help me choose — I don’t know yet
                </label>
              </div>

              <div>
                <label className="block" htmlFor="plan-from">
                  <span className={label}>Flying from</span>
                </label>
                <input
                  id="plan-from"
                  className={field}
                  value={answers.from}
                  placeholder="e.g. New York, London, Tel Aviv"
                  onChange={(event) => update({ from: event.target.value })}
                />
              </div>

              <fieldset className="lg:col-span-2">
                <legend className={label}>When</legend>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {(
                    [
                      ["exact", "I know the dates"],
                      ["approximate", "Roughly"],
                      ["unknown", "I don’t know yet"],
                    ] as const
                  ).map(([value, text]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={answers.dateMode === value}
                      onClick={() => update({ dateMode: value })}
                      className={answers.dateMode === value ? chipOn : chipOff}
                    >
                      {text}
                    </button>
                  ))}
                </div>

                {answers.dateMode === "exact" && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className={label}>Leaving</span>
                      <input
                        type="date"
                        className={field}
                        value={answers.startDate}
                        onChange={(event) => update({ startDate: event.target.value })}
                      />
                    </label>
                    <label className="block">
                      <span className={label}>Coming back</span>
                      <input
                        type="date"
                        className={field}
                        min={answers.startDate || undefined}
                        value={answers.endDate}
                        onChange={(event) => update({ endDate: event.target.value })}
                      />
                    </label>
                  </div>
                )}

                {answers.dateMode === "approximate" && (
                  <label className="mt-4 block">
                    <span className={label}>Roughly when</span>
                    <input
                      className={field}
                      value={answers.approximateWhen}
                      placeholder="e.g. July, after Pesach, the winter — a week or so"
                      onChange={(event) => update({ approximateWhen: event.target.value })}
                    />
                  </label>
                )}
              </fieldset>

              <fieldset className="lg:col-span-2">
                <legend className={label}>Who is coming</legend>
                <div className="mt-2.5 grid gap-4 sm:grid-cols-3">
                  <label className="block">
                    <span className={label}>Adults</span>
                    <input
                      type="number"
                      min={0}
                      max={40}
                      inputMode="numeric"
                      className={field}
                      value={answers.adults}
                      onChange={(event) => update({ adults: event.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className={label}>Children</span>
                    <input
                      type="number"
                      min={0}
                      max={40}
                      inputMode="numeric"
                      className={field}
                      value={answers.children}
                      onChange={(event) => update({ children: event.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className={label}>Their ages</span>
                    <input
                      className={field}
                      value={answers.childAges}
                      placeholder="e.g. 4, 7 and 11"
                      onChange={(event) => update({ childAges: event.target.value })}
                    />
                  </label>
                </div>
              </fieldset>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => goToStep(3)}
                className={`inline-flex min-h-11 items-center ${ACTION_BUTTON_CLASS.primary}`}
              >
                Continue
              </button>
              <button
                type="button"
                onClick={() => goToStep(1)}
                className="inline-flex min-h-11 items-center rounded-md border border-[var(--gold)] px-6 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--cream-deep)]"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="mt-8 space-y-8">
            <button
              type="button"
              onClick={() => choose("myself")}
              className="wg-card flex w-full flex-col items-start border border-[var(--navy)] bg-[var(--navy)] p-7 text-left text-white transition hover:bg-[var(--navy-deep)]"
            >
              <span className="font-[family-name:var(--font-display)] text-3xl leading-tight">
                Open the planner <span aria-hidden="true">→</span>
              </span>
              <span className="mt-3 leading-7 text-slate-200">Your answers are already in it.</span>
            </button>

            {/* THE GUIDE IS THE OTHER SITE'S. Browsing destinations means the
                kosher travel guide, which this domain does not serve — the
                same reason heritage is not offered as a kind of trip here. On
                this brand the planner is the whole answer to "not decided
                yet": a trip can be started with no destination in it and
                filled in later. */}
            {!itineraries && (
              <div className="rounded-2xl border border-[var(--gold-light)] bg-[#FAF8F3] p-5 sm:p-6">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">Not decided</p>
                <p className="mt-2 leading-7 text-stone-600">Your answers stay in this browser.</p>
                <button
                  type="button"
                  onClick={() => choose("unsure")}
                  className="mt-4 inline-flex min-h-11 items-center rounded-md border border-[var(--gold)] px-6 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--cream-deep)]"
                >
                  Browse destinations first
                </button>
              </div>
            )}

            {/* ---- the optional half ------------------------------------------
                CLOSED BY DEFAULT, AND AFTER THE CHOICE, not before it. These
                were step two, and they were the reason a three-step flow took
                a page and a half. Everything here genuinely improves what we
                suggest and none of it should stand between somebody and the
                planner — so it is offered to the person who wants to give it,
                and skipped in one keystroke by everybody else. */}
            <details className="group rounded-2xl border border-[var(--gold-light)] bg-[var(--surface)] p-5 sm:p-6">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4">
                <span>
                  <span className="block font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]">
                    Personalize my recommendations
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-stone-600">
                    Optional. Pace, interests, kosher standards, Shabbos and access needs.
                  </span>
                </span>
                <span className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">
                  Open
                  <span aria-hidden="true" className="ml-2 inline-block transition group-open:rotate-90">
                    →
                  </span>
                </span>
              </summary>

              <div className="mt-6 space-y-7 border-t border-[var(--gold-light)] pt-6">
                <fieldset>
                  <legend className={label}>Pace</legend>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {PACES.map((pace) => (
                      <button
                        key={pace.value}
                        type="button"
                        aria-pressed={answers.pace === pace.value}
                        onClick={() => update({ pace: pace.value })}
                        className={answers.pace === pace.value ? chipOn : chipOff}
                        title={pace.blurb}
                      >
                        {pace.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <Toggles
                  legend="Interests"
                  options={itineraries ? INTERESTS.filter((i) => i !== "Jewish heritage") : INTERESTS}
                  chosen={answers.interests}
                  onToggle={(v) => toggle("interests", v)}
                />

                {/* Kosher standards, food notes and Shabbos requirements are
                    Kosher Travel's own questions — Itineraries has nothing to
                    do with kosher. */}
                {!itineraries && (
                  <div>
                    <Toggles
                      legend="Kosher standards"
                      hint="Choose as many as apply."
                      options={KOSHER_REQUIREMENTS}
                      chosen={answers.kosher}
                      onToggle={(v) => toggle("kosher", v)}
                    />
                    <label className="mt-5 block">
                      <span className={label}>Anything else about food</span>
                      <input
                        className={field}
                        value={answers.kosherNotes}
                        placeholder="Allergies, a hechsher you rely on, a child who eats nothing but pasta…"
                        onChange={(event) => update({ kosherNotes: event.target.value })}
                      />
                    </label>
                  </div>
                )}

                {!itineraries && (
                  <Toggles
                    legend="Shabbos requirements"
                    options={SHABBOS_REQUIREMENTS}
                    chosen={answers.shabbos}
                    onToggle={(v) => toggle("shabbos", v)}
                  />
                )}

                <Toggles
                  legend="Accessibility needs"
                  options={ACCESSIBILITY_NEEDS}
                  chosen={answers.accessibility}
                  onToggle={(v) => toggle("accessibility", v)}
                />

                {/* Asked ONLY for a heritage journey. Somebody planning a week
                    on a beach should never be asked which kevarim they want to
                    visit — that question was on the front of the old contact
                    form for everybody, and it told a vacation customer this
                    site was not for them. */}
                {isHeritage && (
                  <label className="block rounded-xl border border-[var(--gold)] bg-[#FAF8F3] p-5">
                    <span className={label}>Kevarim, towns or tzaddikim you want to reach</span>
                    <textarea
                      rows={3}
                      className={`${field} min-h-24`}
                      value={answers.kevarim}
                      placeholder="e.g. Lizhensk, Sanz, and whatever else is on the way"
                      onChange={(event) => update({ kevarim: event.target.value })}
                    />
                    <span className="mt-1.5 block text-xs leading-5 text-stone-500">
                      {itineraries ? (
                        <a
                          href={`${BRAND_ORIGIN.kosher}/heritage`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2"
                        >
                          Browse the kevarim directory
                        </a>
                      ) : (
                        <Link href="/heritage" className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">
                          Browse the kevarim directory
                        </Link>
                      )}
                    </span>
                  </label>
                )}

                <label className="block">
                  <span className={label}>Additional notes</span>
                  <textarea
                    rows={3}
                    className={`${field} min-h-24`}
                    value={answers.notes}
                    placeholder="A simcha, an anniversary, a budget you want to stay inside…"
                    onChange={(event) => update({ notes: event.target.value })}
                  />
                </label>
              </div>
            </details>

            {/* What we have, in their own words, before either button is
                pressed. A wizard that sends a summary you were never shown is
                how somebody finds out afterwards that it said the wrong thing. */}
            <div className="rounded-2xl border border-[var(--gold-light)] bg-[var(--surface)] p-5 sm:p-6">
              <h3 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">What you have told us</h3>
              {summarize(answers).length > 0 ? (
                <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                  {summarize(answers).map(([term, value]) => (
                    <div key={term}>
                      <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">{term}</dt>
                      <dd className="mt-0.5 leading-6 text-[var(--navy)]">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-3 leading-7 text-stone-600">Nothing yet.</p>
              )}
              <button
                type="button"
                onClick={() => goToStep(2)}
                className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
              >
                Change these answers
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
