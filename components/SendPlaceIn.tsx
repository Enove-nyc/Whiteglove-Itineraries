"use client";

import { useEffect, useRef, useState } from "react";
import { NEVER_SENT, type TripPlace, fieldsSent, offerTitle, submissionFor } from "@/lib/place-offers";

/**
 * "You have added somewhere we do not have. Would you send it in?"
 *
 * ASKED, NOT TAKEN. An itinerary is a private document — somebody's dates, the
 * notes they wrote to themselves, who they are going with, the reference for
 * their hotel. Reading it and turning parts of it into website content because
 * it happened to be on our server would be using something handed over for one
 * purpose for another one entirely.
 *
 * So this asks, and it shows its working: every field that would go is listed
 * with its actual value, and what would not go is written out underneath. Both
 * come from lib/place-offers.ts — the list on this screen is the same list that
 * is sent — so the notice cannot promise one thing and post another.
 *
 * A no is remembered. Being asked twice about the same hotel is how a fair
 * question turns into nagging.
 */

/** The question has been answered, either way. Which way is the notice's business. */
export type Answered = () => void;

export default function SendPlaceIn({
  place,
  from,
  onAnswered,
}: {
  place: TripPlace;
  /** The signed-in traveller. Nothing is offered to somebody we cannot credit. */
  from: { name: string; email: string };
  onAnswered: Answered;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const fields = fieldsSent(place);

  // Escape closes it, and closing without pressing anything is a no — the
  // safe answer, and the one that stops it coming back.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !sending && !sent) onAnswered();
    };
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onAnswered, sending, sent]);

  async function send() {
    setSending(true);
    setError(null);
    const response = await fetch("/api/content/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submissionFor(place, from)),
    });
    setSending(false);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error || "That could not be sent. Your trip is unchanged.");
      return;
    }
    setSent(true);
    // Left up long enough to actually be read. Two sentences at an ordinary
    // reading speed is around two and a half seconds; a shorter pause makes
    // the notice flash and somebody is left guessing whether it went.
    window.setTimeout(() => onAnswered(), 2600);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--navy)]/40 p-4 sm:items-center">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-place-in-title"
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-[var(--gold)] bg-white p-6 shadow-xl outline-none sm:p-8"
      >
        {sent ? (
          <>
            <h2 id="send-place-in-title" className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">
              Thank you — it has been sent.
            </h2>
            <p className="mt-3 text-sm leading-7 text-stone-600">
              Somebody will look at it before anything goes on the site. Your trip is unchanged.
            </p>
          </>
        ) : (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Not on the site yet</p>
            <h2 id="send-place-in-title" className="mt-2 font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--navy)]">
              {offerTitle(place)}
            </h2>
            <p className="mt-3 text-sm leading-7 text-stone-600">
              We do not have this one. Would you send it in, so the next person planning the same trip finds it?
              It is yours — nothing goes unless you say so.
            </p>

            <div className="mt-5 border border-[var(--gold-light)] bg-[#FAF8F3] p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">What would be sent</p>
              <dl className="mt-2 space-y-1.5 text-sm leading-6">
                {fields.map((field) => (
                  <div key={field.label} className="flex gap-2">
                    <dt className="shrink-0 font-semibold text-[var(--navy)]">{field.label}:</dt>
                    <dd className="break-words text-stone-600">{field.value}</dd>
                  </div>
                ))}
              </dl>
              {place.phone && (
                <p className="mt-3 text-xs leading-5 text-stone-500">
                  That includes the phone number above. If it is somebody&apos;s own number rather than the
                  place&apos;s, take it off the stop first.
                </p>
              )}
            </div>

            <div className="mt-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">What would not be sent</p>
              <ul className="mt-2 space-y-1 text-sm leading-6 text-stone-600">
                {NEVER_SENT.map((line) => (
                  <li key={line}>· {line}</li>
                ))}
              </ul>
            </div>

            <p className="mt-4 text-xs leading-5 text-stone-500">
              Sent as {from.name || from.email}. Nothing appears on the site until somebody has looked at it.
            </p>

            {error && <p className="mt-4 text-sm font-semibold text-red-700">{error}</p>}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={send}
                disabled={sending}
                className="min-h-11 rounded-md bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] disabled:opacity-50"
              >
                {sending ? "Sending…" : "Yes, send it in"}
              </button>
              <button
                type="button"
                onClick={() => onAnswered()}
                disabled={sending}
                className="min-h-11 rounded-md border border-[var(--gold-light)] px-4 text-xs font-bold uppercase tracking-[0.12em] text-stone-500 transition hover:border-[var(--gold)] disabled:opacity-50"
              >
                No, keep it to myself
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
