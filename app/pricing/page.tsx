import Link from "next/link";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { PageHeader } from "@/components/ui/PageHeader";
import { LinkButton } from "@/components/ui/Button";
import { planCards, whatThisAdds } from "@/data/plan-comparison";
import { offerLine, offerablePlans, priceIdFor, periodsFor } from "@/lib/plan-billing";
import { readPlanOffering } from "@/lib/plan-billing-store";
import { describePrice, readPrice } from "@/lib/stripe";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";
import { BRAND_NAME } from "@/lib/site-brand-core";

/**
 * WHAT THIS IS AND WHAT IT COSTS — the page a travel advisor could not reach.
 *
 * Everything about the plans lived behind a sign-in: the account page, and the
 * admin. So somebody weighing this tool up had to create an account to find out
 * what it did or what it cost, which is the point most of them left. This page
 * is deliberately public and deliberately dull about it: what the product does,
 * who each plan is for, exactly what it includes, and the price.
 *
 * THE PRICE IS READ, NEVER WRITTEN HERE. offerLine() in lib/plan-billing.ts
 * already decides what may be said about money, and it is stricter than a
 * marketing page would be: nothing at all while the offering is "soon", the
 * owner's own wording while it is "ask", and in card mode only the amount
 * Stripe itself reports. So a plan whose price is not settled shows what it
 * DOES and says nothing about cost, rather than carrying a number the billing
 * code would not stand behind. See data/plan-comparison.ts for why the
 * includes-lists are derived from the entitlement tables too.
 */

export async function generateMetadata() {
  const brand = await currentBrand();
  const name = BRAND_NAME[brand];
  // NOTE: this repository's pageMetadata takes no `brand` — it settles the
  // site name from the title, which already carries BRAND_NAME below, and this
  // deployment answers one domain so there is no other origin to be canonical
  // on. The other repository's version takes one because it serves both.
  return pageMetadata({
    title: `Plans and pricing — ${name}`,
    description: "What the planner does, who each plan is for, exactly what it includes, and what it costs.",
    path: "/pricing",
  });
}

// The offering and the Stripe prices are read fresh: a price is the last thing
// that should be served from a cache built an hour ago.
export const dynamic = "force-dynamic";

/** What somebody is actually buying, said once, before any plan is named. */
const WHAT_IT_DOES = [
  {
    step: "Plan it",
    detail:
      "Build the trip day by day — flights, hotels, drivers, tours and meals in the order they happen. Import a confirmation email and it files itself.",
  },
  {
    step: "Hand it over",
    detail:
      "Send your client a link. It opens as an app on their phone: today's plan, the map, their travel wallet, and a way to reach you.",
  },
  {
    step: "Stay in touch",
    detail:
      "Their questions land in one inbox, against the right trip. You see what has been paid, what is outstanding, and what leaves next.",
  },
] as const;

