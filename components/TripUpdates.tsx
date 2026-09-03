import Link from "next/link";
import { tripUpdatesFor } from "@/lib/trip-updates-data";
import type { TripUpdate } from "@/lib/trip-updates";

/**
 * WHAT HAS CHANGED ON THE TRIP YOU ARE ABOUT TO TAKE.
 *
 * An async server component: it reads, decides and draws, and asks the browser
 * for nothing. Everything in it is information the site already held — a
 * flight-status reading, the State Department's advisory, the owner's dated
 * notice about a place — gathered here because the page where somebody's trips
 * are is the page where "is anything different?" gets asked.
 *
 * DRAWS NOTHING WHEN NOTHING HAS CHANGED, which is most of the time and is the
 * point. A standing "Trip updates" heading with an empty box under it tells a
 * reader the site is watching their trip and then shows them it is not; the
 * absence of this block is the honest version of "nothing to report".
 *
 * AND IT IS NOT A SECOND COMMAND CENTRE. Every row links to where the full
 * version already lives — the trip's own page for a flight or an advisory, the
 * destination's page for a notice — rather than reproducing it here.
 */

const TONES: Record<TripUpdate["tone"], string> = {
  ok: "border-emerald-600",
  caution: "border-amber-500",
  warn: "border-orange-600",
  danger: "border-red-600",
  unknown: "border-[var(--gold)]",
};

export default async function TripUpdates({ email, today }: { email: string; today: string }) {
  const { trip, updates } = await tripUpdatesFor(email, today);
  if (!trip || updates.length === 0) return null;

  return (
    <section aria-labelledby="trip-updates-heading" className="mt-10">
      <h2 id="trip-updates-heading" className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
        Changes on {trip.name || "your trip"}
      </h2>
      <ul className="mt-4 flex flex-col gap-3">
        {updates.map((update) => (
          <li key={update.id} className={`rounded-lg border-l-4 bg-[#fcfaf6] px-4 py-3 ${TONES[update.tone]}`}>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">{update.label}</p>
            <p className="mt-1 font-semibold leading-6 text-[var(--navy)]">{update.title}</p>
            <p className="mt-0.5 text-sm leading-6 text-stone-600">{update.detail}</p>
            {update.href &&
              (update.external ? (
                <a
                  href={update.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-1 inline-block text-xs font-bold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4"
                >
                  Read it at the source
                </a>
              ) : (
                <Link
                  href={update.href}
                  className="mt-1 inline-block text-xs font-bold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4"
                >
                  See the detail
                </Link>
              ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
