import { notFound } from "next/navigation";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import DestinationActions from "@/components/DestinationActions";
import SuggestEditPanel from "@/components/SuggestEditPanel";
import { ReviewSection } from "@/components/reviews/ReviewSection";
import { airportsFor } from "@/lib/destination-actions";
import PhotoGallery from "@/components/PhotoGallery";
import PracticalInformation from "@/components/PracticalInformation";
import { bulkDestinations, getBulkDestination } from "@/data/destinations-bulk";
import { getCemetery } from "@/data/cemeteries";
import { placeDirectionsUrl } from "@/data/route-utils";
import { getDestinationRecord } from "@/data/destination-database";
import { getPublishedDestinationContent } from "@/lib/content";
import StructuredData from "@/components/StructuredData";
import { GettingThere, NearbyKevarim, TownQuestions, WhoIsBuried } from "@/components/TownSections";
import { nearbyKevarim } from "@/lib/nearby-kevarim";
import { directoryTownQuestions } from "@/lib/town-questions";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbs, faqPage, touristAttraction } from "@/lib/structured-data";

export function generateStaticParams() {
  return bulkDestinations.map(({ slug }) => ({ place: slug }));
}

// Re-render at most hourly; admin edits also trigger on-demand revalidation.
// A minute, not an hour.
//
// This page shows listings the owner edits in the admin, and the admin says
// "changes go live within a minute — no code, no redeploy." It was an hour,
// so that promise was wrong by a factor of sixty and the owner would have
// concluded the editor was broken.
//
// Measured rather than assumed: with a sixty-second window an edit made after
// the build did appear. (That is not true of the pages whose reads are
// `cache: "no-store"` fetches — those needed force-dynamic. Prisma reads are
// not fetch-cached, so revalidation reaches them.)
export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ place: string }> }) {
  const { place: slug } = await params;
  const destination = getBulkDestination(slug);
  if (!destination) return pageMetadata({ title: "Destination not found | White Glove Kosher Travel", description: "This destination could not be found.", path: `/heritage/towns/${slug}`, noIndex: true });
  // NOINDEX WHILE THERE IS NOTHING ON IT. Every one of these hundred and nine
  // towns renders no kevarim, no listings and no summary — the record exists,
  // the content has not been written — and all of them were in the sitemap,
  // asking Google to index a hundred and nine near-identical empty pages under
  // our name. The URL keeps working, the record is untouched, and the day a
  // town gains a cemetery or a listing it indexes itself again.
  const hasContent = Boolean(getDestinationRecord(slug)?.cemeteries.length) || Boolean(destination.summary);
  return pageMetadata({
    title: `${destination.city}, ${destination.country} — Jewish Heritage Guide | White Glove`,
    description: destination.summary
      ? destination.summary
      : `${destination.city}, ${destination.country}: kevarim, addresses and travel details for Jewish heritage travel.`,
    path: `/heritage/towns/${destination.slug}`,
    noIndex: !hasContent,
  });
}

