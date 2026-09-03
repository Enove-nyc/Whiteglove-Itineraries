import Link from "next/link";
import { notFound } from "next/navigation";
import Footer from "@/components/Footer";
import KeverCoordinates from "@/components/KeverCoordinates";
import MixedText from "@/components/MixedText";
import DetailActionRow from "@/components/DetailActionRow";
import SuggestEditPanel from "@/components/SuggestEditPanel";
import { ReviewSection } from "@/components/reviews/ReviewSection";
import Navbar from "@/components/Navbar";
import NearestAirports from "@/components/NearestAirports";
import StructuredData from "@/components/StructuredData";
import SubBrandBanner from "@/components/SubBrand";
import TravelAdvisoryBadge from "@/components/TravelAdvisoryBadge";
import { allTzaddikim, getTzaddik } from "@/lib/tzaddikim";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbs } from "@/lib/structured-data";

export function generateStaticParams() {
  return allTzaddikim().map(({ slug }) => ({ person: slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ person: string }> }) {
  const { person } = await params;
  const entry = getTzaddik(person);
  if (!entry) {
    return pageMetadata({ title: "Not found | White Glove Kosher Travel", description: "This record could not be found.", path: `/tzaddikim/${person}`, noIndex: true });
  }
  const { burial, cemetery } = entry;
  // The name people search by leads, because that is the search.
  const known = burial.knownAs ? `${burial.knownAs} — ` : "";
  return pageMetadata({
    title: `${known}${burial.name} — Kever in ${cemetery.city} | White Glove`,
    description: [
      `The kever of ${burial.name}${burial.knownAs ? `, ${burial.knownAs}` : ""} in ${cemetery.city}, ${cemetery.country}.`,
      burial.yahrzeit ? `Yahrzeit ${burial.yahrzeit}.` : "",
      "Address, navigation and access.",
    ].filter(Boolean).join(" "),
    path: `/tzaddikim/${entry.slug}`,
  });
}

export const revalidate = 60;

/**
 * One person.
 *
 * He existed only as a line inside a beis hachaim page, so there was nowhere
 * to send somebody who asks where the Noam Elimelech is buried — which is how
 * people search, by the person rather than by the town. The site knew and had
 * no page to put it on.
 *
 * The record is still the cemetery's. This reads it from the other end, so a
 * correction made in the admin shows on both.
 */
export default async function TzaddikPage({ params }: { params: Promise<{ person: string }> }) {
  const { person } = await params;
  const entry = getTzaddik(person);
  if (!entry) notFound();
  const { burial, cemetery } = entry;

  const others = cemetery.burials.filter((b) => b.name !== burial.name);

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <StructuredData
        data={[
          breadcrumbs([
            { name: "Home", path: "/" },
            { name: "Kevarim", path: "/tzaddikim" },
            { name: burial.knownAs || burial.name, path: `/tzaddikim/${entry.slug}` },
          ]),
        ]}
      />
      <Navbar />
      <SubBrandBanner />

      <section className="wg-page-hero border-b border-[var(--gold-light)] px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-[var(--gold-ink)]">
            Kever · {cemetery.city} · {cemetery.country}
          </p>
          <h1 dir="rtl" lang="yi" className="mt-5 font-[family-name:var(--font-display)] text-[clamp(2.5rem,7vw,4.5rem)] leading-tight text-[var(--navy)]">
            <MixedText text={burial.yiddishName || burial.name} lang="yi" />
          </h1>
          <p className="mt-3 font-[family-name:var(--font-display)] text-3xl text-stone-500">{burial.name}</p>
          {burial.knownAs && <p className="mt-4 text-lg font-semibold text-[var(--navy)]">{burial.knownAs}</p>}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_.8fr]">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Who he was</h2>
            {burial.note ? (
              <p className="mt-4 text-lg leading-8 text-stone-600">{burial.note}</p>
            ) : (
              <p className="mt-4 text-sm leading-6 text-stone-500">
                Nothing written here yet beyond his name and where he is buried. If you know more, send it
                with Suggest edit below.
              </p>
            )}
            {/* THE ONE PAGE ON THE SITE WITH NO ACTIONS ON IT. A town, a bais
                hachaim and a destination all carry this row; a kever — the
                thing a heritage traveller is actually going to — carried
                none, so there was no way to put one on a route or an
                itinerary from the page about it. Same component, same icons,
                same order, same sign-in rules as everywhere else; no separate
                kever action system. The address and coordinates come from the
                bais hachaim he is in, which is what directions need. */}
            <DetailActionRow
              place={{
                id: `kever-${entry.slug}`,
                name: burial.knownAs || burial.name,
                yiddishName: burial.yiddishName,
                address: cemetery.address ?? `${cemetery.city}, ${cemetery.country}`,
                coordinates: cemetery.coordinates,
                href: `/tzaddikim/${entry.slug}`,
              }}
            />
            <SuggestEditPanel targetType="location" targetId={entry.slug} title={burial.knownAs || burial.name} />
            <ReviewSection placeKind="kever" placeRef={entry.slug} placeLabel={burial.knownAs || burial.name} sacred />

            <dl className="mt-8 divide-y divide-[var(--gold-light)] border-y border-[var(--gold-light)]">
              {burial.seforim && (
                <div className="flex flex-wrap gap-2 py-4">
                  <dt className="w-40 shrink-0 text-xs font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">Seforim</dt>
                  <dd dir="rtl" lang="yi" className="flex-1 text-xl leading-8 text-[var(--navy)]"><MixedText text={burial.seforim} lang="he" /></dd>
                </div>
              )}
              {burial.yahrzeit && (
                <div className="flex flex-wrap gap-2 py-4">
                  <dt className="w-40 shrink-0 text-xs font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">Yahrzeit</dt>
                  <dd className="flex-1 text-lg leading-8 text-stone-700"><MixedText text={burial.yahrzeit} /></dd>
                </div>
              )}
              <div className="flex flex-wrap gap-2 py-4">
                <dt className="w-40 shrink-0 text-xs font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">Buried in</dt>
                <dd className="flex-1 text-lg leading-8 text-stone-700">
                  <Link href={`/cemeteries/${cemetery.slug}`} className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4">
                    {cemetery.name}
                  </Link>
                  <span className="block text-base text-stone-500">{cemetery.city} · {cemetery.country}</span>
                </dd>
              </div>
            </dl>

            {others.length > 0 && (
              <div className="mt-8">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">Also buried there</p>
                <ul className="mt-3 space-y-2">
                  {others.slice(0, 8).map((other) => {
                    const link = allTzaddikim().find((e) => e.burial.name === other.name && e.cemetery.slug === cemetery.slug);
                    return (
                      <li key={other.name} className="text-sm leading-6">
                        {link ? (
                          <Link href={`/tzaddikim/${link.slug}`} className="font-semibold text-[var(--navy)] underline decoration-[var(--gold-light)] underline-offset-2">
                            {other.knownAs || other.name}
                          </Link>
                        ) : (
                          <span className="font-semibold text-[var(--navy)]">{other.knownAs || other.name}</span>
                        )}
                        {other.knownAs && <span className="text-stone-500"> · {other.name}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          <aside className="h-fit space-y-6 lg:sticky lg:top-28">
            <KeverCoordinates coordinates={cemetery.coordinates} address={cemetery.address} />
            <TravelAdvisoryBadge country={cemetery.country} />
            <NearestAirports
              coordinates={cemetery.coordinates}
              rankCoordinates={cemetery.airportRef}
              address={cemetery.address}
              country={cemetery.country}
            />
            <Link
              href={`/cemeteries/${cemetery.slug}`}
              className="block border border-[var(--gold-light)] bg-[#FAF8F3] p-5 text-sm leading-6 text-stone-600 transition hover:border-[var(--gold)]"
            >
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">Getting in</span>
              <span className="mt-1 block font-semibold text-[var(--navy)]">
                Arrival notes and shomer numbers for {cemetery.city} →
              </span>
            </Link>
          </aside>
        </div>
      </section>

      <Footer />
    </main>
  );
}
