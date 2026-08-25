import Link from "next/link";
import { startingPointsExcept } from "@/lib/starting-points";
import { readBookingLink } from "@/lib/booking-access-store";

/**
 * "Which of these is the one I want?"
 *
 * The three free ways in — get recommendations, build it yourself, search
 * booking partners — shown side by side with what each one actually does, so
 * the choice is made once rather than by trial and error through the
 * navigation. The wording is not written here: it comes from
 * lib/starting-points.ts, which is the single place any of the doors is
 * named.
 *
 * Personal planning is not one of them and is not a call-out here at all —
 * removed at the owner's word, not merely left off this list.
 */
export default async function StartingPoints({
  omit = [],
  heading = "Ways to start",
  intro,
  deemphasize = [],
}: {
  omit?: string[];
  heading?: string;
  intro?: string;
  /**
   * Hrefs to show with less visual weight than the others — still a real
   * door, still named and linked the same as everywhere else, just not
   * competing for attention. Get recommendations earns revenue and stays on
   * the page; it does not have to stay the same size as the doors the owner
   * wants leading.
   */
  deemphasize?: string[];
}) {
  const points = startingPointsExcept(...omit);
  if (points.length === 0) return null;

  // /book can be locked, and middleware then sends a visitor pressing it to the
  // access-code box. Every other booking CTA resolves through the booking lock
  // first — so this door does too, taking its href and label from the resolved
  // link (the search when open, the contact page when it is closed).
  const booking = await readBookingLink();

  return (
    <div className="rounded-2xl border border-[var(--gold-light)] bg-[var(--surface)] p-6 sm:p-9">
      <h2 className="font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--navy)] sm:text-4xl">
        {heading}
      </h2>
      {intro && <p className="mt-3 max-w-2xl leading-7 text-stone-600">{intro}</p>}

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {points.map((point) => {
          const low = deemphasize.includes(point.href);
          const isBooking = point.href === "/book";
          const href = isBooking ? booking.href : point.href;
          const label = isBooking ? booking.label : point.label;
          return (
            <li key={point.href} className={low ? "sm:self-end" : undefined}>
              <Link
                href={href}
                className={
                  low
                    ? "group flex h-full flex-col rounded-2xl border border-transparent p-5 transition hover:border-[var(--gold-light)]"
                    : "wg-card group flex h-full flex-col border border-[var(--gold-light)] bg-[#fcfaf6] p-5"
                }
              >
                <span
                  className={
                    low
                      ? "block text-base font-semibold leading-tight text-stone-600 group-hover:text-[var(--navy)]"
                      : "block font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]"
                  }
                >
                  {label}
                </span>
                <span className={low ? "mt-2 flex-1 text-xs leading-5 text-stone-500" : "mt-3 flex-1 text-sm leading-6 text-stone-600"}>
                  {point.body}
                </span>
                <span
                  className={
                    low
                      ? "mt-3 text-xs font-semibold text-stone-500 transition group-hover:text-[var(--gold-ink)]"
                      : "mt-5 text-sm font-semibold text-[var(--navy)] transition group-hover:text-[var(--gold-ink)]"
                  }
                >
                  {point.cta} →
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