export default async function BulkDestinationPage({ params }: { params: Promise<{ place: string }> }) {
  const { place: slug } = await params;
  const destination = getBulkDestination(slug);
  if (!destination) notFound();

  const record = getDestinationRecord(destination.slug);
  const dbContent = await getPublishedDestinationContent(destination.slug);

  // THE SAME SECTIONS THE RESEARCHED TOWNS GET, from this town's own listing.
  //
  // These hundred and nine pages showed a cemetery card and stopped —
  // the name of the beis hachaim, its address, and the first of its arrival
  // notes. They did not say WHO IS BURIED THERE, though the listing behind the
  // page holds every name, the seforim and the yahrzeiten. Somebody searching
  // for a kever in Przysucha reached a page that would not tell them whose it
  // was.
  //
  // Nothing below is written per town and nothing is invented: it is the
  // listing this page already had, rendered. A town whose listing is empty
  // gets none of it, which is why this can be switched on for all of them at
  // once rather than town by town.
  const cemeteries = record?.cemeteries ?? [];
  // Where to measure from.
  //
  // The grave coordinate when the listing has one, otherwise its `airportRef`
  // — a town-level pin that data/cemeteries.ts states is explicitly NOT a
  // grave location and must never be navigated to. Ranking airports and
  // measuring what else is within reach is exactly what it is for, and most of
  // these listings carry it where they carry no grave pin: without it only
  // five of the hundred and nine towns could name their nearest airport.
  // Navigation is untouched — each cemetery card below still uses its own
  // address.
  const rankingPoint = cemeteries
    .map((cemetery) => {
      const listing = getCemetery(cemetery.id);
      return cemetery.coordinates ?? listing?.coordinates ?? listing?.airportRef;
    })
    .find(Boolean);
  const airports = airportsFor(destination.country, `${destination.city}, ${destination.country}`, rankingPoint);
  const measuredAirports = airports.length > 0 && airports.every((airport) => airport.km);
  // Every kever in this town, across all its batei hachaim, named once.
  const burials = cemeteries
    .flatMap((cemetery) => cemetery.burials)
    .filter((burial, index, all) => all.findIndex((other) => other.name === burial.name) === index);
  const nearby = cemeteries.length ? nearbyKevarim(cemeteries[0].id, { from: rankingPoint }) : [];
  const questions = directoryTownQuestions({
    city: destination.city,
    country: destination.country,
    aliases: destination.aliases,
    cemeteries: cemeteries.map((cemetery) => ({ name: cemetery.name, address: cemetery.address, burials: cemetery.burials })),
    airports,
  });
  const stayDestination = encodeURIComponent(`${destination.city}, ${destination.country}`);

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <StructuredData
        data={[
          touristAttraction({
            name: destination.city,
            description: destination.summary ?? `Jewish heritage destination in ${destination.country}.`,
            path: `/heritage/towns/${destination.slug}`,
            coordinates: record?.cemeteries[0]?.coordinates,
            country: destination.country,
            alternateNames: [destination.yiddishCity, ...(destination.aliases ?? [])],
          }),
          ...(questions.length ? [faqPage(questions)] : []),
          breadcrumbs([
            { name: "Home", path: "/" },
            { name: "Destinations", path: "/destinations" },
            { name: destination.city, path: `/heritage/towns/${destination.slug}` },
          ]),
        ]}
      />
      <Navbar />

      <section className="wg-page-hero border-b border-[var(--gold-light)] px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-[var(--gold-ink)]">Destination directory · {destination.country}</p>
          <h1 dir="rtl" lang="yi" className="mt-5 font-[family-name:var(--font-display)] text-[clamp(2.75rem,8vw,5rem)] leading-tight text-[var(--navy)]">{destination.yiddishCity}</h1>
          <p className="mt-3 font-[family-name:var(--font-display)] text-3xl text-stone-500 sm:text-4xl">{destination.city}</p>
          {destination.summary && <p className="mt-7 max-w-2xl text-lg leading-8 text-stone-600">{destination.summary}</p>}
          <DestinationActions place={{ id: `destination-${destination.slug}`, name: destination.city, yiddishName: destination.yiddishCity, address: `${destination.city}, ${destination.country}`, coordinates: record?.cemeteries[0]?.coordinates, href: `/destinations/${destination.slug}` }} airports={airportsFor(destination.country, `${destination.city}, ${destination.country}`, record?.cemeteries[0]?.coordinates)} />
          <SuggestEditPanel targetType="location" targetId={destination.slug} title={destination.city} />
          <ReviewSection placeKind="destination" placeRef={`heritage-${destination.slug}`} placeLabel={destination.city} sacred />
          
          {/* A picture of the town, or of one of its listings. Nothing sent
              here appears until the owner has looked at it. */}
          
        </div>
      </section>

      {/* AN ADMIN PANEL USED TO BE HERE, on a public page: "Verification
          summary", "What is ready, and what still needs checking", a line
          asking the visitor to send us missing shomer numbers, and then
          "Destination record: Available", "Batei hachaim: 3" and "Practical
          sections are shown only when they exist in the destination
          database". Every line of it was written for the person maintaining
          the site, and it was shown to the person planning a journey. The
          batei hachaim themselves are below, which is what somebody came for.

          The per-cemetery "Needs verification / Unavailable" chips went with
          it — see lib/trust-status.ts on why the labels a customer meets are
          instructions rather than our queue position. */}
      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        {record?.cemeteries.length ? (
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {record.cemeteries.map((cemetery) => (
              <article key={cemetery.id} className="wg-card border border-[var(--gold-light)] bg-[#FAF8F3] p-5 sm:p-6">
                <h2 dir="rtl" lang="yi" className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">{cemetery.yiddishName}</h2>
                <p className="mt-1 text-sm text-stone-500">{cemetery.name}</p>
                {cemetery.address && <p className="mt-4 text-sm leading-6 text-stone-600">{cemetery.address}</p>}
                {/* EVERY ARRIVAL NOTE, not just the first.
                    This card printed arrivalNotes[0] and dropped the rest,
                    which quietly hid the most useful line on several towns:
                    that Stropkov's dead are buried at Tisinec, that the key to
                    Kolín is at the museum, that sources disagree about where
                    the Beis HaLevi lies. Whichever note happened to be written
                    first was the only one a visitor saw. They are all here
                    now, in the order the listing gives them — the listings put
                    the warning first on purpose, so order still carries
                    meaning. */}
                {cemetery.arrivalNotes.length > 0 && (
                  <ul className="mt-4 space-y-3 border-l-2 border-[var(--gold)] pl-3">
                    {cemetery.arrivalNotes.map((note) => (
                      <li key={note} className="text-sm leading-6 text-stone-600">{note}</li>
                    ))}
                  </ul>
                )}
                {cemetery.address && <a href={placeDirectionsUrl(cemetery.address, cemetery.coordinates)} target="_blank" rel="noreferrer" className="mt-5 inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4">Navigate to this beis hachaim</a>}
              </article>
            ))}
          </div>
        ) : null}

        <PhotoGallery photos={dbContent?.photos ?? []} />
        {record && <PracticalInformation record={record} places={dbContent?.places ?? []} />}
      </section>

      <WhoIsBuried
        burials={burials}
        title="Who is buried here."
        description="Every kever this town's batei hachaim listings record, with the seforim and yahrzeiten where they are known."
      />
      <GettingThere airports={airports} country={destination.country} measured={measuredAirports} stayDestination={stayDestination} />
      <NearbyKevarim nearby={nearby} />
      <TownQuestions questions={questions} />

      <Footer />
    </main>
  );
}
