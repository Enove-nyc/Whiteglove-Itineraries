import { AffiliateDisclosure } from "@/components/BookingLink";
import { readAffiliateConfig } from "@/lib/affiliate/config";
import {
  essentialsForContext,
  type EssentialContext,
  type EssentialPageType,
} from "@/lib/travel-essentials";
import { readTravelEssentials } from "@/lib/travel-essentials-store";

/**
 * Reusable Travel Essentials row — destination, itinerary, or booking pages.
 *
 * Landing products (eSIM, insurance, transfers, tours, programmes) are a
 * tracked link, not a form. This site cannot show their results, so collecting
 * a city or dates here only makes the traveller type them twice. Search
 * products (flights, hotels, cars) still go through /go with what the trip
 * already knows. No invented partners, prices, or “recommended” claims.
 */

const DISCLOSURE =
  "We may earn a commission from qualifying bookings, at no additional cost to you.";

export default async function TravelEssentials({
  pageType,
  destinationName,
  destinationSlug,
  checkIn,
  checkOut,
  from,
  to,
  adults,
  heading,
  intro,
  placement,
}: {
  pageType: EssentialPageType;
  destinationName?: string;
  destinationSlug?: string;
  checkIn?: string;
  checkOut?: string;
  from?: string;
  to?: string;
  adults?: number;
  heading?: string;
  intro?: string;
  /** Click-reporting placement prefix. */
  placement?: string;
}) {
  const [settings, affiliate] = await Promise.all([readTravelEssentials(), readAffiliateConfig()]);
  if (!settings.sectionEnabled) return null;

  // Where the click is recorded as having happened. Named per page type
  // rather than defaulting everything that is not a destination or the planner
  // to /book — the transfers page would otherwise report its clicks against
  // the booking page, and the one number that says whether that page earns its
  // place would be credited to another.
  const page =
    pageType === "destination" && destinationSlug
      ? `/destinations/${destinationSlug}`
      : pageType === "itinerary"
        ? "/itinerary"
        : pageType === "transfers"
          ? "/transfers"
          : pageType === "things-to-do"
            ? "/things-to-do"
            : "/book";

  const ctx: EssentialContext = {
    pageType,
    destinationName,
    destinationSlug,
    checkIn,
    checkOut,
    from,
    to,
    adults,
    page,
    placement: placement ?? `${pageType}-essentials`,
  };

  // Tours have their own panel on Things to do — same offer, one CTA, not two.
  const cards = essentialsForContext(settings, affiliate, ctx).filter(
    (card) => !(pageType === "things-to-do" && card.id === "activity"),
  );
  if (cards.length === 0) return null;

  const title =
    heading ??
    (pageType === "destination" && destinationName
      ? `Travel essentials for ${destinationName}`
      : pageType === "itinerary"
        ? "Travel essentials for this trip"
        : "Once the flights are booked");

  const lead =
    intro ??
    (pageType === "book"
      ? "The rest of what a trip often needs. Each link opens with the provider, who handles the purchase and its terms."
      : "Practical add-ons when you are ready — only options we can actually hand off are listed.");

  return (
    <section
      className="border-t border-[var(--gold-light)] bg-[#FAF8F3] px-5 py-14 sm:px-8 sm:py-16"
      aria-labelledby="travel-essentials-heading"
      data-travel-essentials={pageType}
    >
      <div className="mx-auto max-w-6xl">
        <h2
          id="travel-essentials-heading"
          className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]"
        >
          {title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">{lead}</p>
        {settings.showDisclosure ? (
          <p className="mt-3 max-w-2xl text-xs leading-5 text-stone-500">
            <span className="font-semibold text-[var(--navy)]">How this site is paid: </span>
            {DISCLOSURE} Full details are in our Terms.
          </p>
        ) : (
          <AffiliateDisclosure className="mt-3 max-w-2xl text-xs leading-5 text-stone-500" />
        )}

        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <li key={`${card.id}-${card.offer}`}>
              <a
                href={card.href}
                target="_blank"
                rel="sponsored noopener noreferrer"
                className="flex h-full flex-col justify-between border-t border-[var(--gold-light)] bg-transparent pt-5 transition hover:border-[var(--gold)]"
              >
                <div>
                  <p className="text-lg leading-none text-[var(--gold-ink)]" aria-hidden="true">
                    {card.icon}
                  </p>
                  <h3 className="mt-3 font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--navy)]">
                    {card.name}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">{card.blurb}</p>
                </div>
                <span className="mt-5 inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">
                  {card.cta}
                  <span className="sr-only"> — opens in a new tab</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
