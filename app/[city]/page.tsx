import { notFound } from "next/navigation";
import { configuredBrand } from "@/lib/site-brand-core";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import SubBrandBanner from "@/components/SubBrand";
import DestinationActions from "@/components/DestinationActions";
import SuggestEditPanel from "@/components/SuggestEditPanel";
import { ReviewSection } from "@/components/reviews/ReviewSection";
import { airportsFor } from "@/lib/destination-actions";
import { getCemetery } from "@/data/cemeteries";
import SectionHeading from "@/components/SectionHeading";
import { GettingThere, NearbyKevarim, TownQuestions, WhoIsBuried } from "@/components/TownSections";
import PhotoGallery from "@/components/PhotoGallery";
import PracticalInformation from "@/components/PracticalInformation";
import { cityGuides, getCityGuide } from "@/data/destinations-detailed";
import { placeDirectionsUrl } from "@/data/route-utils";
import { getDestinationRecord } from "@/data/destination-database";
import { getPublishedDestinationContent } from "@/lib/content";
import { checkedOn } from "@/lib/trust-status";
import { nearbyKevarim } from "@/lib/nearby-kevarim";
import { otherBurials, townQuestions } from "@/lib/town-questions";
import { publishableLinks } from "@/lib/useful-links";
import StructuredData from "@/components/StructuredData";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbs, faqPage, touristAttraction } from "@/lib/structured-data";

