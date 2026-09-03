import Link from "next/link";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import PageBlocks from "@/components/PageBlocks";
import SubBrandBanner, { SubBrandCrest } from "@/components/SubBrand";
import SectionHeading from "@/components/SectionHeading";
import { destinations } from "@/data/destinations";
import { searchAreas, searchAttractions, searchEateries, searchStays } from "@/lib/attraction-search";
import { getPublicCemeteryList } from "@/lib/cemeteries-view";
import DestinationDirectory from "@/components/DestinationDirectory";
import { buildDirectoryIndex } from "@/lib/directory-browse";
import { publishedCategoriesBySlug } from "@/lib/content";
import StructuredData from "@/components/StructuredData";
import { resolvePage } from "@/lib/pages";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbs, collectionPage } from "@/lib/structured-data";

export const metadata = pageMetadata({
  title: "Jewish Heritage Destinations Directory — Towns & Kevarim | White Glove",
  description:
    "Browse every town, kever and beis hachaim on the site by city, traditional name, country or tzaddik. Practical details are published only once they have been checked.",
  path: "/stops",
});

export default async function SacredStopsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const query = q.trim().toLowerCase();
  // Kevarim come from the one cemetery database. They used to come from a
  // second, older list that duplicated the same fifteen places under their
  // modern names — and still carried a Lizhensk coordinate that had already
  // been corrected in the real database.
  const allCemeteries = await getPublicCemeteryList();
  // One compact index for the browser to filter, instead of three walls of
  // server-rendered cards. The second query is what makes the "has kosher
  // food" style filters tell the truth about owner-added listings.
  const [liveCategories] = await Promise.all([publishedCategoriesBySlug()]);
  const directory = buildDirectoryIndex(allCemeteries, liveCategories);
  // The rest of the trip. Somebody searching "Colosseum" or "Wiedikon" was
  // being told there was no match at all, when the site had both. Shown only
  // for an actual query — this directory is a kevarim directory first, and an
  // unfiltered page should not open with fifty museums.
  const [matchingAttractions, matchingStays, matchingAreas, matchingEateries] = query
    ? await Promise.all([searchAttractions(query, 24), searchStays(query, 24), searchAreas(query, 12), searchEateries(query, 12)])
    : [[], [], [], []];
  const page = await resolvePage("stops");

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <StructuredData
        data={[
          collectionPage({
            name: "Destinations and kevarim",
            description: "Towns, kevarim and batei hachaim, searchable in English or Yiddish.",
            path: "/stops",
            count: destinations.length,
          }),
          breadcrumbs([
            { name: "Home", path: "/" },
            { name: "Destinations", path: "/destinations" },
          ]),
        ]}
      />
      <Navbar />
      <SubBrandBanner />
      {page?.edited ? (
        <PageBlocks blocks={page.blocks} />
      ) : (
      <section className="wg-page-hero border-b border-[var(--gold-light)] px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-12 gap-y-8">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.26em] text-[var(--gold-ink)]">Towns and guides</p>
            <h1 className="mt-5 max-w-4xl font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--navy)] sm:text-5xl lg:text-6xl">Find a town or kever.</h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-stone-600">
              Search in English or <span lang="yi" dir="rtl">יידיש</span>.
            </p>
          </div>
          <SubBrandCrest className="hidden shrink-0 sm:block" />
        </div>
      </section>
      )}

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
        <SectionHeading
          eyebrow={query ? "Search results" : "Destination directory"}
          title={query ? `Results for “${q.trim()}”` : "Destinations"}
          description={query ? "Guides and locations matching your search." : "Browse by city, traditional name, country, or tzaddik. Detailed practical information is added only when it has been checked."}
        />

        {/* Guides, batei hachaim and the research queue were three separate
            walls of cards, all rendered at once. They are one filtered list
            now — the kind is a filter rather than a heading you scroll past. */}
        <div className="mt-12">
          <DestinationDirectory entries={directory} initialQuery={q.trim()} />
        </div>

        {matchingAttractions.length > 0 && (
          <div className="mt-14">
            <p className="break-words text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)] sm:tracking-[0.2em]">Things to do</p>
            <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {matchingAttractions.map((a) => (
                <Link key={a.slug} href={a.href} className="flex min-w-0 flex-col border border-[var(--gold-light)] bg-[#FAF8F3] p-5 transition hover:border-[var(--gold)] hover:shadow-md sm:p-7">
                  <p className="break-words text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)] sm:tracking-[0.18em]">{a.city} · {a.country} · {a.kind}</p>
                  <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--navy)] [overflow-wrap:anywhere]">{a.name}</h2>
                  <p className="mt-4 text-sm leading-6 text-stone-600">{a.summary}</p>
                  <span className="mt-auto pt-7 text-xs font-bold uppercase tracking-[0.15em] text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4">Open in things to do →</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {(matchingStays.length > 0 || matchingAreas.length > 0) && (
          <div className="mt-14">
            <p className="break-words text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)] sm:tracking-[0.2em]">Where to stay</p>
            <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {matchingAreas.map((area) => (
                <Link key={`area-${area.slug}`} href={`/kosher-stays#${area.slug}`} className="flex min-w-0 flex-col border border-[var(--gold-light)] bg-[#FAF8F3] p-5 transition hover:border-[var(--gold)] hover:shadow-md sm:p-7">
                  <p className="break-words text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)] sm:tracking-[0.18em]">{area.city} · {area.country} · Jewish quarter</p>
                  <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--navy)] [overflow-wrap:anywhere]">{area.name}</h2>
                  <p className="mt-4 text-sm leading-6 text-stone-600">{area.note}</p>
                  <span className="mt-auto pt-7 text-xs font-bold uppercase tracking-[0.15em] text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4">Open where to stay →</span>
                </Link>
              ))}
              {matchingStays.map((s) => (
                <Link key={s.slug} href={s.href} className="flex min-w-0 flex-col border border-[var(--gold-light)] bg-[#FAF8F3] p-5 transition hover:border-[var(--gold)] hover:shadow-md sm:p-7">
                  <p className="break-words text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)] sm:tracking-[0.18em]">{s.city} · {s.country} · {s.kind}</p>
                  <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--navy)] [overflow-wrap:anywhere]">{s.name}</h2>
                  <p className="mt-4 text-sm leading-6 text-stone-600">{s.summary}</p>
                  {/* A season is the thing that costs somebody a Shabbos, so it
                      is on the search card and not only on the full listing. */}
                  {s.season && <p className="mt-3 text-sm font-semibold text-amber-800">Seasonal — {s.season}</p>}
                  <span className="mt-auto pt-7 text-xs font-bold uppercase tracking-[0.15em] text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4">Open where to stay →</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {matchingEateries.length > 0 && (
          <div className="mt-14">
            <p className="break-words text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)] sm:tracking-[0.2em]">Somewhere to eat</p>
            <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {matchingEateries.map((e) => (
                <Link key={e.slug} href={`/kosher#${e.slug}`} className="flex min-w-0 flex-col border border-[var(--gold-light)] bg-[#FAF8F3] p-5 transition hover:border-[var(--gold)] hover:shadow-md sm:p-7">
                  <p className="break-words text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)] sm:tracking-[0.18em]">{e.city} · {e.country} · {e.kind}</p>
                  <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--navy)] [overflow-wrap:anywhere]">{e.name}</h2>
                  <p className="mt-4 text-sm leading-6 text-stone-600">{e.summary}</p>
                  <span className="mt-auto pt-7 text-xs font-bold uppercase tracking-[0.15em] text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4">Open where to eat →</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-10">
          
        </div>
      </section>
      <Footer />
    </main>
  );
}
