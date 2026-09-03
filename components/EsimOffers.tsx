import { AffiliateDisclosure } from "@/components/BookingLink";
import { goHref } from "@/lib/affiliate/request";
import { configFor, defFor, offersFor } from "@/lib/travel-essentials";
import { readTravelEssentials } from "@/lib/travel-essentials-store";

/**
 * Every data provider the owner has, side by side, on the page about them.
 *
 * NOT GATED ON A PAGE-TYPE CHECKBOX, for the same reason InsurancePanel is not:
 * everywhere else the question is a judgement — does this card belong beside a
 * destination, under the planner — and here the page IS the offer. Asking the
 * owner to tick a box to put eSIM links on the eSIM page is friction with no
 * decision inside it, and it is exactly how the transfers page shipped empty.
 *
 * SIDE BY SIDE AND EACH NAMED, because the traveller is choosing between them.
 * A provider with no name is not shown at all: two cards in one category are
 * told apart by their labels, and an unnamed one is indistinguishable from the
 * first. Same rule as offersFor, which is where it is enforced.
 *
 * Renders nothing when no provider is live. The page around it still says what
 * an eSIM is and what to check before buying one, which is worth reading
 * whether or not this site can sell you anything.
 */
export default async function EsimOffers() {
  const settings = await readTravelEssentials();
  if (!settings.sectionEnabled) return null;

  const def = defFor("esim");
  const offers = offersFor(def, configFor(settings, def));
  if (offers.length === 0) return null;

  return (
    <section
      className="border-y border-[var(--gold-light)] bg-[#FAF8F3] px-5 py-14 sm:px-8 sm:py-16"
      aria-labelledby="esim-offers-heading"
    >
      <div className="mx-auto max-w-6xl">
        <h2
          id="esim-offers-heading"
          className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]"
        >
          {offers.length > 1 ? "Where to buy one" : "Buy a data plan"}
        </h2>
        <p className="mt-2 max-w-2xl leading-7 text-stone-600">
          {offers.length > 1
            ? "Both sell plans for most countries. Prices and coverage differ, so it is worth opening each one for the country you are going to."
            : "Plans, prices and coverage are the provider's. Check the country you are going to is included before you buy."}
        </p>

        <ul className="mt-8 grid gap-5 sm:grid-cols-2">
          {offers.map((offer) => (
            <li key={offer.offer}>
              <a
                href={goHref({
                  product: "esim",
                  page: "/esim",
                  placement: `esim-page${offer.offer > 0 ? `-${offer.offer}` : ""}`,
                  campaignId: "essentials_esim",
                  offer: offer.offer,
                })}
                target="_blank"
                rel="sponsored noopener noreferrer"
                className="flex h-full flex-col justify-between rounded-2xl border border-[var(--gold-light)] bg-[var(--surface)] p-6 transition hover:border-[var(--gold)]"
              >
                <div>
                  <p className="text-lg leading-none text-[var(--gold-ink)]" aria-hidden="true">
                    {def.icon}
                  </p>
                  <h3 className="mt-3 font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]">
                    {offer.label.trim() || def.name}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">{offer.blurb.trim() || def.blurb}</p>
                </div>
                <span className="mt-6 inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">
                  {offer.cta.trim() || def.cta}
                  <span className="sr-only"> — opens in a new tab</span>
                </span>
              </a>
            </li>
          ))}
        </ul>

        <AffiliateDisclosure className="mt-6 max-w-2xl text-xs leading-5 text-stone-500" />
      </div>
    </section>
  );
}
