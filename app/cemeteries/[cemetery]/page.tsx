import { notFound } from "next/navigation";
import Link from "next/link";
import Footer from "@/components/Footer";
import KeverCoordinates from "@/components/KeverCoordinates";
import KosherNearby from "@/components/KosherNearby";
import MixedText from "@/components/MixedText";
import Navbar from "@/components/Navbar";
import PhotoGallery from "@/components/PhotoGallery";
import SubBrandBanner from "@/components/SubBrand";
import NearestAirports from "@/components/NearestAirports";
import TravelAdvisoryBadge from "@/components/TravelAdvisoryBadge";
import DestinationActions from "@/components/DestinationActions";
import SuggestEditPanel from "@/components/SuggestEditPanel";
import { ReviewSection } from "@/components/reviews/ReviewSection";
import { airportsFor } from "@/lib/destination-actions";
import { cemeteries } from "@/data/cemeteries";
import { kmBetween } from "@/data/itinerary";
import { placeDirectionsUrl } from "@/data/route-utils";
import { getCemeteryView } from "@/lib/cemeteries-view";
import { hrefFor } from "@/lib/tzaddikim";
import { PLACE_CATEGORY_LABELS, PLACE_CATEGORY_ORDER } from "@/lib/content";
import StructuredData from "@/components/StructuredData";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbs, cemeteryPlace } from "@/lib/structured-data";