export function generateStaticParams() {
  return cityGuides.map(({ slug }) => ({ city: slug }));
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

/**
 * Every guide says who is buried there, in the title.
 *
 * These pages all shared one line — "White Glove Kosher Travel | Luxury Kosher
 * Travel" — so a search result for Uman and one for Lizhensk were
 * indistinguishable, and neither said what the page was. Somebody searching
 * for a tzaddik is searching for the tzaddik's name.
 */
export async function generateMetadata({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  const guide = getCityGuide(city);
  if (!guide) return pageMetadata({ title: "Destination not found | White Glove Kosher Travel", description: "This destination guide could not be found.", path: `/${city}`, noIndex: true });
  return pageMetadata({
    title: `${guide.city} Travel Guide & Kever of ${guide.tzaddik} | White Glove`,
    description: `${guide.city}, ${guide.country}: how to reach the kever of ${guide.tzaddik}, who else is buried there, access and shomer details, kosher food, minyanim and mikvaos — checked before it is published.`,
    path: `/${guide.slug}`,
  });
}

/**
 * The day somebody last confirmed this number answers, when there is one.
 *
 * A phone number is the most perishable record on the site: it reads as
 * complete for years after it has stopped working, and a shomer number that
 * does not answer is the one that strands somebody at a locked gate. So the
 * date is worth saying where it exists.
 *
 * Only the admin-managed contacts carry one, and only once they are verified
 * — lib/content-admin.ts stamps it on save and refuses to stamp anything that
 * is not verified. The built-in guide contacts have no date and this says
 * nothing about them, which is the honest reading of "nobody has checked".
 */
function checkedOnFor(contact: unknown): string | null {
  const value = (contact as { lastVerified?: Date | string | null }).lastVerified;
  if (!value) return null;
  return checkedOn(value instanceof Date ? value.toISOString() : String(value));
}

export default async function CityGuidePage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  // A kosher-guide page. /[city] is a catch-all, so it cannot go in the
  // middleware's guide-only redirect list (that would bounce /plan, /book and
  // every other top-level path too) — so the brand guard lives here: on the
  // itineraries build a city slug is simply not found, rather than rendering
  // the kosher city guide on the general-travel domain. `configuredBrand`
  // (the build's own brand) rather than the per-request host, so the page
  // stays statically rendered on the kosher build instead of going dynamic.
  if (configuredBrand() === "itineraries") notFound();
  const guide = getCityGuide(city);
  if (!guide) notFound();
  const cemetery = getCemetery(guide.slug);
  const destinationRecord = getDestinationRecord(guide.slug);
  // DB-backed practical listings, when the content database is connected.
  const dbContent = await getPublishedDestinationContent(guide.slug);
  // Prefer DB-managed contacts when the admin has entered any; otherwise the
  // static guide contacts. Both shapes expose label/phone/email/note.
  const accessContacts = dbContent?.contacts.length
    ? dbContent.contacts
    : guide.accessContacts ?? (guide.accessContact ? [guide.accessContact] : []);

  const graveMapUrl = guide.graveAddress ? placeDirectionsUrl(guide.graveAddress, guide.graveCoordinates) : undefined;

  // THE SAME FOUR SECTIONS ON EVERY TOWN, BUILT FROM EACH TOWN'S OWN RECORD.
  //
  // Lizhensk used to be a hand-written page at its own route with sections no
  // other town had — how to get there, who lies at the ohel, what else is
  // nearby, the questions people ask. They were the right sections and the
  // wrong way to have them: thirteen other towns had none of it, and none of
  // it was editable.
  //
  // So each one is derived here from fields the guide and the listing already
  // carry, and every town gets it or does not on the strength of its own
  // record. A section with nothing behind it is not rendered at all, which is
  // the rule for the rest of the site and the reason those cards could not
  // simply be copied across as headings.
  // RANKING POINT, NOT A NAVIGATION POINT.
  //
  // The grave pin when there is one, the town pin when there is not. Ranking
  // airports and measuring what else is nearby only needs to know roughly
  // where the town is, and three of these towns have no published grave
  // coordinate — without this they fell back to "the main airports of Poland"
  // and an empty nearby list. Navigation is untouched: graveMapUrl below is
  // built from graveAddress and graveCoordinates only, so nothing sends a
  // traveller to a town centre.
  const rankingPoint = guide.graveCoordinates ?? guide.townCoordinates;
  const airports = airportsFor(guide.country, guide.graveAddress, rankingPoint);
  // The tzaddik the town is known for is named in the panel above; this is
  // everybody else, from the guide and from the beis hachaim listing.
  const alsoBuried = otherBurials(guide, cemetery);
  const measuredAirports = airports.length > 0 && airports.every((airport) => airport.km);
  const nearby = nearbyKevarim(guide.slug, { from: rankingPoint });
  const questions = townQuestions(guide, cemetery, airports);
  const stayDestination = encodeURIComponent(`${guide.city}, ${guide.country}`);
  // Owner-managed in the admin, with the built-in ones from the guide record
  // behind them. Anything that is not an http(s) address is dropped rather
  // than printed into an href — see lib/useful-links.ts.
  const usefulLinks = publishableLinks([...(dbContent?.links ?? []), ...(guide.usefulLinks ?? [])]);
  // Only the sections that exist get a jump link, so the bar never points at
  // nothing.
  const jumpLinks = [
    airports.length ? { href: "#getting-there", label: "Getting there" } : null,
    alsoBuried.length ? { href: "#buried-here", label: "Who is buried here" } : null,
    { href: "#practical", label: "Practical guide" },
  ].filter((link): link is { href: string; label: string } => link !== null);

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <StructuredData
        data={[
          touristAttraction({
            name: `${guide.city} — kever of ${guide.tzaddik}`,
            description: guide.overview,
            path: `/${guide.slug}`,
            address: guide.graveAddress,
            coordinates: guide.graveCoordinates,
            country: guide.country,
            alternateNames: [guide.yiddishCity, ...(guide.aliases ?? [])],
          }),
          ...(questions.length ? [faqPage(questions)] : []),
          breadcrumbs([
            { name: "Home", path: "/" },
            { name: "Destinations", path: "/destinations" },
            { name: guide.city, path: `/${guide.slug}` },
          ]),
        ]}
      />
      <Navbar />
      <SubBrandBanner />

      <section className="wg-page-hero border-b border-[var(--gold-light)] px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-[var(--gold-ink)]">City guide · {guide.country}</p>
          <h1 dir="rtl" lang="yi" className="mt-5 font-[family-name:var(--font-display)] text-[clamp(2.75rem,8vw,5rem)] leading-tight text-[var(--navy)]">{guide.yiddishCity}</h1>
          <p className="mt-3 font-[family-name:var(--font-display)] text-3xl leading-tight text-stone-500 sm:text-4xl">{guide.city}</p>
          <p className="mt-6 max-w-2xl text-xl leading-8 text-stone-600">A White Glove guide to the journey, the tzaddik, and the practical details that matter most.</p>
          {/* Written out rather than interpolated: Tailwind reads the class
              names out of the source, so a built-up `sm:grid-cols-${n}` is a
              class that never gets generated. */}
          <div className={`mt-10 grid border-y border-[var(--gold-light)] ${jumpLinks.length === 3 ? "sm:grid-cols-3" : jumpLinks.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}>
            {jumpLinks.map((link, index) => (
              <a
                key={link.href}
                href={link.href}
                className={`border-b border-[var(--gold-light)] px-5 py-5 text-center text-xs font-bold uppercase tracking-[0.16em] text-[var(--navy)] transition hover:bg-[var(--cream-deep)] sm:border-b-0 ${index < jumpLinks.length - 1 ? "sm:border-r" : ""}`}
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </section>

      {guide.safetyNote && (
        <section className="border-b border-amber-200 bg-[#fff8e8] px-5 py-5 sm:px-8">
          <div className="mx-auto max-w-7xl text-sm leading-7 text-stone-700"><strong className="font-semibold text-[var(--navy)]">Current travel notice:</strong> {guide.safetyNote}</div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[.85fr_1.15fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold-ink)]">At the kever</p>
            <h2 dir="rtl" lang="yi" className="mt-4 font-[family-name:var(--font-display)] text-5xl leading-tight text-[var(--navy)] sm:text-6xl">{guide.yiddishTzaddik}</h2>
            <p className="mt-3 font-[family-name:var(--font-display)] text-2xl leading-tight text-stone-500 sm:text-3xl">{guide.tzaddik}</p>

            <div className="mt-7 flex flex-wrap gap-3">
              {graveMapUrl && <a href={graveMapUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--gold)]">Navigate to the kever →</a>}
              {cemetery && <a href={`/cemeteries/${cemetery.slug}`} className="inline-flex min-h-11 items-center bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--gold)]">View this <span lang="he" dir="rtl">בית החיים</span> →</a>}
            </div>
            <DestinationActions place={{ id: guide.slug, name: guide.city, yiddishName: guide.yiddishCity, address: guide.graveAddress ?? `${guide.city}, ${guide.country}`, coordinates: guide.graveCoordinates, href: `/${guide.slug}` }} airports={airportsFor(guide.country, guide.graveAddress, guide.graveCoordinates)} />
            <SuggestEditPanel targetType="location" targetId={guide.slug} title={guide.city} />
            <ReviewSection placeKind="kever" placeRef={guide.slug} placeLabel={guide.city} sacred />

            {guide.findingNotes && <div className="mt-8 border-t border-[var(--gold-light)] pt-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Finding the kever</p>
              <ol className="mt-4 space-y-3">
                {guide.findingNotes.map((note, index) => <li key={note} className="flex gap-3 text-sm leading-6 text-stone-600"><span className="font-semibold text-[var(--gold-ink)]">{index + 1}.</span><span>{note}</span></li>)}
              </ol>
            </div>}
            
            {/* A picture of the town, or of one of its listings. Nothing sent
                here appears until the owner has looked at it. */}
            
          </div>

          <div className="border-l border-[var(--gold)] pl-5 sm:pl-7">
            <p className="text-lg leading-8 text-stone-600">{guide.overview}</p>
            <div className="mt-8 grid gap-5 sm:grid-cols-3">
              <div><p className="text-xs font-bold uppercase tracking-[0.17em] text-[var(--gold-ink)]">Seforim</p><p dir="rtl" lang="yi" className="mt-2 font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">{guide.seforim}</p></div>
              <div><p dir="rtl" lang="yi" className="text-xs font-bold tracking-[0.12em] text-[var(--gold-ink)]">יארצייט</p><p dir="rtl" lang="yi" className="mt-2 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{guide.yahrzeit}</p></div>
              <div><p dir="rtl" lang="yi" className="text-xs font-bold tracking-[0.12em] text-[var(--gold-ink)]">שנת פטירה</p><p dir="rtl" lang="yi" className="mt-2 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{guide.niftar}</p></div>
            </div>

            {accessContacts.length > 0 ? <div className="wg-card mt-8 border border-[var(--gold-light)] bg-[#fcfaf6] p-5 sm:p-6">
              <p className="text-xs font-bold uppercase tracking-[0.17em] text-[var(--gold-ink)]">Shomer & access contact</p>
              <div className="mt-4 space-y-5">
                {accessContacts.map((contact) => <div key={`${contact.label}-${contact.phone ?? contact.email}`} className="border-t border-[var(--gold-light)] pt-4 first:border-t-0 first:pt-0"><h3 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{contact.label}</h3>{"name" in contact && contact.name ? <p className="mt-2 inline-block rounded-full border border-[var(--gold)] px-3 py-0.5 text-xs font-bold tracking-[0.06em] text-[var(--navy)]">Ask for {contact.name}</p> : null}<p className="mt-2 text-sm leading-6 text-stone-600">{contact.note}</p><div className="mt-3 flex flex-wrap gap-3">{contact.phone && <a href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`} className="border border-[var(--gold)] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]">Call {contact.phone}</a>}{contact.email && <a href={`mailto:${contact.email}`} className="border border-[var(--gold-light)] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]">Email access desk</a>}</div>{checkedOnFor(contact) && <p className="mt-3 text-[11px] leading-4 text-stone-500">Checked on {checkedOnFor(contact)}</p>}</div>)}
              </div>
            </div> : <div className="wg-card mt-8 border border-dashed border-[var(--gold-light)] p-5 sm:p-6">
              <p className="text-xs font-bold uppercase tracking-[0.17em] text-[var(--gold-ink)]">Shomer & access contact</p>
              <p className="mt-2 text-sm leading-6 text-stone-600">There is no public shomer or cemetery-access number for this kever. The guide has the exact map pin — if you find a number on a travel list, confirm it before you rely on it.</p>
            </div>}
          </div>
        </div>
      </section>

      <GettingThere airports={airports} country={guide.country} measured={measuredAirports} stayDestination={stayDestination} />

      <WhoIsBuried
        burials={alsoBuried}
        title="Who else is buried here."
        description="Everybody a source places in this ground, beside the tzaddik the town is known for."
      />

      <section id="practical" className="border-y border-[var(--gold-light)] bg-[var(--cream-deep)] px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeading eyebrow="Practical guide" title="Everything around the visit." description="Accommodations, food, minyanim, mikvaos, and transport are kept together here. A detail appears only when it has been checked for this exact destination." />
          <PhotoGallery photos={dbContent?.photos ?? []} />
          {destinationRecord && <PracticalInformation record={destinationRecord} places={dbContent?.places ?? []} />}
        </div>
      </section>

      <NearbyKevarim nearby={nearby} />

      {usefulLinks.length > 0 && (
        <section className="border-t border-[var(--gold-light)] px-5 py-20 sm:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="Useful links"
              title="Elsewhere on this town."
              description="Sites that know this town better than we do. They open in a new tab, and are not ours."
            />
            <div className="mt-12 grid gap-5 md:grid-cols-2">
              {usefulLinks.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer nofollow"
                  className="block border border-[var(--gold-light)] bg-[#fcfaf6] p-7 transition hover:border-[var(--gold)]"
                >
                  {/* The host, said out loud. A link that leaves the site
                      should say where it goes before it is clicked. */}
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--gold-ink)]">{link.host}</p>
                  <h3 className="mt-3 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{link.label}</h3>
                  {link.note && <p className="mt-3 leading-7 text-stone-600">{link.note}</p>}
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      <TownQuestions questions={questions} />
      <Footer />
    </main>
  );
}
