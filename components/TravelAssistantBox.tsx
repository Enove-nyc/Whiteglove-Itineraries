"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BRAND_ORIGIN } from "@/lib/site-brand-core";
import { useIsItineraries } from "@/components/useSiteBrand";
import AssistantAnswer from "@/components/AssistantAnswer";
import { Icon } from "@/components/icons/Icon";
import {
  ANSWER_LABEL,
  ASSISTANT_HOME_LABEL,
  ASSISTANT_HOME_SUPPORT,
  ASSISTANT_INPUT_NOTICE,
  SOURCED_LABEL,
  type AssistantSource,
} from "@/lib/assistant-disclosure";

/**
 * The AI assistant, folded behind one compact control.
 *
 * It used to open the /itinerary page as a large explained section above the
 * planner, which put a page of assistant copy in front of the tool the page is
 * named for. Now it is a single button — "Assistant" — and everything it has
 * to say about itself (what it can do, that it is AI, where the question goes)
 * lives INSIDE the opened panel, read by the people who open it.
 */

/**
 * The questions offered before anybody types.
 *
 * These are not decoration: an empty box with a cursor in it gets typed into
 * by almost nobody, and whatever the examples say is what people believe the
 * assistant is for. All three used to be about kevarim, which taught every
 * visitor that this was a kevarim tool. Vacation planning comes first now, and
 * the heritage question is still there because it is still one of the things
 * this site is best at.
 */
const EXAMPLES = [
  "Find a kosher summer vacation for a family.",
  "Plan four days in Rome for a couple.",
  "Where is kosher food in Paris?",
  "Compare Alpine destinations for kosher travelers.",
  "Help me plan Shabbos in Paris.",
  "Plan a three-day heritage journey in Poland.",
];

const VISIBLE_EXAMPLES = 3;