export function generateStaticParams() {
  return cemeteries.map(({ slug }) => ({ cemetery: slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ cemetery: string }> }) {
  const { cemetery: slug } = await params;
  const cemetery = await getCemeteryView(slug);
  if (!cemetery) return pageMetadata({ title: "Beis hachaim not found | White Glove Kosher Travel", description: "This cemetery record could not be found.", path: `/cemeteries/${slug}`, noIndex: true });
  // The names of the people buried there are what somebody is searching for,
  // so the description leads with them rather than with our own wording.
  const names = cemetery.burials.slice(0, 3).map((burial) => burial.name).filter(Boolean);
  const who = names.length ? `Kevarim of ${names.join(", ")}${cemetery.burials.length > names.length ? " and others" : ""}. ` : "";
  return pageMetadata({
    title: `${cemetery.name} — Kevarim, Address & Access | White Glove`,
    description: `${who}${cemetery.address ? `${cemetery.address}. ` : ""}Navigation, arrival notes and shomer contacts for the beis hachaim in ${cemetery.city ?? cemetery.country ?? "this town"}.`,
    path: `/cemeteries/${cemetery.slug}`,
  });
}

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

export default async function CemeteryPage({ params }: { params: Promise<{ cemetery: string }> }) {
  const { cemetery: slug } = await params;
  const cemetery = await getCemeteryView(slug);
  if (!cemetery) notFound();

  const mapUrl = placeDirectionsUrl(cemetery.address, cemetery.coordinates);
  const hasAccessContacts = Boolean(cemetery.accessContacts?.length);

  // Other entries that are the SAME physical beis hachaim (same spot, or same
  // city + name) — so two kevarim modelled separately still cross-link here.
  const normKey = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const alsoHere = cemeteries.filter((c) => {
    if (c.slug === cemetery.slug) return false;
    const km = kmBetween(c.coordinates, cemetery.coordinates);
    if (km !== null) return km < 0.4;
    return normKey(c.city) === normKey(cemetery.city) && normKey(c.name) === normKey(cemetery.name);
  });

  const placeGroups = PLACE_CATEGORY_ORDER.map((category) => ({
    category,
    label: PLACE_CATEGORY_LABELS[category],
    items: (cemetery.places ?? []).filter((place) => place.category === category),
  })).filter((group) => group.items.length > 0);

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <StructuredData
        data={[
          cemeteryPlace({
            name: cemetery.name,
            description: `Beis hachaim in ${cemetery.city ?? cemetery.country ?? ""}`.trim(),
            path: `/cemeteries/${cemetery.slug}`,
            address: cemetery.address,
            coordinates: cemetery.coordinates,
            country: cemetery.country,
            alternateNames: [cemetery.yiddishName],
          }),
          breadcrumbs([
            { name: "Home", path: "/" },
            { name: "Cemeteries", path: "/cemeteries" },
            { name: cemetery.name, path: `/cemeteries/${cemetery.slug}` },
          ]),
        ]}
      />
      <Navbar />
      <SubBrandBanner />

      <section className="wg-page-hero border-b border-[var(--gold-light)] px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-[var(--gold-ink)]">Beis hachaim · {cemetery.country}</p>
          <h1 dir="rtl" lang="yi" className="mt-5 font-[family-name:var(--font-display)] text-[clamp(2.75rem,8vw,5rem)] leading-tight text-[var(--navy)]">{cemetery.yiddishName}</h1>
          <p className="mt-3 font-[family-name:var(--font-display)] text-3xl text-stone-500 sm:text-4xl">{cemetery.name}</p>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-600">{cemetery.city} · {cemetery.yiddishCity}</p>
          <a href={mapUrl} target="_blank" rel="noreferrer" className="mt-8 inline-block bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--gold)]">Navigate to this beis hachaim →</a>
          <DestinationActions place={{ id: `cemetery-${cemetery.slug}`, name: cemetery.name, yiddishName: cemetery.yiddishName, address: cemetery.address, coordinates: cemetery.coordinates, href: `/cemeteries/${cemetery.slug}` }} airports={airportsFor(cemetery.country, cemetery.address, cemetery.coordinates)} />
          <SuggestEditPanel targetType="location" targetId={cemetery.slug} title={cemetery.name} />
          <ReviewSection placeKind="cemetery" placeRef={cemetery.slug} placeLabel={cemetery.name} sacred />
        </div>
      </section>

      {/* Directly under the hero, because recognising the place is the first
          thing a traveler needs — the gate, the path, the ohel. Renders
          nothing at all when no picture has been published. */}
      <PhotoGallery photos={cemetery.photos} heading="What it looks like" />

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[.7fr_1.3fr]">
          <aside className="wg-card h-fit border border-[var(--gold-light)] bg-[#FAF8F3] p-5 sm:p-7 lg:sticky lg:top-28">
            {/* The address is the headline inside this panel now, so the grey
                repeat of it that used to sit underneath is gone. */}
            <KeverCoordinates coordinates={cemetery.coordinates} address={cemetery.address} />

            <ol className="mt-6 space-y-4 border-t border-[var(--gold-light)] pt-5">
              {cemetery.arrivalNotes.map((note, index) => (
                <li key={note} className="flex gap-3 text-sm leading-6 text-stone-600">
                  <span className="font-semibold text-[var(--gold-ink)]">{index + 1}.</span>
                  {note}
                </li>
              ))}
            </ol>

            {cemetery.accessNote && <p className="mt-6 border-t border-[var(--gold-light)] pt-5 text-sm leading-6 text-stone-600">{cemetery.accessNote}</p>}

            <TravelAdvisoryBadge country={cemetery.country} />

            <NearestAirports coordinates={cemetery.coordinates} rankCoordinates={cemetery.airportRef} address={cemetery.address} country={cemetery.country} />

            {cemetery.accessContacts && (
              <div className="mt-5 space-y-4">
                {cemetery.accessContacts.map((contact) => (
                  <div key={`${contact.label}-${contact.phone ?? contact.email}`}>
                    <p className="font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">{contact.label}</p>
                    {/* Whose number it is. A traveller dialling a strange
                        country has to open with a name, and a number with
                        nobody attached to it is the reason he does not ring. */}
                    {contact.name && (
                      <p className="mt-1 inline-block rounded-full border border-[var(--gold)] px-3 py-0.5 text-xs font-bold tracking-[0.06em] text-[var(--navy)]">
                        Ask for {contact.name}
                      </p>
                    )}
                    <p className="mt-1 text-sm leading-6 text-stone-600">{contact.note}</p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      {contact.phone && <a href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`} className="border border-[var(--gold)] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]">Call {contact.phone}</a>}
                      {contact.email && <a href={`mailto:${contact.email}`} className="border border-[var(--gold-light)] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]">Email access desk</a>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>

          <div>
            {/* A beis hachaim earns its page by existing — where the ground is,
                how to reach it, who holds the key. Names are not the price of
                entry, so this whole section stands down when there are none
                rather than printing a heading over an empty space. It says
                nothing in their place: a visitor is owed the place, not a note
                about how far we have got with it. */}
            {cemetery.burials.length > 0 && (
              <>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Who is buried here</p>
                <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">Known kevarim</h2>
              </>
            )}

            <div className="mt-8 space-y-4">
              {cemetery.burials.map((burial) => (
                <article key={burial.name} className="wg-card border border-[var(--gold-light)] bg-[#FAF8F3] p-5 sm:p-6">
                  {/* Each person has his own page now. He used to exist only as
                      this card, so somebody searching for the man rather than
                      the town had nowhere to land. */}
                  <Link href={hrefFor(burial.name, cemetery.slug) ?? `/cemeteries/${cemetery.slug}`} className="group block">
                    <h3 dir="rtl" lang="yi" className="font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--navy)] underline decoration-[var(--gold-light)] decoration-2 underline-offset-4 group-hover:decoration-[var(--gold)]">{burial.yiddishName}</h3>
                    <p className="mt-2 font-[family-name:var(--font-display)] text-xl text-stone-500">{burial.name}</p>
                  </Link>
                  {burial.knownAs && <p className="mt-3 text-sm font-semibold text-stone-700">{burial.knownAs}</p>}
                  {burial.seforim && <p dir="rtl" lang="yi" className="mt-3 text-lg text-[var(--navy)]">{burial.seforim}</p>}
                  {burial.yahrzeit && (
                    <p className="mt-3 text-sm text-stone-600">
                      Yahrzeit: <MixedText text={burial.yahrzeit} />
                    </p>
                  )}
                  {burial.note && <p className="mt-3 text-sm leading-6 text-stone-600">{burial.note}</p>}
                </article>
              ))}
            </div>

            {alsoHere.length > 0 && (
              <div className="mt-8 border-t border-[var(--gold-light)] pt-5">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">Also resting in this beis hachaim</p>
                <p className="mt-1 text-sm text-stone-500">Other kevarim recorded at the same cemetery:</p>
                <ul className="mt-3 space-y-2">
                  {alsoHere.map((c) => (
                    <li key={c.slug}>
                      <Link href={`/cemeteries/${c.slug}`} className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">{c.name}</Link>
                      <span className="text-sm text-stone-500"> — {c.burials.map((b) => b.knownAs || b.name).slice(0, 3).join(", ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {placeGroups.length > 0 && (
          <div className="mt-14">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Practical information nearby</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">Kosher food, lodging, minyanim & more</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-500">Gathered from public sources — please confirm details before you rely on them.</p>
            <div className="mt-8 space-y-10">
              {placeGroups.map((group) => (
                <div key={group.category}>
                  <h3 className="flex items-baseline gap-3 border-b border-[var(--gold-light)] pb-2">
                    {/* Only where there is a real Yiddish word. An empty span
                        here used to leave a gap where a heading should be. */}
                    {group.label.yiddish && (
                      <span dir="rtl" lang="yi" className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{group.label.yiddish}</span>
                    )}
                    <span className={group.label.yiddish ? "text-sm font-semibold uppercase tracking-[0.12em] text-stone-500" : "font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]"}>{group.label.english}</span>
                  </h3>
                  <div className="mt-5 grid gap-5 md:grid-cols-2">
                    {group.items.map((place) => (
                      <article key={`${place.name}-${place.address ?? ""}`} className="wg-card border border-[var(--gold-light)] bg-[#FAF8F3] p-5 sm:p-6">
                        <p className="font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]">{place.name}</p>
                        {place.address && <p className="mt-2 text-sm leading-6 text-stone-600">{place.address}</p>}
                        {place.hours && <p className="mt-2 text-sm text-stone-600">Hours: {place.hours}</p>}
                        {place.notes && <p className="mt-3 text-sm leading-6 text-stone-600">{place.notes}</p>}
                        <div className="mt-4 flex flex-wrap gap-3">
                          {place.phone && <a href={`tel:${place.phone.replace(/[^+\d]/g, "")}`} className="border border-[var(--gold)] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]">Call {place.phone}</a>}
                          {place.email && <a href={`mailto:${place.email}`} className="border border-[var(--gold-light)] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]">Email</a>}
                          {place.website && <a href={place.website} target="_blank" rel="noreferrer" className="border border-[var(--gold-light)] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]">Website ↗</a>}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {cemetery.coordinates && (
          <div className="mt-14">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Kosher food nearby</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">What&apos;s kosher around here</h2>
            <p className="mt-3 mb-6 max-w-3xl text-sm leading-6 text-stone-500">
              White Glove kosher listings near this beis hachaim. Confirm current supervision directly before you go.
            </p>
            <KosherNearby coordinates={cemetery.coordinates} radiusKm={15} heading="Kosher near this kever" />
          </div>
        )}

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <section className="wg-card border border-[var(--gold-light)] bg-[#FAF8F3] p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Verification</p>
            <p className="mt-3 text-sm leading-7 text-stone-600">
              {hasAccessContacts ? "This cemetery has a public access contact listed above. Please confirm it before traveling." : "No public access contact has been verified for this cemetery yet."}
            </p>
          </section>

          <div>
            
            {/* People who have been often have the picture the next person
                needs — the gate, the path, the ohel. Nothing sent here appears
                until the owner has looked at it. */}
            
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
