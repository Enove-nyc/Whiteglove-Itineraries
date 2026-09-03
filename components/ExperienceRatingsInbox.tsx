"use client";

import { useMemo, useState } from "react";
import {
  SCORE_LABELS,
  filterExperienceRatings,
  ratingSummary,
  type ExperienceRating,
} from "@/lib/experience-ratings";
import { REVIEW_SCORE_LABELS, type PlaceReview } from "@/lib/place-reviews";

export default function ExperienceRatingsInbox({
  ratings,
  reported,
}: {
  ratings: ExperienceRating[];
  reported: PlaceReview[];
}) {
  const [kind, setKind] = useState("all");
  const [score, setScore] = useState("all");
  const [query, setQuery] = useState("");
  const shown = useMemo(
    () => filterExperienceRatings(ratings, { kind, q: query, score: score === "all" ? "" : score }),
    [ratings, kind, query, score],
  );

  const fieldClass =
    "mt-1 w-full border border-[var(--gold-light)] bg-white px-3 py-2 text-sm text-[var(--navy)] outline-none focus:border-[var(--gold)]";

  return (
    <>
      {ratings.length === 0 ? (
        <p className="mt-10 max-w-xl text-sm leading-6 text-stone-600">
          Nothing yet. Travellers rate from a listing, a finished trip, or{" "}
          <code className="text-[var(--navy)]">/rate</code>.
        </p>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">
              Search
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Place, name, email…"
                className={fieldClass}
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">
              Kind
              <select value={kind} onChange={(event) => setKind(event.target.value)} className={fieldClass}>
                <option value="all">Everything</option>
                <option value="listing">Listing</option>
                <option value="place">Place</option>
                <option value="destination">Destination</option>
                <option value="trip">Trip</option>
              </select>
            </label>
            <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">
              How it went
              <select value={score} onChange={(event) => setScore(event.target.value)} className={fieldClass}>
                <option value="all">Any</option>
                <option value="1">{SCORE_LABELS[1]}</option>
                <option value="2">{SCORE_LABELS[2]}</option>
                <option value="3">{SCORE_LABELS[3]}</option>
              </select>
            </label>
          </div>
          <p className="mt-4 text-sm text-stone-600">
            {shown.length === ratings.length
              ? `${ratings.length} on file.`
              : `${shown.length} of ${ratings.length} match.`}
          </p>
          {shown.length === 0 ? (
            <p className="mt-6 text-sm text-stone-600">Nothing matches those filters.</p>
          ) : (
            <ul className="mt-6 space-y-4">
              {shown.map((rating) => (
                <li key={rating.id} className="border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">
                    {ratingSummary(rating)}
                  </p>
                  <p className="mt-2 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
                    {SCORE_LABELS[rating.score]}
                  </p>
                  {rating.note ? <p className="mt-3 text-sm leading-6 text-stone-700">{rating.note}</p> : null}
                  <p className="mt-3 text-sm text-stone-500">
                    {rating.name} ·{" "}
                    <a href={`mailto:${encodeURIComponent(rating.email)}`} className="underline decoration-[var(--gold-light)]">
                      {rating.email}
                    </a>{" "}
                    · {new Date(rating.at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <section className="mt-14">
        <h2 className="font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--navy)]">
          Reported reviews
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          Public reviews a reader has flagged. They stay on the site until you act. Remove takes one down for good —
          the writer cannot edit it back or write a fresh one for the same place.
        </p>
        {reported.length === 0 ? (
          <p className="mt-6 max-w-xl text-sm leading-6 text-stone-600">Nothing reported.</p>
        ) : (
          <ul className="mt-6 space-y-4">
            {reported.map((review) => (
              <li key={review.id} className="border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">
                  {review.reportCount} {review.reportCount === 1 ? "report" : "reports"} · {review.placeKind} ·{" "}
                  {review.placeLabel}
                </p>
                <p className="mt-2 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
                  {REVIEW_SCORE_LABELS[review.score]}
                </p>
                {review.text ? <p className="mt-3 text-sm leading-6 text-stone-700">{review.text}</p> : null}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-stone-500">
                    {review.authorName || "No name given"} ·{" "}
                    <a
                      href={`mailto:${encodeURIComponent(review.authorEmail)}`}
                      className="underline decoration-[var(--gold-light)]"
                    >
                      {review.authorEmail}
                    </a>{" "}
                    · {new Date(review.at).toLocaleString()}
                  </p>
                  <form
                    method="post"
                    action="/api/admin/reviews"
                    onSubmit={(event) => {
                      if (!window.confirm(`Remove the review of “${review.placeLabel}”? It cannot be put back.`)) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="id" value={review.id} />
                    <button
                      type="submit"
                      className="min-h-11 rounded-full border border-[var(--navy)] px-5 text-sm font-semibold text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-[var(--cream)]"
                    >
                      Remove
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
