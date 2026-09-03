import Link from "next/link";
import { cache, Suspense } from "react";
import { notFound } from "next/navigation";
import Footer from "@/components/Footer";
import GloveMark from "@/components/GloveMark";
import KosherNearby from "@/components/KosherNearby";
import Navbar from "@/components/Navbar";
import AlertSignup from "@/components/AlertSignup";
import DestinationBookingOptions from "@/components/DestinationBookingOptions";
import AddDestinationToTrip from "@/components/AddDestinationToTrip";
import DestinationStickyCta from "@/components/DestinationStickyCta";
import DetailActionRow from "@/components/DetailActionRow";
import AddToItineraryButton from "@/components/AddToItineraryButton";
import DestinationPhotos from "@/components/DestinationPhotos";
import SaveTripItemButton from "@/components/SaveTripItemButton";
import SuggestEditPanel from "@/components/SuggestEditPanel";
import { ReviewSection } from "@/components/reviews/ReviewSection";
import TravelEssentials from "@/components/TravelEssentials";
import VerificationBadge from "@/components/VerificationBadge";
import StructuredData from "@/components/StructuredData";
import { Icon } from "@/components/icons/Icon";
import { placeDirectionsUrl } from "@/data/route-utils";
import { destinations as heritageDestinations, destinationHref as heritageHref } from "@/data/destinations";
import { ACTION_BUTTON_CLASS } from "@/lib/action-button";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbs } from "@/lib/structured-data";
import { fromHechsherState, fromKosherClaim, reconfirmBeforeTravel } from "@/lib/trust-status";
import {
  destinationHref,
  factsFor,
  kosherAvailability,
  shabbosPracticality,
  SIGNAL_CLASSES,
  type Signal,
  type VacationFacts,
} from "@/lib/vacation-ideas";
import { staySearchHref } from "@/lib/stay-search";
import { loadDestinationSources } from "@/lib/vacation-sources";
import { readBookingLink } from "@/lib/booking-access-store";
import { bookingHref } from "@/lib/booking-access";
import { type VacationDestination } from "@/data/vacation-destinations";
import { getVacationDestinations, getVacationDestinationBySlug } from "@/lib/vacation-destinations-view";
import DestinationZmanim from "@/components/DestinationZmanim";
import { publishedMikvaosForCities } from "@/lib/mikvaos";
import { placeMapUrl } from "@/data/route-utils";

/**
 * PRERENDERED, AND THIS IS THE FIX FOR THE THING PEOPLE ACTUALLY NOTICED.
 *
 * This page was `force-dynamic`. Opening /vacation-ideas/rome directly meant:
 * render nothing, show app/vacation-ideas/loading.tsx — "Loading vacation
 * destinations…" — and wait while three unfiltered reads of every attraction,
 * stay and quarter on the site came back, on every single view, for a page
 * whose heading and summary are in a file that has not changed since the build.
 *
 * The reason it was dynamic was real: an entry the owner adds in the admin has
 * to appear here without a deploy. That is what the cache TAG is for. It is
 * cleared the moment an entry is saved (app/admin/add/actions.ts), so the page
 * is rebuilt then rather than being refused a cache for ever.
 *
 * generateStaticParams builds every destination at deploy time, so a direct hit
 * is served from HTML with the H1, the summary and the practical sections
 * already in it. `revalidate` is the backstop for a change this process cannot
 * see: the owner adding a stay in Rome clears the tag and this page is rebuilt.
 *
 * `dynamicParams` USED TO BE OFF, and the reason was sound at the time: the
 * destination list was a file in this repo, so a new destination arrived with a
 * deploy and never between two of them. Off also fixed a real bug — with it on,
 * an address that is not a destination was answered 200 with the loading
 * skeleton on it for ever, because notFound() never reached the response once
 * the shell had been served.
 *
 * The first half of that stopped being true: the owner can now add a
 * destination in the admin, and off would answer it 404 until the next deploy,
 * which is the whole thing this was built to avoid. So it is on again, and the
 * bug it used to mask is held off by shape rather than by a flag — notFound()
 * is the FIRST thing the page does, before any await and before any JSX is
 * returned, and this route has no loading.tsx of its own to serve ahead of it.
 * Move either of those and a wrong address starts answering 200 again.
 */
