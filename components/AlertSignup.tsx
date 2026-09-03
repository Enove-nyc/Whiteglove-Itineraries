"use client";

import { useState } from "react";
import { ACTION_BUTTON_CLASS } from "@/lib/action-button";
import {
  ALERT_TOPIC_BLURBS,
  ALERT_TOPIC_LABELS,
  type AlertTopic,
  alertCopy,
  defaultTopicsFor,
} from "@/lib/email-alerts";

const inputClass =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-base text-[var(--navy)] shadow-sm focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)] sm:text-sm";

type Kind = "destination" | "seasonal" | "search_miss" | "general";

export default function AlertSignup({
  kind = "general",
  destinationName,
  destinationSlug,
  destinationQuery,
  sourcePage,
  topics,
  preselect,
  className,
}: {
  kind?: Kind;
  destinationName?: string;
  destinationSlug?: string;
  destinationQuery?: string;
  sourcePage?: string;
  /** Which topics are offered at all. */
  topics?: AlertTopic[];
  /**
   * Which of them start ticked. Defaults to all of the offered ones, which is
   * right where the form offers the two things the page is about — and wrong
   * on a page that offers every topic there is, where arriving to find them
   * all ticked is not a choice anybody made.
   */
  preselect?: AlertTopic[];
  className?: string;
}) {
  const copy = alertCopy({ kind, destinationName });
  const available = topics ?? defaultTopicsFor(kind);
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<AlertTopic[]>(preselect ?? available);
  const [place, setPlace] = useState(destinationQuery ?? destinationName ?? "");
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function toggle(topic: AlertTopic) {
    setSelected((prev) => (prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    const res = await fetch("/api/alerts/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        topics: selected,
        destinationSlug,
        destinationQuery: place.trim() || destinationQuery,
        sourcePage: sourcePage || (typeof window !== "undefined" ? window.location.pathname : "/"),
        consented,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Something went wrong. Please try again.");
      return;
    }
    setSuccess(typeof data.message === "string" ? data.message : "You are signed up.");
  }

  return (
    <section
      className={
        className ??
        "rounded-xl border border-[var(--gold-light)] bg-[#FAF8F3] px-5 py-6 sm:px-7 sm:py-8"
      }
      aria-labelledby="alert-signup-heading"
    >
      <h2 id="alert-signup-heading" className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)] sm:text-3xl">
        {copy.heading}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">{copy.intro}</p>

      {success ? (
        <p role="status" className="mt-5 text-sm font-semibold text-[var(--navy)]">
          {success}
        </p>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="alert-email" className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-600">
              Email
            </label>
            <input
              id="alert-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              disabled={busy}
            />
          </div>

          {(kind === "destination" || kind === "search_miss" || selected.includes("destination_updates")) && (
            <div>
              <label htmlFor="alert-place" className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-600">
                Destination
              </label>
              <input
                id="alert-place"
                type="text"
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                className={inputClass}
                disabled={busy || Boolean(destinationSlug && destinationName)}
                placeholder="e.g. Lake Como"
              />
            </div>
          )}

          <fieldset>
            <legend className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-600">What to send</legend>
            <ul className="mt-2 space-y-2">
              {available.map((topic) => (
                <li key={topic}>
                  <label className="flex cursor-pointer gap-3 text-sm leading-6 text-stone-700">
                    <input
                      type="checkbox"
                      checked={selected.includes(topic)}
                      onChange={() => toggle(topic)}
                      disabled={busy}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-semibold text-[var(--navy)]">{ALERT_TOPIC_LABELS[topic]}</span>
                      <span className="block text-stone-500">{ALERT_TOPIC_BLURBS[topic]}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          <label className="flex cursor-pointer gap-3 text-sm leading-6 text-stone-700">
            <input
              type="checkbox"
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
              disabled={busy}
              className="mt-1"
              required
            />
            <span>
              I agree to receive the updates I chose from White Glove Kosher Travel. I can unsubscribe from any email.
            </span>
          </label>

          {error && (
            <p role="alert" className="text-sm font-semibold text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className={`inline-flex min-h-11 items-center ${ACTION_BUTTON_CLASS.primary} disabled:opacity-60`}
          >
            {busy ? "Saving…" : "Save my preferences"}
          </button>
        </form>
      )}
    </section>
  );
}
