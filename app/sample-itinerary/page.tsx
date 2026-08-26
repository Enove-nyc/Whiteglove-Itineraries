import Link from "next/link";
import Footer from "@/components/Footer";
import GloveMark, { GloveList } from "@/components/GloveMark";
import Navbar from "@/components/Navbar";
import PageBlocks from "@/components/PageBlocks";
import PrintableItinerary from "@/components/PrintableItinerary";
import SectionHeading from "@/components/SectionHeading";
import StructuredData from "@/components/StructuredData";
import { SAMPLE_ITINERARY, SAMPLE_NOTICE, WHAT_IS_IN_IT } from "@/data/sample-itinerary";
import { ACTION_BUTTON_CLASS } from "@/lib/action-button";
import { resolvePage } from "@/lib/pages";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbs } from "@/lib/structured-data";
import { currentBrand } from "@/lib/site-brand";
import { BRAND_NAME } from "@/lib/site-brand-core";

// PER REQUEST, because the page is now served on both domains and they are two
// companies. A static export cannot ask which one is being visited, and the
// title is the line a search result and a share card show before anything else.
export async function generateMetadata() {
  const brand = await currentBrand();
  return pageMetadata({
    title:
      brand === "itineraries"
        ? `A sample itinerary — what your client opens | ${BRAND_NAME.itineraries}`
        : `A sample itinerary — what you actually receive | ${BRAND_NAME.kosher}`,
    description:
      brand === "itineraries"
        ? "A whole week in Rome for a family of five, as the itinerary is handed over: a day per page, real walking and driving times, and what is filled in on a live trip that is left blank here."
        : "A whole week in Rome for a family of five, as the itinerary is delivered: a day per page, real walking and driving times, the kosher side per day, and a Shabbos with nothing scheduled on it.",
    path: "/sample-itinerary",
  });
}

/**
 * The proof that was missing.
 *
 * A visitor could read how the itinerary planner works and still have no idea
 * what arrives at the end of it. "A written day-by-day itinerary" is a
 * description of a deliverable, and the decision somebody is making is about
 * the deliverable.
 *
 * SO THIS SHOWS THE DOCUMENT, not a picture of one. It is rendered by
 * components/PrintableItinerary.tsx, the same component that prints a real
 * trip, from a trip object that goes through the same buildDays() as everybody
 * else's — so the times, the driving between stops and the evening entries are
 * computed here exactly as they are for a customer. If the printed itinerary
 * changes, this page changes with it, which is the only way a sample stays
 * true.
 *
 * WHAT IS NOT HERE, and why the page says so twice: a hotel name, an airline, a
 * flight number, a confirmation code, a price. Every one of those would be a
 * claim about something that has not happened, on a site whose argument is that
 * what it prints has been checked. The places ARE real — they are the Rome
 * records this site already publishes with sources — and the rest is marked as
 * the shape of the thing rather than dressed up as a booking.
 *
 * AND WHAT IS STILL NOT HERE: a testimonial. There is no real one to print and
 * this page does not invent one. What it offers instead is the strongest proof
 * available, which is the work itself.
 */