export const revalidate = 900;
export const dynamicParams = true;

export async function generateStaticParams() {
  // Built at deploy time from everything that exists then, owner-written
  // destinations included. Anything added later is rendered on first request
  // and cached from there — that is what dynamicParams is for.
  return (await getVacationDestinations()).map((destination) => ({ destination: destination.slug }));
}

/**
 * Everything the practical sections need, read once per request.
 *
 * Four Suspense boundaries below all want the same facts. React's cache() makes
 * that one read: without it the boundaries would each start their own, and the
 * page would do the work four times to render it once.
 */
const factsOf = cache(async (destination: VacationDestination): Promise<VacationFacts> =>
  factsFor(destination, await loadDestinationSources(destination)),
);

export async function generateMetadata({ params }: { params: Promise<{ destination: string }> }) {
  const { destination: slug } = await params;
  const destination = await getVacationDestinationBySlug(slug);
  if (!destination) {
    return pageMetadata({
      title: "Destination not found — White Glove Kosher Travel",
      description: "This vacation destination is not on the site.",
      path: `/destinations/${slug}`,
      noIndex: true,
    });
  }
  return pageMetadata({
    title: `Kosher travel in ${destination.name} — what to know before you book | White Glove`,
    description: `${destination.whyGo} Kosher food, Shabbos, where to stay and what to do in ${destination.name}.`,
    path: `/destinations/${destination.slug}`,
  });
}

/**
 * One vacation destination.
 *
 * SEVEN COMPACT SECTIONS, SIX OF THEM FOLDING. The page used to be eleven
 * headed sections laid end to end, and the repetition — a booking button per
 * section, a partner explanation per booking button — is what made it long,
 * not the content. Now it is Overview, Where to stay, Things to do, Kosher
 * food, Shabbos, Getting there and around, Reviews. Each fold is a native
 * <details>/<summary> (the same pattern as ListToolbar's Filter), so it works
 * before and without JavaScript, toggles from the keyboard, and announces
 * itself as expandable with no aria of its own. Overview is open by default;
 * the rest start closed, which is what makes the page short on a phone.
 * Fragment navigation opens the fold it lands in — browsers expand ancestor
 * <details> when the target is inside one — so the "On this page" links and
 * old external anchors (#why-visit, #cautions, …) still arrive somewhere
 * visible. Every pre-fold section id is still in the markup for that reason;
 * scripts/audit-destinations.mjs checks them against the built page.
 *
 * SAID ONCE, IN ONE PLACE. One affiliate disclosure, beside the booking
 * actions in DestinationBookingOptions — it is legally required, and a
 * disclosure repeated four times is one that has stopped being read. One
 * confirm-before-you-travel note, under "Before you book". One planning CTA
 * pair, in the hero. The sticky bar is the one booking action allowed to
 * repeat, because it replaces the per-section buttons that went.
 *
 * EVERY PRACTICAL SECTION IS BUILT FROM DATA THE SITE ALREADY HOLDS. Nothing
 * on this page asserts that a restaurant exists, that a hotel is kosher, or
 * that a shul has a minyan — each of those comes from a listing with a source
 * and a status behind it, and where there is no listing the section says so in
 * as many words. The editorial half — why visit, best time, who it suits — is
 * marked as editorial where it appears, because it is a judgement and the
 * verification labels do not apply to a judgement.
 */

function SignalPanel({ signal, children }: { signal: Signal<string>; children?: React.ReactNode }) {
  return (
    <div className={`rounded-xl border p-5 ${SIGNAL_CLASSES[signal.tone]}`}>
      <p className="flex items-center gap-2 text-sm font-bold">
        <span aria-hidden="true">{signal.glyph}</span>
        {signal.label}
      </p>
      <p className="mt-2 text-sm leading-6">{signal.detail}</p>
      {children}
    </div>
  );
}

/**
 * One folding section. Native <details> — server-rendered, no JS required —
 * with the section's h2 in the summary so the heading outline survives the
 * fold. `.wg-page-section` draws the same hairline between siblings as the
 * old flat sections had.
 */
