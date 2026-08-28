import Link from "next/link";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import StartingPoints from "@/components/StartingPoints";
import TripStartFlow from "@/components/TripStartFlow";
import { ACTION_BUTTON_CLASS } from "@/lib/action-button";
import { getVacationDestinationBySlug } from "@/lib/vacation-destinations-view";
import { pageMetadata } from "@/lib/seo";
import { TRIP_KINDS, type TripKind } from "@/lib/trip-plan";
import { currentBrand } from "@/lib/site-brand";

// Brand-aware: reachable on both domains, and its own title used to say
// "kosher trip" outright — the itineraries domain plans trips of every kind.
export async function generateMetadata() {
  const brand = await currentBrand();
  const itineraries = brand === "itineraries";
  return pageMetadata({
    title: itineraries ? "Plan a trip — start here | White Glove Itineraries" : "Plan a kosher trip — start here | White Glove Kosher Travel",
    description: "Start a trip: the kind of holiday, where and when, and who is coming.",
    path: "/plan",
  });
}

/**
 * The front door to planning.
 *
 * It exists because the planner was the front door and should not have been:
 * it opens on an empty trip with eleven buttons, and somebody who has decided
 * they would like to go away this summer does not know which to press. The
 * three steps here are the ones a person actually answers first, and both
 * paths out of them arrive somewhere with the answers already filled in.
 *
 * THREE SHORT STEPS, NOT THREE QUESTIONS. Step two holds four fields, so
 * calling the whole thing "three questions" was a promise the page below did
 * not keep — and the counter under it said so out loud, in as many words.
 * Pace, interests, kashrus, Shabbos and access needs are asked afterwards, in
 * an optional section. See lib/trip-plan.ts.
 */
export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ destination?: string; kind?: string }>;
}) {
  const { destination: slug, kind } = await searchParams;
  // Public and self-service: this is the visitor planning their own trip, so
  // it stays open and findable. (The done-for-you planning — us planning a
  // trip for someone — is the thing that is gone from the site; that is what
  // "no planning" means here, not this page.) Building and saving a trip is
  // still behind sign-in on /itinerary and /my-route.
  // "Add Rome to a trip" from a destination card. The slug is looked up rather
  // than printed, so a made-up query string cannot put arbitrary text into the
  // field as though the visitor had typed it.
  const destination = slug ? await getVacationDestinationBySlug(slug) : undefined;
  const initialKind = (TRIP_KINDS.find((entry) => entry.value === kind)?.value ?? "") as TripKind | "";
  // The itineraries side points NOTHING at the kosher guide. /destinations and
  // /heritage are guide-only paths that redirect to the kosher domain, so the
  // two CTAs below are kosher-only — on itineraries they would eject the
  // visitor off the site entirely.
  const brand = await currentBrand();
  const itineraries = brand === "itineraries";

  return (
    <main className="min-h-screen bg-[var(--cream)] text-[var(--ink)]">
      <Navbar />

      <section className="wg-page-hero border-b border-[var(--gold-light)] px-5 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-[var(--gold-ink)]">Start a trip</p>
          <h1 className="mt-5 max-w-4xl font-[family-name:var(--font-display)] text-[clamp(2.25rem,6vw,3.75rem)] leading-[1.08] text-[var(--navy)]">
            {destination ? `Let’s plan ${destination.name}.` : "Tell us roughly what you have in mind."}
          </h1>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
        <TripStartFlow initialDestination={destination?.name ?? ""} initialKind={initialKind} brand={brand} />
      </section>

      {/* The other three doors, for somebody who opened this one and would
          rather browse, build it themselves, or hand it over.
          lib/starting-points.ts. */}
      <section className="mx-auto max-w-5xl px-5 pb-12 sm:px-8">
        <StartingPoints omit={["/plan"]} heading="Or start somewhere else" />
      </section>

      {!itineraries && (
        <section className="border-t border-[var(--gold-light)] bg-[var(--cream-deep)] px-5 py-12 sm:px-8 sm:py-14">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-5">
            <div className="flex flex-wrap gap-3">
              <Link
                href="/destinations"
                className={`inline-flex min-h-11 items-center ${ACTION_BUTTON_CLASS.primary}`}
              >
                Browse vacation ideas
              </Link>
              <Link
                href="/heritage"
                className={`inline-flex min-h-11 items-center ${ACTION_BUTTON_CLASS.secondary}`}
              >
                Planning a heritage journey
              </Link>
            </div>
          </div>
        </section>
      )}

      <Footer />
    </main>
  );
}
