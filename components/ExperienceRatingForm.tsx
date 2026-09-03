"use client";

import { useMemo, useState } from "react";
import { useRequireSignIn } from "@/components/SignInGate";
import { useSignedIn } from "@/lib/use-signed-in";
import {
  SCORE_LABELS,
  RATING_SCORES,
  ratingProblem,
  type RatingKind,
  type RatingScore,
} from "@/lib/experience-ratings";

const field =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] shadow-sm focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const labelClass = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-600";

/**
 * How a place or a trip went — private to White Glove, not a public review wall.
 */

export default function ExperienceRatingForm({
  kind,
  refId,
  label,
  compact = false,
}: {
  kind: RatingKind;
  refId: string;
  label: string;
  /** Inside a card or the trip strip, without the page-scale heading. */
  compact?: boolean;
}) {
  const signedIn = useSignedIn();
  const requireSignIn = useRequireSignIn();
  const [score, setScore] = useState<RatingScore | 0>(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const about = useMemo(() => label.trim() || "this", [label]);
  // A trip rating is feedback about White Glove during the trip, not a report
  // on how the trip itself went — the site did not arrange the trip, so it asks
  // only about its own part. A listing rating stays about the place.
  const isTrip = kind === "trip";
  const subject = isTrip ? "White Glove" : about;

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const problem = ratingProblem({ kind, ref: refId, label, score, name, email, note });
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ref: refId, label, score, name, email, note }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "We could not save that just now.");
        return;
      }
      setDone(true);
    } catch {
      setError("We could not save that just now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (signedIn === false) {
    return (
      <div className={compact ? "mt-4 border-t border-[var(--gold-light)] pt-4" : ""}>
        <p className="text-sm leading-6 text-stone-600">Sign in to rate {subject}.</p>
        <button
          type="button"
          onClick={() => requireSignIn(() => undefined, "Sign in to rate")}
          className="mt-3 inline-flex min-h-11 items-center border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white"
        >
          Sign in to rate
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className={compact ? "mt-4 border-t border-[var(--gold-light)] pt-4" : ""}>
        <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Thank you.</p>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          We have what you wrote about {subject}. It stays with us — nothing is published from this form.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={send}
      className={
        compact
          ? "mt-4 space-y-4 border-t border-[var(--gold-light)] pt-4"
          : "space-y-5 border border-[var(--gold-light)] bg-[#FAF8F3] p-6 sm:p-8"
      }
    >
      {!compact && (
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">{isTrip ? "After your trip" : "How it went"}</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">
            {isTrip ? "How was White Glove?" : about}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
            {isTrip
              ? "A short note for White Glove about how it did during your trip — how the site and its information held up, not how the trip itself went. Not a public review."
              : "A short note for White Glove — not a public review. Say how the place felt from where you stood."}
          </p>
        </div>
      )}

      {compact && (
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">
          {isTrip ? "How was White Glove during your trip?" : `How did ${about} go?`}
        </p>
      )}

      <fieldset>
        <legend className={labelClass}>Your sense of it</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {RATING_SCORES.map((value) => {
            const selected = score === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setScore(value)}
                aria-pressed={selected}
                className={`min-h-11 min-w-[7.5rem] flex-1 border px-3 py-2 text-left transition sm:min-w-0 ${
                  selected
                    ? "border-[var(--navy)] bg-[var(--navy)] text-white"
                    : "border-[var(--gold-light)] bg-white text-[var(--navy)] hover:border-[var(--gold)]"
                }`}
              >
                <span className="block text-sm font-bold leading-5">{SCORE_LABELS[value]}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelClass}>Your name</span>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </label>
        <label className="block">
          <span className={labelClass}>Email</span>
          <input
            className={field}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
      </div>

      <label className="block">
        <span className={labelClass}>A few words, if you like</span>
        <textarea
          className={field}
          rows={compact ? 3 : 4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={isTrip ? "What helped, what was missing, what you'd tell a friend about White Glove." : "What helped, what was missing, what you would tell a friend."}
          maxLength={2000}
        />
      </label>

      {error && <p className="text-sm text-red-800">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex min-h-11 items-center border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)] disabled:opacity-60"
      >
        {busy ? "Sending…" : "Send this"}
      </button>
    </form>
  );
}
