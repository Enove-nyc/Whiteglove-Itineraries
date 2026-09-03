import { AffiliateDisclosure } from "@/components/BookingLink";
import { goHref } from "@/lib/affiliate/request";
import { configFor, defFor, essentialIsBookable, offersFor } from "@/lib/travel-essentials";
import { readTravelEssentials } from "@/lib/travel-essentials-store";

/**
 * The transfer hand-off, given the weight of a booking panel.
 *
 * Not a form. Kiwitaxi and similar publish no search this site can show, so
 * collecting an airport or a date here only makes the traveller type it again
 * on the partner. One tracked link; they complete the booking there.
 *
 * Not gated on a page-type checkbox — this page is the offer. Disabled or
 * unconfigured renders nothing.
 */

export default async function TransferBooking() {
  const settings = await readTravelEssentials();
  if (!essentialIsBookable("transfer", settings)) return null;

  const def = defFor("transfer");
  const offers = offersFor(def, configFor(settings, def));
  if (offers.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-5 pt-10 sm:px-8" aria-labelledby="transfer-booking-heading">
      <div className="rounded-3xl border border-[var(--gold-light)] bg-[var(--surface)] p-6 shadow-[0_18px_45px_rgba(16, 47, 53,.07)] sm:p-8">
        <h2
          id="transfer-booking-heading"
          className="font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--navy)]"
        >
          Book an airport transfer
        </h2>
        <p className="mt-2 max-w-2xl leading-7 text-stone-600">
          A transfer booked in advance meets you at arrivals. Opens with our transfer partner, who takes the pickup,
          the flight number and the price.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4">
          {offers.map((offer) => (
            <a
              key={offer.offer}
              href={goHref({
                product: "transfer",
                page: "/transfers",
                placement: `transfers-panel${offer.offer > 0 ? `-${offer.offer}` : ""}`,
                campaignId: "essentials_transfer",
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
