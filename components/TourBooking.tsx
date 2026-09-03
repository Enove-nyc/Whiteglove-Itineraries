import { AffiliateDisclosure } from "@/components/BookingLink";
import { goHref } from "@/lib/affiliate/request";
import { configFor, defFor, essentialIsBookable, offersFor } from "@/lib/travel-essentials";
import { readTravelEssentials } from "@/lib/travel-essentials-store";

/**
 * Tickets and guided visits, as a tracked hand-off.
 *
 * Not a form. This site cannot list tour results, so a city picker here only
 * makes the traveller choose again on the partner. Destination pages still
 * pass the place they are about through /go when Stay22 can carry it; this
 * page does not ask for one.
 *
 * Not gated on a page-type checkbox — this page is the offer. Disabled or
 * unconfigured renders nothing.
 */

export default async function TourBooking() {
  const settings = await readTravelEssentials();
  if (!essentialIsBookable("activity", settings)) return null;

  const def = defFor("activity");
  const offers = offersFor(def, configFor(settings, def));
  if (offers.length === 0) return null;

  return (
    <section
      className="border-t border-[var(--gold-light)] bg-[#FAF8F3] px-5 py-14 sm:px-8 sm:py-16"
      aria-labelledby="tour-booking-heading"
    >
      <div className="mx-auto max-w-6xl">
        <h2 id="tour-booking-heading" className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">
          Tickets and guided visits
        </h2>
        <p className="mt-2 max-w-2xl leading-7 text-stone-600">
          For the places above that need booking ahead. Opens with our tours partner, who sets the price, the times
          and the terms. Check what a place does on Shabbos above before you book a date.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
          {offers.map((offer) => (
            <a
              key={offer.offer}
              href={goHref({
                product: "activity",
                page: "/things-to-do",
                placement: `things-to-do-panel${offer.offer > 0 ? `-${offer.offer}` : ""}`,
                campaignId: "essentials_activity",
                offer: offer.offer,
              })}
              target="_blank"
              rel="sponsored noopener noreferrer"
              className="inline-flex min-h-12 items-center rounded-md border border-[var(--navy)] bg-[var(--navy)] px-7 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]"
            >
              {offer.cta.trim() || def.cta}
              {offer.label.trim() && offers.length > 1 ? ` — ${offer.label.trim()}` : ""}
            </a>
          ))}
        </div>

        <AffiliateDisclosure className="mt-6 max-w-2xl text-xs leading-5 text-stone-500" />
      </div>
    </section>
  );
}