function Fold({
  id,
  title,
  lead,
  open,
  children,
}: {
  id: string;
  title: string;
  lead?: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details id={id} open={open} className="wg-page-section group scroll-mt-28">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-5 marker:content-none [&::-webkit-details-marker]:hidden">
        <h2 className="font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)] sm:text-3xl">
          {title}
        </h2>
        <Icon
          name="chevron-down"
          className="h-5 w-5 shrink-0 text-[var(--gold-ink)] transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="pb-10">
        {lead && <p className="max-w-3xl leading-7 text-stone-600">{lead}</p>}
        <div className={lead ? "mt-5" : undefined}>{children}</div>
      </div>
    </details>
  );
}

/** An inner heading within a fold — the old section ids live on these. */
function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">{children}</h3>;
}

/** The site's own kevarim guide for the same town, when there is one. */
function heritageGuideFor(destination: VacationDestination) {
  const names = new Set(destination.cities.map((city) => city.toLowerCase()));
  return heritageDestinations.find((entry) => names.has(entry.city.toLowerCase()) && entry.guide);
}

function StaysSection({ facts }: { facts: VacationFacts }) {
  // Nothing to show, so nothing is shown. A panel announcing that this part
  // is unfinished is a page about us; an absent section is a page about Rome.
  if (facts.stays.length === 0 && facts.areas.length === 0) return null;
  return (
    <div className="space-y-6">
      {facts.areas.length > 0 && (
        <div>
          <SubHeading>Which part of town</SubHeading>
          <ul className="mt-3 space-y-3">
            {facts.areas.map((area) => (
              <li key={area.slug} className="rounded-xl border border-[var(--gold-light)] bg-[var(--surface)] p-5">
                <p className="font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--navy)]">
                  {area.name}
                </p>
                <p className="mt-2 leading-7 text-stone-600">{area.note}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {facts.stays.length > 0 && (
        <div>
          <SubHeading>Places to stay</SubHeading>
          <ul className="mt-3 grid gap-4 md:grid-cols-2">
            {facts.stays.map((stay) => {
              const claim = fromKosherClaim(stay.kosherClaim);
              return (
                <li key={stay.slug} className="wg-card border border-[var(--gold-light)] bg-[var(--surface)] p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">{stay.kind}</p>
                  <p className="mt-1 font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--navy)]">
                    {stay.name}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">{stay.summary}</p>
                  {stay.season && (
                    <p className="mt-3 flex items-start gap-2 text-sm font-semibold text-amber-900">
                      <span aria-hidden="true">!</span>
                      <span>Seasonal — {stay.season}</span>
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {claim ? (
                      <VerificationBadge descriptor={claim} size="sm" />
                    ) : (
                      <span className="text-xs text-stone-500">Makes no kashrus claim — listed for where it stands.</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-sm">
            <Link
              href="/hotels"
              className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
            >
              Compare every place to stay on the site
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}

/* ---- the parts that need a read, and what stands in while they wait ------
 *
 * SHAPED LIKE WHAT IS COMING rather than a spinner, and announced rather than
 * merely drawn: a screen reader gets nothing from a grey rectangle, so the
 * status line is the real message and the blocks are hidden from the
 * accessibility tree. Only ever seen for a destination that was not in the
 * build — everything in data/vacation-destinations.ts is prerendered whole. */

function Skeleton({ what, rows = 2 }: { what: string; rows?: number }) {
  return (
    <div aria-busy="true">
      <p role="status" className="text-sm font-semibold text-[var(--navy)]">
        Loading {what}…
      </p>
      <div aria-hidden="true" className="mt-4 grid animate-pulse gap-4 md:grid-cols-2">
        {Array.from({ length: rows * 2 }, (_, index) => (
          <div key={index} className="h-28 rounded-xl border border-[var(--gold-light)] bg-[var(--cream-deep)]" />
        ))}
      </div>
    </div>
  );
}

/** A signal panel's own placeholder: the same box, without a claim in it. */
function SignalFallback({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-stone-300 bg-stone-50 p-5" aria-busy="true">
      <p role="status" className="text-sm font-bold text-stone-600">
        {label} — loading…
      </p>
    </div>
  );
}

/* The two signal panels render ONCE, in the hero grid. The kosher and Shabbos
 * folds used to repeat them word for word; the folds now carry only what the
 * hero does not. */

async function KosherSignal({ destination }: { destination: VacationDestination }) {
  return <SignalPanel signal={kosherAvailability(destination, await factsOf(destination))} />;
}

async function ShabbosSignal({ destination }: { destination: VacationDestination }) {
  return <SignalPanel signal={shabbosPracticality(destination, await factsOf(destination))} />;
}

async function DestinationShabbosExtras({ destination }: { destination: VacationDestination }) {
  const facts = await factsOf(destination);
  const anchor = facts.areas[0];
  if (!anchor?.coordinates) return null;
  return (
    <DestinationZmanim
      placeName={destination.name}
      city={anchor.city}
      country={anchor.country}
      coordinates={anchor.coordinates}
    />
  );
}

async function MinyanimAndMikvaos({ destination }: { destination: VacationDestination }) {
  const heritage = heritageGuideFor(destination);
  const mikvaos = await publishedMikvaosForCities(destination.cities);

  return (
    <>
      {mikvaos.length > 0 && (
        <ul className="mb-6 grid gap-4 md:grid-cols-2">
          {mikvaos.map((listing) => (
            <li key={listing.id} className="rounded-xl border border-[var(--gold-light)] bg-[var(--surface)] p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Mikvah · {listing.city}</p>
              <h4 className="mt-1 font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--navy)]">
                {listing.name}
              </h4>
              {listing.address && <p className="mt-2 text-sm leading-6 text-stone-600">{listing.address}</p>}
              {listing.hours && (
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  <span className="font-semibold text-[var(--navy)]">Hours:</span> {listing.hours}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                {listing.phone && (
                  <a
                    href={`tel:${listing.phone.replace(/[^+\d]/g, "")}`}
                    className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
                  >
                    Call
                  </a>
                )}
                {listing.address && (
                  <a
                    href={placeMapUrl(listing.address, listing.coordinates)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
                  >
                    Map
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {heritage ? (
        <div className="rounded-xl border border-[var(--gold-light)] bg-[var(--surface)] p-5">
          <p className="leading-7 text-stone-600">
            {destination.name} also has a researched guide in the heritage section of this site, and further minyanim,
            mikvaos and local contacts live there.
          </p>
          <p className="mt-4">
            <Link
              href={heritageHref(heritage)}
              className="inline-flex min-h-11 items-center font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
            >
              Open the {heritage.city} guide for minyanim, mikvaos and contacts
            </Link>
          </p>
        </div>
      ) : mikvaos.length === 0 ? (
        <p className="text-sm leading-6 text-stone-600">
          Browse{" "}
          <Link
            href="/mikvaos"
            className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
          >
            mikvaos on the site
          </Link>{" "}
          or the{" "}
          <Link
            href="/directory"
            className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
          >
            provider directory
          </Link>
          .
        </p>
      ) : (
        <p className="text-sm leading-6 text-stone-600">
          <Link
            href="/mikvaos"
            className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
          >
            All mikvaos on the site
          </Link>
          .
        </p>
      )}
    </>
  );
}

async function WhereToStay({ destination }: { destination: VacationDestination }) {
  return <StaysSection facts={await factsOf(destination)} />;
}

async function ThingsToDo({ destination }: { destination: VacationDestination }) {
  const facts = await factsOf(destination);
  if (facts.attractions.length === 0) return null;
  return (
    <>
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {facts.attractions.map((attraction) => (
          <li key={attraction.slug} className="wg-card flex flex-col border border-[var(--gold-light)] bg-[var(--surface)] p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">
              {attraction.kind} · {attraction.city}
            </p>
            <h3 className="mt-1 font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--navy)]">
              {attraction.name}
            </h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">{attraction.summary}</p>

            {/* THE CARD USED TO END HERE, at a name and a sentence.
                Somebody reading about the Roman Forum on the Rome page had no
                way to see where it is, open its own site, or put it on their
                trip — the three things this site exists to do — and the only
                way on was a link at the bottom of the section to browse
                everything on /things-to-do and find it again there. The same
                actions the directory card has always carried are here now. */}
            {attraction.address ? (
              <p className="mt-3 text-xs leading-5 text-stone-500">{attraction.address}</p>
            ) : null}

            {attraction.notes?.length ? (
              <ul className="mt-3 space-y-1.5 text-xs leading-5 text-stone-600">
                {attraction.notes.slice(0, 2).map((note, index) => (
                  <li key={index} className="border-l-2 border-[var(--gold-light)] pl-2.5">
                    {note}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
              {attraction.coordinates ? (
                <a
                  href={placeDirectionsUrl(attraction.address, attraction.coordinates)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center rounded-md border border-[var(--gold-light)] px-3 text-xs font-semibold text-[var(--navy)]"
                >
                  Navigate →
                </a>
              ) : null}
              {attraction.website ? (
                <a
                  href={attraction.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center rounded-md border border-[var(--gold-light)] px-3 text-xs font-semibold text-[var(--navy)]"
                >
                  Hours &amp; tickets ↗
                </a>
              ) : null}
              {attraction.internalHref ? (
                <Link
                  href={attraction.internalHref}
                  className="inline-flex min-h-11 items-center rounded-md border border-[var(--navy)] px-3 text-xs font-semibold text-[var(--navy)]"
                >
                  Full guide
                </Link>
              ) : null}
            </div>

            {/* Pushed to the bottom so the button sits on one line across a
                row of cards of different heights. */}
            <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--gold-light)] pt-3 text-sm">
              <SaveTripItemButton
                item={{
                  id: `attraction-${attraction.slug}`,
                  // A valley or a lake shore is a coordinate and nothing else,
                  // so the town is the fallback rather than a blank line in
                  // somebody's route.
                  name: attraction.name,
                  address: attraction.address || `${attraction.city}, ${attraction.country}`,
                  coordinates: attraction.coordinates,
                  href: `/things-to-do#${attraction.slug}`,
                }}
                label="Add to my route"
              />
              {/* The route is the driving order; the itinerary is the trip.
                  Somebody reading about the Forum wants one or the other and
                  the card offered only the first. */}
              <AddToItineraryButton
                place={{
                  id: `attraction-${attraction.slug}`,
                  name: attraction.name,
                  address: attraction.address || `${attraction.city}, ${attraction.country}`,
                  coordinates: attraction.coordinates,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-sm">
        <Link
          href="/things-to-do"
          className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
        >
          Browse everything to do on the site
        </Link>
      </p>
    </>
  );
}

async function KosherFood({ destination }: { destination: VacationDestination }) {
  const facts = await factsOf(destination);
  // Centre the curated kosher listings on the quarter's published coordinate,
  // or the anchor a stay is measured from. Both are real positions for a shul
  // or a street — never a guess at the middle of a city.
  const anchor = facts.areas[0]?.coordinates ?? facts.stays[0]?.anchor?.coordinates;
  return (
    <>
      {facts.eateries.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2">
          {facts.eateries.map((eatery) => {
            const hechsher = fromHechsherState(eatery.hechsher.state);
            return (
              <li key={eatery.slug} className="wg-card border border-[var(--gold-light)] bg-[var(--surface)] p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">
                  {[eatery.kind, eatery.diet].filter(Boolean).join(" · ")}
                </p>
                <h3 className="mt-1 font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--navy)]">
                  {eatery.name}
                </h3>
                <p className="mt-2 text-sm leading-6 text-stone-600">{eatery.summary}</p>
                {hechsher && (
                  <div className="mt-3">
                    <VerificationBadge descriptor={hechsher} size="sm" />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {facts.base && (facts.base.eateries.length > 0 || facts.base.areas.length > 0) && (
        <div className="mt-6 rounded-xl border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
          <SubHeading>Where to shop on the way in</SubHeading>
          <p className="mt-2 leading-7 text-stone-600">{facts.base.note}</p>
          <ul className="mt-3 space-y-2">
            {facts.base.eateries.map((eatery) => (
              <li key={eatery.slug} className="text-sm leading-6 text-stone-600">
                <span className="font-semibold text-[var(--navy)]">{eatery.name}</span> — {eatery.summary}
              </li>
            ))}
            {facts.base.areas.map((area) => (
              <li key={area.slug} className="text-sm leading-6 text-stone-600">
                <span className="font-semibold text-[var(--navy)]">{area.name}</span> — {area.note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {anchor ? (
        <div className="mt-6 rounded-xl border border-[var(--gold-light)] bg-[var(--surface)] p-5">
          <KosherNearby
            coordinates={anchor}
            heading={`Kosher food near ${destination.name}`}
            radiusKm={10}
            showAddToTrip
          />
        </div>
      ) : (
        <p className="mt-6 text-sm">
          <Link
            href="/kosher"
            className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
          >
            Browse the kosher food finder
          </Link>
        </p>
      )}
    </>
  );
}

export default async function VacationDestinationPage({ params }: { params: Promise<{ destination: string }> }) {
  const { destination: slug } = await params;
  const destination = await getVacationDestinationBySlug(slug);
  if (!destination) notFound();

  // The only await the SHELL does. Everything below the heading that needs a
  // read is behind a Suspense boundary, so the H1, the summary and the
  // editorial sections are in the first byte of HTML either way.
  const booking = await readBookingLink();

  const contents: Array<[string, string]> = [
    ["overview", "Overview"],
    ["where-to-stay", "Where to stay"],
    ["things-to-do", "Things to do"],
    ["kosher-food", "Kosher food"],
    ["shabbos", "Shabbos"],
    ["getting-around", "Getting there and around"],
    ["reviews", "Reviews"],
  ];

  return (
    <main className="min-h-screen bg-[var(--cream)] text-[var(--ink)]">
      <StructuredData
        data={breadcrumbs([
          { name: "Home", path: "/" },
          { name: "Destinations", path: "/destinations" },
          { name: destination.name, path: `/destinations/${destination.slug}` },
        ])}
      />
      <Navbar />

      <section className="wg-page-hero border-b border-[var(--gold-light)] px-5 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <nav aria-label="Breadcrumb" className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">
            <Link href="/destinations" className="underline decoration-[var(--gold)] underline-offset-4">
              Destinations
            </Link>
            <span aria-hidden="true" className="mx-2 text-stone-400">
              /
            </span>
            <span className="text-stone-600">{destination.country}</span>
          </nav>

          <h1 className="mt-5 font-[family-name:var(--font-display)] text-[clamp(2.5rem,7vw,4.25rem)] leading-[1.06] text-[var(--navy)]">
            {destination.name}
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-stone-600">{destination.overview}</p>

          {/* The same essential icons as every other detail surface —
              directions, share, favorite, route, itinerary — plus the pencil.
              See components/DetailActionRow.tsx. */}
          <DetailActionRow
            place={{
              id: `vacation-${destination.slug}`,
              name: destination.name,
              address: `${destination.name}, ${destination.country}`,
              href: `/destinations/${destination.slug}`,
            }}
          />
          <SuggestEditPanel targetType="location" targetId={destination.slug} title={destination.name} />

          {/* Nothing at all until there is a credited picture — see
              components/DestinationPhotos.tsx. */}
          <DestinationPhotos photos={destination.photos} name={destination.name} />

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-[var(--gold-light)] bg-[var(--surface)] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">Ideal length</p>
              <p className="mt-1 font-semibold text-[var(--navy)]">{destination.suggestedLength}</p>
            </div>
            <div className="rounded-xl border border-[var(--gold-light)] bg-[var(--surface)] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">Best for</p>
              <p className="mt-1 font-semibold text-[var(--navy)]">{destination.bestFor.join(" · ")}</p>
            </div>
            <Suspense fallback={<SignalFallback label="Kosher food" />}>
              <KosherSignal destination={destination} />
            </Suspense>
            <Suspense fallback={<SignalFallback label="Shabbos" />}>
              <ShabbosSignal destination={destination} />
            </Suspense>
          </div>

          {/* THE ONE PLANNING CTA PAIR ON THE PAGE. The per-section repeats —
              a "start a trip" button under the outline, another pair at the
              foot — folded into this one and the sticky bar. And THE OFFER
              THAT WENT: "Have us plan Rome" once sat beside the first button;
              personal trip planning has since been removed from the site
              outright — see AGENTS.md. */}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={staySearchHref({ destination: destination.name })}
              className={`inline-flex min-h-11 items-center ${ACTION_BUTTON_CLASS.primary}`}
            >
              See places to stay in {destination.name}
            </Link>
            {/* An action, not a link to the questionnaire — see
                components/AddDestinationToTrip.tsx for what this used to do
                and why it was the one ungated trip action on the site. */}
            <AddDestinationToTrip
              name={destination.name}
              href={destinationHref(destination)}
              className={`inline-flex min-h-11 items-center ${ACTION_BUTTON_CLASS.secondary} disabled:opacity-60`}
            />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <nav aria-label="On this page" className="border-b border-[var(--gold-light)] py-6">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">On this page</h2>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
            {contents.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold-light)] underline-offset-4 hover:decoration-[var(--gold)]"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <Fold id="overview" title="Overview" open>
          <div id="why-visit" className="scroll-mt-28">
            <SubHeading>Why visit</SubHeading>
            <ul className="glove-list mt-3 max-w-3xl space-y-2 leading-7 text-stone-600">
              {destination.whyVisit.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          <div id="when-and-how-long" className="mt-8 grid scroll-mt-28 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <SubHeading>Best time</SubHeading>
              <p className="mt-2 max-w-2xl leading-7 text-stone-600">{destination.bestTime}</p>
              <div className="mt-6">
                <SubHeading>Who it suits</SubHeading>
              </div>
              <p className="mt-2 max-w-2xl leading-7 text-stone-600">{destination.suits}</p>
            </div>
            <div className="rounded-xl border border-[var(--gold-light)] bg-[var(--surface)] p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">Give it</p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">
                {destination.suggestedLength}
              </p>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                Seasons this works in: {destination.seasons.join(", ")}.
              </p>
            </div>
          </div>

          <p className="mt-6 max-w-3xl rounded-lg border-l-4 border-[var(--gold)] bg-[#FAF8F3] px-5 py-3 text-sm leading-6 text-stone-600">
            <span className="font-semibold text-[var(--navy)]">This section is our view of the place.</span> The
            practical detail below comes from listings with a named source.
          </p>
        </Fold>

        <Fold
          id="where-to-stay"
          title="Where to stay"
          lead="Which part of town matters more than which hotel — that is the decision that makes Shabbos walkable or not."
        >
          <Suspense fallback={<Skeleton what={`where to stay in ${destination.name}`} />}>
            <WhereToStay destination={destination} />
          </Suspense>
        </Fold>

        <Fold id="things-to-do" title="Things to do">
          <Suspense fallback={<Skeleton what={`things to do in ${destination.name}`} rows={3} />}>
            <ThingsToDo destination={destination} />
          </Suspense>
        </Fold>

        <Fold
          id="kosher-food"
          title="Kosher food"
          lead={`Kosher restaurants, bakeries and groceries in ${destination.name} — kosher, not kosher-style. Confirm current supervision before you eat.`}
        >
          <Suspense fallback={<Skeleton what={`kosher food in ${destination.name}`} />}>
            <KosherFood destination={destination} />
          </Suspense>
        </Fold>

        <Fold id="shabbos" title="Shabbos">
          <Suspense fallback={null}>
            <DestinationShabbosExtras destination={destination} />
          </Suspense>
          <div id="minyanim-and-mikvaos" className="mt-8 scroll-mt-28">
            <SubHeading>Minyanim and mikvaos</SubHeading>
            <div className="mt-3">
              <Suspense fallback={<Skeleton what={`minyanim and mikvaos in ${destination.name}`} />}>
                <MinyanimAndMikvaos destination={destination} />
              </Suspense>
            </div>
          </div>
        </Fold>

        <Fold id="getting-around" title="Getting there and around">
          <p className="max-w-3xl leading-7 text-stone-600">{destination.transport}</p>
          {/* The car search, carrying the destination as the pick-up — a link
              that says the site knows where you are going and then asks again
              is worse than one that never claimed to.

              RESOLVED, NEVER A TYPED /book: the owner can put that path behind
              an access code, and this is a public page. Only bookingHref may
              decide where a booking link lands. See lib/booking-access.ts. */}
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link
              href={bookingHref(booking, { type: "cars", destination: destination.name })}
              className="inline-flex min-h-11 items-center rounded-md border border-[var(--gold)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--cream-deep)]"
            >
              Car hire in {destination.name}
            </Link>
            {booking.searchIsPublic && (
              <Link
                href={booking.href}
                className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
              >
                Everything in one search
              </Link>
            )}
          </div>

          {destination.outline && (
            <div id="outline" className="mt-8 scroll-mt-28">
              <SubHeading>A shape for the days</SubHeading>
              <p className="mt-2 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
                {destination.outline.title}
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
                An outline to adapt, not a booking — nothing here is reserved and the order is yours to change.
              </p>
              <ol className="mt-4 max-w-3xl space-y-4">
                {destination.outline.days.map((day, index) => (
                  <li key={day} className="flex gap-4 border-t border-[var(--gold-light)] pt-4">
                    <span className="mt-1 shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">
                      Day {index + 1}
                    </span>
                    <span className="leading-7 text-stone-600">{day}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* THE ONE CONFIRM-BEFORE-YOU-TRAVEL NOTE. The Shabbos, kosher and
              mikvah sections each used to carry their own; what moves is the
              same in every case, so it is said once, here, with the cautions. */}
          <div id="cautions" className="mt-8 scroll-mt-28">
            <SubHeading>Before you book</SubHeading>
            <ul className="mt-3 max-w-3xl space-y-3">
              {destination.cautions.map((caution) => (
                <li key={caution} className="flex gap-3 rounded-lg border-l-4 border-[var(--gold)] bg-[#FAF8F3] px-5 py-4">
                  <GloveMark size="sm" className="mt-1" />
                  <span className="leading-7 text-stone-700">{caution}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex max-w-3xl flex-wrap items-center gap-3">
              <VerificationBadge descriptor={reconfirmBeforeTravel()} />
              <p className="max-w-2xl text-sm leading-6 text-stone-600">
                Candle-lighting times, whether a shul still has a regular minyan, and whether a seasonal kosher kitchen
                is running are all things that move. Confirm them for your dates.{" "}
                <Link
                  href="/verification"
                  className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
                >
                  What the labels on this page mean
                </Link>
              </p>
            </div>
          </div>
        </Fold>

        {/* Reviews stay flat rather than folded: ReviewSection carries its own
            heading, and a review is the one thing here a visitor may have come
            back specifically to leave. */}
        <section id="reviews" className="wg-page-section scroll-mt-28 py-10">
          <ReviewSection placeKind="destination" placeRef={destination.slug} placeLabel={destination.name} />
        </section>

        {/* Rides the bottom of the viewport while there is page left, then
            lets go — the last section and the footer are never underneath it.
            The one booking action allowed to repeat: it replaces the buttons
            the folded sections used to carry. See
            components/DestinationStickyCta.tsx. */}
        <DestinationStickyCta
          destination={destination.name}
          flightsHref={bookingHref(booking, { type: "flights" })}
          carsHref={bookingHref(booking, { type: "cars", destination: destination.name })}
        />
      </div>

      {/* The booking hand-offs, and the page's ONE affiliate disclosure —
          beside the actions it applies to, said once. */}
      <DestinationBookingOptions destinationName={destination.name} destinationSlug={destination.slug} />

      {/* Travel Essentials — insurance, eSIM, transfers, tours when configured.
          Renders nothing until a service is enabled with a real hand-off.
          Hotel/flight/car search blocks stay in DestinationBookingOptions. */}
      <TravelEssentials
        pageType="destination"
        destinationName={destination.name}
        destinationSlug={destination.slug}
        heading={`Before you go to ${destination.name}`}
        intro="Each link opens with the provider, who handles the purchase and its terms."
        placement="destination-essentials"
      />

      <section className="border-t border-[var(--gold-light)] px-5 py-10 sm:px-8 sm:py-12">
        <div className="mx-auto max-w-3xl">
          <AlertSignup
            kind="destination"
            destinationName={destination.name}
            destinationSlug={destination.slug}
            sourcePage={`/destinations/${destination.slug}`}
          />
        </div>
      </section>

      <section className="border-t border-[var(--gold-light)] bg-[var(--cream-deep)] px-5 py-10 sm:px-8 sm:py-12">
        <div className="mx-auto max-w-7xl">
          <h2 className="font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--navy)]">
            Ready to book {destination.name}?
          </h2>
          <p className="mt-3 max-w-2xl leading-7 text-stone-600">
            Rooms and prices come from our booking partners above, and the itinerary planner holds the trip day by day —
            free.
          </p>
        </div>
      </section>

      <Footer />
    </main>
  );
}
