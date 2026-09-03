import { AffiliateDisclosure } from "@/components/BookingLink";
import { goHref } from "@/lib/affiliate/request";
import { defFor, essentialIsBookable } from "@/lib/travel-essentials";
import { readTravelEssentials } from "@/lib/travel-essentials-store";

/**
 * The insurance hand-off, on the page that is about insurance.
 *
 * NOT GATED ON A PAGE-TYPE CHECKBOX, and that is deliberate. Every other
 * surface asks whether the owner wants this card THERE — beside a destination,
 * under the planner, on the booking page — because on those pages it is one
 * offer among several and the answer is a judgement. This page is the offer.
 * If insurance is enabled at all, it belongs here, and making him tick a third
 * box to put an insurance link on the insurance page is friction with no
 * decision inside it.
 *
 * So the only question asked is the honest one: is it enabled, and does it have
 * somewhere real to go. Disabled or unconfigured renders nothing, and the page
 * is what it was — what cover usually includes, and who to ask.
 *
 * THE WORDING IS THE CAREFUL PART. No advice, no comparison this site has not
 * made, and nothing implying cover is required or that we have chosen well on
 * anybody's behalf. Terms, price and what is actually covered are the
 * insurer's, and travel insurance is not something a travel website should
 * have opinions about. Same rule as the admin note on the card itself.
 */
export default async function InsurancePanel() {
  const settings = await readTravelEssentials();
  if (!essentialIsBookable("insurance", settings)) return null;

  const def = defFor("insurance");
  const cfg = settings.services.insurance;
  const cta = cfg.cta.trim() || def.cta;

  const href = goHref({
    product: "insurance",
    page: "/travel-insurance",
    placement: "insurance-panel",
    campaignId: "essentials_insurance",
  });

  return (
    <section className="mx-auto max-w-5xl px-5 pb-4 sm:px-8" aria-labelledby="insurance-panel-heading">
      <div className="rounded-3xl border border-[var(--gold-light)] bg-[var(--surface)] p-6 shadow-[0_18px_45px_rgba(16, 47, 53,.07)] sm:p-8">
        <h2
          id="insurance-panel-heading"
          className="font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--navy)]"
        >
          Compare policies
        </h2>
        <p className="mt-2 max-w-2xl leading-7 text-stone-600">
          Opens with our insurance partner, who shows the options, prices and terms.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4">
          <a
            href={href}
            target="_blank"
            rel="sponsored noopener noreferrer"
            className="inline-flex min-h-12 items-center rounded-md border border-[var(--navy)] bg-[var(--navy)] px-7 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]"
          >
            {cta}
          </a>
          {/* Said before the tab opens. What is covered, what is excluded and
              what it costs are the insurer's, and the exclusions are the half
              people find out about afterwards. */}
          <p className="max-w-md text-sm leading-6 text-stone-600">
            The policy, the price and — the part worth reading — the exclusions are set by the insurer, not by us. Read
            them before you buy.
          </p>
        </div>
        <AffiliateDisclosure className="mt-6 max-w-2xl text-xs leading-5 text-stone-500" />
      </div>
    </section>
  );
}
