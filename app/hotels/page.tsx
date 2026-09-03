import { pageMetadata } from "@/lib/seo";
import Footer from "@/components/Footer";
import KosherApartmentProviders from "@/components/KosherApartmentProviders";
import KosherStayDirectory from "@/components/KosherStayDirectory";
import ListingAudienceNote from "@/components/ListingAudienceNote";
import Navbar from "@/components/Navbar";
import PageBlocks from "@/components/PageBlocks";
import PartnerSearchForm from "@/components/PartnerSearchForm";
import StaySearchForm from "@/components/StaySearchForm";
import SearchMemory from "@/components/SearchMemory";
import StayQuarters from "@/components/StayQuarters";
import { getAreaList, getStayList } from "@/lib/attractions-view";
import { resolvePage } from "@/lib/pages";
import { citiesFor, inDestination, isSearch, nights, readStaySearch } from "@/lib/stay-search";
import { getVacationDestinations } from "@/lib/vacation-destinations-view";

// Rendered per request, not frozen at build time.
//
// This page reads content the owner adds in the admin. Prerendered, it is
// built once when the site is deployed and never again — a listing added on
// Tuesday is still absent on Friday. The admin saves it, the store holds it,
// and the page keeps serving the snapshot taken at build. The whole point of
// the owner being able to add things is that they appear.
//
// `revalidate` was tried first and measured: with a 60-second window the page
// still never re-read the store, because the reads are `cache: "no-store"`
// fetches that a prerender does not re-run. Per-request is what actually
// works, and it is what /stops and the admin pages already do. These pages are
// small, so the cost is a cheap render rather than a cached file.
//
// It now also answers a search, which is a second reason for the same setting.
export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Where to stay — White Glove Kosher Travel",
  description: "Kosher and kosher-friendly places to stay in Italy, France and Switzerland, and which part of each city to be in for Shabbos.",
  path: "/hotels",
});

/**
 * Where a search for somewhere to stay is answered.
 *
 * TWO PAGES IN ONE, and which one you get depends on whether a destination was
 * typed. With nothing typed it is the directory it has always been. With a
 * destination it becomes a result: the quarter to be in, the places to stay
 * there, and then the partner search with everything already filled in.
 *
 * THE ORDER IS THE ARGUMENT. The commission is earned at the bottom of this
 * page, and it is at the bottom on purpose — the quarter and the seasonal
 * warnings are the reason somebody searched here instead of on a comparison
 * site, and burying them under a booking widget would leave nothing but a worse
 * comparison site.
 *
 * A DESTINATION THE GUIDES DO NOT COVER STILL GETS AN ANSWER. It would be easy
 * to show the whole directory under a heading naming a town that is not in it,
 * and somebody would book a hotel in the wrong country. So the list is empty
 * and the page says what to do instead — arrange food and Shabbos locally —
 * rather than reporting on how far our own writing has got. The partner search
 * below works for anywhere and is unaffected.
 */
export default async function KosherStaysPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const search = readStaySearch(await searchParams);
  const searching = isSearch(search);
  // Through the view, so a destination the owner added resolves to its
  // towns here the same as a built-in one.
  const resolved = searching
    ? citiesFor(search.destination, await getVacationDestinations())
    : null;

  // Read through the view so owner-added stays and quarters appear here and in
  // every search without a redeploy.
  const [allAreas, allStays] = await Promise.all([getAreaList(), getStayList()]);
  const kosherAreas = searching ? inDestination(allAreas, search.destination) : allAreas;
  const kosherStays = searching ? inDestination(allStays, search.destination) : allStays;

  const heading = resolved?.label ?? search.destination;
  const stayNights = nights(search);
  const party = [
    `${search.adults} adult${search.adults === 1 ? "" : "s"}`,
    search.children > 0 ? `${search.children} child${search.children === 1 ? "" : "ren"}` : null,
    `${search.rooms} room${search.rooms === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const page = await resolvePage("hotels");

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      {/* Writes this search down when there is one, then fills the empty
          fields of any opted-in form from what was remembered. Renders
          nothing, and the forms work without it. */}
      <SearchMemory remember={searching ? search : undefined} />
      <Navbar />

      {page?.edited ? (
        <PageBlocks blocks={page.blocks} />
      ) : (
        <section className="wg-page-hero border-b border-[var(--gold-light)] px-5 py-14 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-7xl">
            <p className="text-xs font-bold uppercase tracking-[0.26em] text-[var(--gold-ink)]">Where to stay</p>
            <h1 className="mt-5 font-[family-name:var(--font-display)] text-5xl text-[var(--navy)] sm:text-6xl">
              {searching ? `Where to stay in ${heading}` : "Where to stay"}
            </h1>
            <ListingAudienceNote />
            {searching && (
              <p className="mt-4 text-sm font-semibold text-[var(--navy)]">
                {stayNights ? `${stayNights} night${stayNights === 1 ? "" : "s"}` : "Dates not set"} · {party}
              </p>
            )}

            {/* Editable in place. A search that cannot be corrected without going
                back to the front page is a search somebody abandons. */}
            <div className="mt-8 max-w-5xl">
              <StaySearchForm
                id="stay-search"
                search={search}
                submitLabel={searching ? "Update search" : "Find somewhere to stay"}
              />
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
        {searching && kosherAreas.length === 0 && kosherStays.length === 0 ? (
          <div className="border border-[var(--gold-light)] bg-[#FAF8F3] p-6 sm:p-8">
            <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">
              Planning a kosher stay in {heading}
            </h2>
            <p className="mt-3 max-w-2xl leading-7 text-stone-600">
              Arrange food and Shabbos locally before you travel, and compare places to stay with the search below.
            </p>
            <p className="mt-4 max-w-2xl leading-7 text-stone-600">
              <a
                href="#everywhere"
                className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
              >
                Browse the destinations our guides cover
              </a>
            </p>
          </div>
        ) : (
          <>
            {/* Answered before the hotels, because it is the earlier question.
                Each quarter searches on itself — see components/StayQuarters. */}
            <StayQuarters areas={kosherAreas} search={search} />

            {kosherStays.length > 0 && (
              <div id="everywhere" className="mt-10 scroll-mt-24">
                <KosherStayDirectory stays={kosherStays} />
              </div>
            )}
          </>
        )}

        {/* Where to find a kosher apartment — the sites and hosts, not hotels.
            Renders nothing until the owner has added one in the admin. */}
        <KosherApartmentProviders />

        {/* The commercial action, under the reason to trust it rather than
            over it. Everything typed on the front page arrives here already
            filled in; nothing is asked for twice. */}
        <div className="mt-12">
          <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">
            Check prices and availability
          </h2>
          <div className="mt-6">
            <PartnerSearchForm
              id="hotels-partner"
              product="hotel"
              fields="stay"
              page="/hotels"
              placement="results"
              submitLabel="Check availability"
              destinationValue={search.destination}
              prefill={{
                checkIn: search.checkIn,
                checkOut: search.checkOut,
                adults: search.adults,
                children: search.children,
                rooms: search.rooms,
              }}
            />
          </div>
        </div>

      </section>

      <Footer />
    </main>
  );
}
