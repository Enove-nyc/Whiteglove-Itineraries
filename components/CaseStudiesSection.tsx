import Link from "next/link";
import type { CaseStudy } from "@/data/case-studies";
import { caseStudiesPageShouldExist } from "@/data/case-studies";

/**
 * Public case studies — renders nothing when the list is empty.
 *
 * Deliberately separate from the sample itinerary: this is a permitted client
 * outcome, not an illustrative deliverable.
 */
export default function CaseStudiesSection({
  studies,
  variant = "embedded",
  siteBrand = "kosher",
}: {
  studies: CaseStudy[];
  /** Homepage / About strip vs full page listing. */
  variant?: "embedded" | "page";
  /**
   * Which site is rendering this. /case-studies is a guide-only path
   * (middleware.ts): reached on the itineraries domain it redirects to the
   * kosher site, so the link to it is not offered there. The strip itself
   * still shows — the trips are real either way — it is only the door to a
   * page that does not exist here that goes.
   */
  siteBrand?: "kosher" | "itineraries";
}) {
  if (studies.length === 0) return null;

  const showPageLink =
    variant === "embedded" && siteBrand !== "itineraries" && caseStudiesPageShouldExist(studies);

  return (
    <section
      aria-labelledby="case-studies-heading"
      className={
        variant === "page"
          ? "mx-auto max-w-7xl px-5 py-4 sm:px-8"
          : "mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16"
      }
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">From real trips</p>
      <h2
        id="case-studies-heading"
        className="mt-3 max-w-3xl font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--navy)] sm:text-4xl"
      >
        What a trip looked like for someone else.
      </h2>
      <p className="mt-4 max-w-2xl leading-7 text-stone-600">
        Each note below is a real outcome, published only with permission. This is not the sample itinerary — that
        page shows the shape of a deliverable; these are outcomes.
      </p>
      <ul className="mt-10 grid gap-8 lg:grid-cols-2">
        {studies.map((study) => (
          <li key={study.id} className="border-t border-[var(--gold-light)] pt-5">
            <article>
              <header>
                <p className="text-sm font-semibold text-[var(--navy)]">
                  {study.attribution}
                  {study.anonymised && (
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.1em] text-stone-500">
                      Name withheld
                    </span>
                  )}
                </p>
                {(study.location || study.tripType) && (
                  <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">
                    {[study.tripType, study.location].filter(Boolean).join(" · ")}
                  </p>
                )}
              </header>
              {study.quote && (
                <blockquote className="mt-3 text-sm leading-7 text-stone-700">
                  <p>“{study.quote}”</p>
                </blockquote>
              )}
              <p className="mt-3 text-sm leading-6 text-stone-600">
                <span className="font-semibold text-stone-700">They asked for: </span>
                {study.tripRequest}
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                <span className="font-semibold text-stone-700">What we solved: </span>
                {study.whatSolved}
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                <span className="font-semibold text-stone-700">Result: </span>
                {study.outcome}
              </p>
              {study.itineraryHref && (
                <p className="mt-3">
                  <Link
                    href={study.itineraryHref}
                    className="text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
                  >
                    Related page on this site →
                  </Link>
                </p>
              )}
            </article>
          </li>
        ))}
      </ul>
      {showPageLink && (
        <p className="mt-10">
          <Link
            href="/case-studies"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
          >
            More case studies →
          </Link>
        </p>
      )}
    </section>
  );
}