export default function TravelAssistantBox({
  embedded = false,
  /** The page already shows the label above it, so the panel does not repeat it. */
  labelledOutside = false,
  /** A question handed over by the site assistant. See the note below. */
  initialAsk = "",
}: {
  embedded?: boolean;
  labelledOutside?: boolean;
  initialAsk?: string;
}) {
  // Which site this is. One line, and right on the first paint — see
  // components/useSiteBrand.ts.
  const itineraries = useIsItineraries();
  const [open, setOpen] = useState(embedded || Boolean(initialAsk));
  const [question, setQuestion] = useState(initialAsk);
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<AssistantSource[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showMoreExamples, setShowMoreExamples] = useState(false);

  async function ask(q: string) {
    const value = q.trim();
    if (!value) return;
    setBusy(true);
    setAnswer(null);
    setSources([]);
    setNote(null);
    setExpanded(false);
    try {
      const res = await fetch("/api/itinerary/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: value }),
      });
      const data = await res.json().catch(() => ({ available: false, reason: "Something went wrong." }));
      if (data.available) {
        setAnswer(data.text || "");
        setSources(Array.isArray(data.sources) ? data.sources : []);
      } else setNote(data.reason || "The assistant is unavailable right now.");
    } catch {
      setNote("Could not reach the assistant. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * ARRIVING FROM THE SITE ASSISTANT WITH THE QUESTION ALREADY ASKED.
   *
   * The corner assistant answers only from published pages, and when it has
   * nothing it offers this one instead. Sending somebody here to type their
   * question a second time is the sort of hand-off that gets abandoned
   * halfway, so it travels in the address: /assistant?ask=… opens this panel
   * and asks it.
   *
   * READ ON THE SERVER AND HANDED DOWN, not read from window here. The page
   * already has the query string, and taking it there means this panel opens
   * ALREADY open with the question in it — one render, no flicker, and no
   * difference between what the server drew and what the browser draws.
   *
   * The asking happens after paint, guarded by a ref: it is a network call,
   * and an effect that runs twice would make it twice.
   */
  const asked = useRef(false);
  useEffect(() => {
    if (!initialAsk || asked.current) return;
    asked.current = true;
    const timer = setTimeout(() => void ask(initialAsk), 0);
    // Taken out of the address, so a reload does not ask it again and a copied
    // link does not carry somebody else's question.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("ask");
      window.history.replaceState(null, "", url);
    }
    return () => clearTimeout(timer);
    // `ask` is deliberately not a dependency. It is redefined on every render,
    // and this effect must run once for one arriving question — the ref above
    // is what guarantees that, not the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAsk]);

  const visible = showMoreExamples ? EXAMPLES : EXAMPLES.slice(0, VISIBLE_EXAMPLES);

  return (
    <div data-ai-assistant="">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="travel-assistant-panel"
        aria-label={ASSISTANT_HOME_LABEL}
        title={ASSISTANT_HOME_LABEL}
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--gold-light)] bg-[#FAF8F3] px-4 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:border-[var(--gold)] hover:bg-[var(--cream-deep)]"
      >
        <Icon name="sparkle" className="h-4 w-4" />
        AI assistant
      </button>

      {open && (
        <div
          id="travel-assistant-panel"
          className="mt-3 rounded-xl border border-[var(--gold-light)] bg-[#FAF8F3] p-5 sm:p-6"
        >
          {labelledOutside ? null : (
            <>
              <h2 className="font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]">{ASSISTANT_HOME_LABEL}</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">{ASSISTANT_HOME_SUPPORT}</p>
            </>
          )}
          <p className="mt-2 text-sm leading-6 text-stone-600">
            For White Glove&apos;s own checked listings, use the{" "}
            {/* THE FINDER IS THE GUIDE'S. On the itineraries domain /kosher is
                a guide-only path and a same-tab link there would bounce the
                visitor off this site — and out of an installed app. Named
                openly as the other site instead, in a new tab. Same treatment
                KosherNearby gives it. */}
            {itineraries ? (
              <a
                href={`${BRAND_ORIGIN.kosher}/kosher`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2"
              >
                kosher food finder
              </a>
            ) : (
              <Link href="/kosher" className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">
                kosher food finder
              </Link>
            )}{" "}
            or the{" "}
            <Link href="/search" className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">
              site search
            </Link>
            .
          </p>

          <details className="mt-3 rounded-md border border-[var(--gold-light)] bg-white/70 px-4 py-2 sm:py-3">
            <summary className="flex min-h-11 cursor-pointer items-center text-xs font-bold uppercase tracking-[0.1em] text-[var(--navy)]">
              What this assistant can and cannot do
            </summary>
            <ul className="mt-3 grid gap-2 text-sm leading-6 text-stone-600">
              <li>
                It is an AI model answering in its own words, not a search of the destination, hotel and kosher pages on
                this site. Those pages name a source for each detail; the assistant does not, and it can be wrong or out
                of date about a particular place.
              </li>
              <li>
                Treat anything it says about a hechsher, a minyan, opening hours, prices or border and travel conditions
                as a starting point to confirm — with the place itself, with the local kehilla, or with us.
              </li>
              <li>
                It answers kosher-travel questions only, and it declines the rest. Kosher food means actually kosher —
                not kosher-style, and not Israeli-style as a stand-in.
              </li>
              <li>
                Your question is sent to the AI provider to be answered. We keep no copy of it and no conversation
                history: leaving this page ends it.
              </li>
            </ul>
          </details>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
            className="mt-5 flex flex-col gap-3 sm:flex-row"
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              aria-label="Ask the travel assistant a question"
              placeholder="e.g. A week in July with the children"
              className="w-full rounded-md border border-[var(--gold-light)] bg-white px-4 py-3 text-sm text-[var(--navy)] shadow-sm focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]"
            />
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 shrink-0 border border-[var(--navy)] bg-[var(--navy)] px-6 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] hover:border-[var(--gold)] disabled:opacity-60"
            >
              {busy ? "Thinking…" : "Ask"}
            </button>
          </form>

          {/* Beside the box they type into, not buried in the fold above it. */}
          <p className="mt-3 text-xs leading-5 text-stone-500">{ASSISTANT_INPUT_NOTICE}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {visible.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setQuestion(ex);
                  ask(ex);
                }}
                className="min-h-11 border border-[var(--gold-light)] px-3 py-1.5 text-[11px] text-stone-600 transition hover:bg-[var(--cream-deep)]"
              >
                {ex}
              </button>
            ))}
            {EXAMPLES.length > VISIBLE_EXAMPLES ? (
              <button
                type="button"
                onClick={() => setShowMoreExamples((v) => !v)}
                className="min-h-11 border border-dashed border-[var(--gold)] px-3 py-1.5 text-[11px] font-semibold text-[var(--navy)] transition hover:bg-[var(--cream-deep)]"
              >
                {showMoreExamples ? "Fewer examples" : "More examples"}
              </button>
            ) : null}
          </div>

          {answer && (
            /* NOT STYLED LIKE THE REST OF THE SITE, on purpose. Editorial
               content is navy on cream with a gold rule; this is a dashed
               border on plain white with the label above the words, so an
               answer can never be mistaken at a glance for a page somebody
               checked. */
            <section
              aria-label="AI-generated answer"
              className="mt-5 rounded-lg border-2 border-dashed border-[var(--gold)] bg-white"
            >
              <p className="flex flex-wrap items-center gap-2 border-b border-dashed border-[var(--gold-light)] px-4 py-2 text-[11px] font-bold tracking-[0.02em] text-[var(--gold-ink)]">
                <Icon name="sparkle" className="h-3.5 w-3.5" aria-hidden="true" />
                {ANSWER_LABEL}
              </p>
              <div className={`overflow-y-auto overscroll-contain p-4 text-sm leading-6 text-stone-700 ${expanded ? "" : "max-h-80"}`}>
                <AssistantAnswer answer={answer} />
              </div>
              {sources.length > 0 && (
                /* Shown only when the answer actually pointed at a published
                   page — and it sits UNDER the label above, which stays put:
                   the information is ours, this answer about it still is not
                   something anybody read. */
                <div className="border-t border-dashed border-[var(--gold-light)] px-4 py-3">
                  <p className="text-[11px] font-bold tracking-[0.02em] text-[var(--navy)]">{SOURCED_LABEL}</p>
                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {sources.map((source) => (
                      <li key={source.href}>
                        <Link
                          href={source.href}
                          className="text-xs font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2"
                        >
                          {source.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-[var(--gold-light)] px-4 py-2">
                <p className="text-[11px] text-stone-500">{ASSISTANT_INPUT_NOTICE}</p>
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2"
                >
                  {expanded ? "Collapse" : "Expand full answer"}
                </button>
              </div>
            </section>
          )}
          {note && <p className="mt-5 text-sm font-semibold text-stone-500">{note}</p>}
        </div>
      )}
    </div>
  );
}