export default async function SampleItineraryPage() {
  const [page, brand] = await Promise.all([resolvePage("sample-itinerary"), currentBrand()]);
  const itineraries = brand === "itineraries";

  return (
    <main className="min-h-screen bg-[var(--cream)] text-[var(--ink)]">
      <StructuredData
        data={breadcrumbs([
          { name: "Home", path: "/" },
          { name: "Itinerary planner", path: "/itinerary" },
          { name: "A sample itinerary", path: "/sample-itinerary" },
        ])}
      />
      <Navbar />

      {page?.edited ? (
        <PageBlocks blocks={page.blocks} />
      ) : (
        <section className="wg-page-hero border-b border-[var(--gold-light)] px-5 py-12 sm:px-8 sm:py-16">
          <div className="mx-auto max-w-7xl">
            <p className="text-xs font-bold uppercase tracking-[0.26em] text-[var(--gold-ink)]">What you receive</p>
            <h1 className="mt-5 max-w-4xl font-[family-name:var(--font-display)] text-[clamp(2.25rem,6vw,3.75rem)] leading-[1.08] text-[var(--navy)]">
              A week in Rome, as it arrives.
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-stone-600">
              {itineraries
                ? "A family of five, seven nights — the document your client is actually handed."
                : "A family of five, seven nights, and a Shabbos in the middle of it — the document you are actually handed."}
            </p>
            <p className="mt-4 max-w-3xl rounded-lg border-l-4 border-[var(--gold)] bg-[#fcf6e9] px-5 py-3 leading-7 text-stone-700">
              <span className="font-semibold text-[var(--navy)]">{SAMPLE_NOTICE}</span>
            </p>
          </div>
        </section>
      )}

      {/* THE SAMPLE COMES FIRST, right after the hero — before, this page
          explained what was in the document across two sections before
          showing it. A visitor here wants to see it, not read about it. */}
      <section className="border-y border-[var(--gold-light)] bg-[var(--cream-deep)] px-5 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <h2 className="font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--navy)] sm:text-4xl">
            The document
          </h2>
          <p className="mt-3 max-w-3xl leading-7 text-stone-600">
            {itineraries
              ? "A cover, then a page per day. The same trip also opens as an app on their phone, and stays in your account where you can move a day and print it again."
              : "A cover, then a page per day — and it arrives in your account too, where you can move a day and print it again."}
          </p>

          {/* Framed rather than dropped straight onto the page, so it reads as
              a document being shown rather than as this page's own layout. The
              horizontal scroll is on this container and never on the body: the
              printed page has a fixed width and a phone does not. */}
          <div className="mt-8 overflow-x-auto rounded-2xl border border-[var(--gold-light)] bg-white p-3 shadow-[0_18px_45px_rgba(23,45,82,.09)] sm:p-6">
            <div className="min-w-[42rem]">
              {/* THE DOCUMENT'S OWN BRAND, not the reader's — and on this page they
                  are the same thing, because the sample is produced by whichever
                  site is showing it. Left unset, the cover, the footer and every
                  day's running head said White Glove Kosher Travel on the site
                  that sells this. */}
              <PrintableItinerary itin={SAMPLE_ITINERARY} burials={{}} embedded siteBrand={brand} />
            </div>
          </div>

          <p className="mt-4 text-sm leading-6 text-stone-500">
            Shown at the width it prints. On a phone, slide the panel sideways to read across it.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
        <SectionHeading eyebrow="Contents" title="What is in it" />
        <dl className="mt-10 grid gap-x-10 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
          {WHAT_IS_IN_IT.map(([term, detail]) => (
            <div key={term} className="border-t border-[var(--gold-light)] pt-4">
              <dt className="font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--navy)]">{term}</dt>
              <dd className="mt-2 leading-7 text-stone-600">{detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_.9fr] lg:items-start">
          <div>
            <SectionHeading
              eyebrow="About this sample"
              title={itineraries ? "What is filled in on a real one, and blank here." : "What is filled in on yours, and blank on this one."}
              description={
                itineraries
                  ? "The places are real. Nothing here is booked, and none of it is invented to look like it was."
                  : "The places are real — they are the Rome records this site publishes, with their sources. Nothing else here is booked."
              }
            />
            {/* The kosher wording says "yours" because that visitor is the
                traveller. Here the person reading is the one BUILDING it, and
                the document goes to somebody else — so the same four facts are
                said about a live trip rather than about theirs. */}
            <GloveList
              items={
                itineraries
                  ? [
                      "A live itinerary names the hotel, its address and the confirmation number. This one says which quarter it is in.",
                      "It names the airline and the flight number. This one gives the route and the times.",
                      "It carries what was paid. There are no prices anywhere on this sample.",
                      "Neither carries opening hours — they change by season, and a stale one sends a family to a locked door.",
                    ]
                  : [
                      "Your itinerary names the hotel, its address and the confirmation number. This one says which quarter it is in.",
                      "Yours names the airline and the flight number. This one gives the route and the times.",
                      "Yours carries what you paid. There are no prices anywhere on this site.",
                      "Neither carries opening hours — they change by season, and a stale one sends a family to a locked door.",
                    ]
              }
              className="mt-8 space-y-3 leading-7 text-stone-600"
            />
            {/* /verification is guide-only: on this domain the button would
                throw the reader onto the other company's site, which is the
                whole bug this page was moved out of. */}
            {!itineraries && (
              <p className="mt-8">
                <Link
                  href="/verification"
                  className="inline-flex min-h-11 items-center rounded-md border border-[var(--gold)] px-6 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white"
                >
                  How we check what goes on these pages
                </Link>
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--gold-light)] bg-[var(--surface)] p-7">
            {/* THE KOSHER SIDE SAYS "FREE" BECAUSE IT IS. This domain charges
                for the thing the page has just shown, so the same words would
                be a payment promise the site does not keep — see AGENTS.md.
                AND NO NUMBER IS PRINTED HERE EITHER: the amounts are the
                owner's, set in the admin and read at request time through
                offerLine(), which refuses to print a figure the billing code
                cannot stand behind. A "$15" typed into this file would be a
                promise nothing enforces. So it points at /pricing, which asks
                properly. */}
            <div className="flex items-center gap-3">
              <GloveMark size="lg" />
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">
                {itineraries ? "Build one of these" : "Free, either way"}
              </p>
            </div>
            <p className="mt-4 leading-7 text-stone-600">
              {itineraries
                ? "The planner builds this document from the days you enter, and the same trip opens as an app on your client’s phone. A single trip is a one-off; an advisor plan is a subscription with no cap on how many."
                : "Build the same document yourself, for your own dates — or answer three short steps for destination ideas first. Sign in to start; it’s free."}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/itinerary"
                className={`inline-flex min-h-11 items-center ${ACTION_BUTTON_CLASS.primary}`}
              >
                Open the itinerary planner
              </Link>
              <Link
                href={itineraries ? "/pricing" : "/plan"}
                className="inline-flex min-h-11 items-center rounded-md border border-[var(--gold)] px-6 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--cream-deep)]"
              >
                {itineraries ? "What it costs" : "Get recommendations"}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