export default async function PricingPage() {
  const brand = await currentBrand();
  const offering = await readPlanOffering();

  // The same read the account page does, so the two pages can never quote
  // different prices for the same plan.
  const offered = offering.open ? offerablePlans(offering) : [];
  const lines = new Map<string, string>();
  for (const plan of offered) {
    const periods = await Promise.all(
      periodsFor(offering, plan).map(async (period) => describePrice(await readPrice(priceIdFor(offering, plan, period)))),
    );
    const usable = offering.how === "stripe" ? periods.filter(Boolean) : [];
    // In card mode a plan whose price cannot be read is not quoted at all —
    // the account page drops it for the same reason.
    if (offering.how === "stripe" && usable.length === 0) continue;
    const line = offerLine(offering, plan, usable[0]);
    if (line) lines.set(plan, line);
  }

  const cards = planCards();

  return (
    <main className="min-h-screen bg-[var(--cream)] text-[var(--ink)]">
      <Navbar />

      <section className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
        <PageHeader
          eyebrow="Plans and pricing"
          title="The trip you plan, in your client's pocket."
          description={`${BRAND_NAME[brand]} is where you build a trip, hand it to the person taking it, and stay with them while they travel.`}
        />

        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {WHAT_IT_DOES.map((item) => (
            <div key={item.step} className="border-l-2 border-[var(--gold)] pl-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">{item.step}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--navy)]">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-[var(--gold-light)] bg-white px-5 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold text-[var(--navy)]">Which one you need</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-6 text-stone-600">
            One trip for yourself, or the tools to run clients. Everything on the site — the planner, the map, the
            guides, sharing a trip with anybody you like — is the same on every plan.
          </p>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {cards.map((card) => {
              const price = lines.get(card.plan);
              const adds = whatThisAdds(card.plan);
              return (
                <div
                  key={card.plan}
                  className="flex flex-col border border-[var(--gold-light)] bg-[var(--cream)] p-6"
                >
                  <h3 className="text-lg font-bold text-[var(--navy)]">{card.name}</h3>

                  {price ? (
                    <p className="mt-1 text-2xl font-bold text-[var(--navy)]">
                      {price}
                      {card.oneTime && <span className="ml-2 text-xs font-semibold text-stone-500">once</span>}
                    </p>
                  ) : (
                    // No price is settled for this plan. Say what it is for and
                    // nothing about money — never a placeholder, and never a
                    // note about why. See the header of this file.
                    <p className="mt-1 text-sm font-semibold text-stone-500">
                      {card.oneTime ? "A single, one-time fee" : "A monthly subscription"}
                    </p>
                  )}

                  <p className="mt-3 text-sm leading-6 text-stone-600">{card.blurb}</p>

                  {adds.length > 0 && (
                    <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">
                      Everything below, plus
                    </p>
                  )}

                  <ul className="mt-3 flex flex-1 flex-col gap-2">
                    {card.includes.map((item) => (
                      <li key={item} className="flex gap-2 text-sm leading-6 text-[var(--navy)]">
                        <span aria-hidden className="text-[var(--gold-ink)]">✓</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6">
                    <LinkButton href="/account">Choose {card.name}</LinkButton>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <h2 className="text-xl font-bold text-[var(--navy)]">Questions worth answering first</h2>
        <dl className="mt-6 flex flex-col gap-6">
          <div>
            <dt className="text-sm font-bold text-[var(--navy)]">Does my client need an account?</dt>
            <dd className="mt-1 text-sm leading-6 text-stone-600">
              No. You send them a link that opens their trip and nothing else. There is no sign-up, no password, and
              they cannot see anybody else&apos;s trip.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-[var(--navy)]">Do you plan the trip for me?</dt>
            <dd className="mt-1 text-sm leading-6 text-stone-600">
              No — this is the tool you plan in, not a planning service. You build the trip and it is yours.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-[var(--navy)]">What happens to trips I have already made?</dt>
            <dd className="mt-1 text-sm leading-6 text-stone-600">
              They stay. A plan decides what you can start next; it never closes, hides or deletes a trip that exists.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-[var(--navy)]">Can I stop, or move to a smaller plan?</dt>
            <dd className="mt-1 text-sm leading-6 text-stone-600">
              Yes, from your account page at any time — switch plan or stop altogether. It opens the same billing page
              you would use to change your card, and the trips you have already built stay yours.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-[var(--navy)]">I am planning one trip, for myself.</dt>
            <dd className="mt-1 text-sm leading-6 text-stone-600">
              One Trip is for exactly that — a single fee, no subscription, and the app on your own phone while you
              travel.
            </dd>
          </div>
        </dl>

        <p className="mt-10 text-sm text-stone-600">
          Still deciding?{" "}
          <Link href="/app" className="font-semibold text-[var(--gold-ink)] underline">
            See what your client receives
          </Link>
          .
        </p>
      </section>

      <Footer />
    </main>
  );
}
