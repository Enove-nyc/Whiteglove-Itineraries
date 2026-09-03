import { AMAZON_DISCLOSURE, ctaFor, needsAmazonDisclosure, shownToVisitors, type TravelExtra } from "@/lib/travel-extras";

/**
 * The eSIM, the insurance, the transfer — under the search, not above it.
 *
 * NOT HEADED "BEFORE YOU TRAVEL": the safety notice on this same page already
 * opens with those words, and a browser check found the two sitting one above
 * the other. Two unrelated things under one heading is how somebody comes to
 * read a row of purchases as the site's travel advice.
 *
 * PLACED WHERE IT IS BECAUSE OF WHO IS READING IT. Somebody who has just
 * searched a flight has dates in their head and a trip that has become real;
 * that is the moment a data plan or a policy is worth thinking about. The same
 * cards at the top of the page would be a row of adverts in front of the thing
 * they came for.
 *
 * NOTHING IS RECOMMENDED HERE. The owner writes the name and the line under it,
 * and the site does not add a word about which is better or what anybody should
 * buy — travel insurance especially is not something this page should be giving
 * advice about. The links open in a new tab so the search they were in the
 * middle of is still there behind them.
 */
export default function TravelExtras({
  extras,
  heading = "Once the flights are booked",
  intro = "The rest of what a trip needs. Each one opens with the provider, who handles the purchase and anything you need to ask about it.",
}: {
  extras: TravelExtra[];
  /**
   * The words over the row, which depend on where it is.
   *
   * On /book the reader has just searched a flight. On a destination page they
   * have been reading about a place and have not booked anything, so "once the
   * flights are booked" would be talking about something that has not
   * happened. Same links, same rule about recommending nothing — only the
   * sentence that introduces them moves.
   */
  heading?: string;
  intro?: string;
}) {
  const shown = shownToVisitors(extras);
  if (shown.length === 0) return null;
  // Amazon's own wording, shown only when an Amazon link is actually here.
  const amazon = needsAmazonDisclosure(extras);

  return (
    <section className="border-t border-[var(--gold-light)] bg-[#FAF8F3] px-5 py-14 sm:px-8 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">{heading}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">{intro}</p>
        {amazon && (
          <p className="mt-3 max-w-2xl text-xs leading-5 text-stone-500">{AMAZON_DISCLOSURE}</p>
        )}

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((extra) => (
            <a
              key={extra.id}
              href={extra.url}
              target="_blank"
              rel="noreferrer sponsored"
              className="flex flex-col justify-between rounded-2xl border border-[var(--gold-light)] bg-white p-6 shadow-[0_8px_24px_rgba(16, 47, 53,.05)] transition hover:border-[var(--gold)] hover:shadow-[0_14px_34px_rgba(16, 47, 53,.09)]"
            >
              <div>
                <h3 className="font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--navy)]">{extra.name}</h3>
                {extra.blurb.trim() && <p className="mt-2 text-sm leading-6 text-stone-600">{extra.blurb}</p>}
              </div>
              <span className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">{ctaFor(extra)}</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
