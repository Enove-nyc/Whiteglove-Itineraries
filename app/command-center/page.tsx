import Link from "next/link";
import { cookies } from "next/headers";
import Footer from "@/components/Footer";
import TripAdvisories from "@/components/TripAdvisories";
import { BeforeYouGo } from "@/components/BeforeYouGo";
import Navbar from "@/components/Navbar";
import MixedText from "@/components/MixedText";
import TripDocuments from "@/components/TripDocuments";
import { accountCookieName, getCurrentAccountData, getTripItinerary } from "@/lib/account-store";
import { daysUntil, tripReadiness, type StopReadiness } from "@/lib/command-center";
import { stopsForTrip } from "@/lib/command-center-data";
import { fetchAdvisories } from "@/lib/travel-advisories";
import { tripAdvisories } from "@/lib/trip-advisories";
import { tripAlerts } from "@/lib/trip-alerts";
import { tripDocuments } from "@/lib/trip-documents";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";
import { BRAND_NAME } from "@/lib/site-brand-core";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const name = BRAND_NAME[await currentBrand()];
  return pageMetadata({
    title: `Your trip | ${name}`,
    description: "Everything still to sort before you travel, stop by stop.",
    path: "/command-center",
    noIndex: true,
  });
}

/**
 * One page for the week before somebody travels.
 *
 * The site could always answer "what do we know about Lizhensk". It could not
 * answer the question a person actually has: I have five stops — which of them
 * am I going to turn up at and find a locked gate?
 *
 * That is only answerable across a whole trip, which is why it needed a page
 * of its own rather than another panel on the itinerary. The itinerary is for
 * building the trip. This is for the last week before it, and it is arranged
 * as what to DO: numbers to phone, then the stops that need something, then
 * the ones that are fine.
 */
export default async function CommandCenterPage() {
  const cookieStore = await cookies();
  const account = await getCurrentAccountData(cookieStore.get(accountCookieName())?.value);

  if (!account) {
    return (
      <Shell>
        <p className="text-lg leading-8 text-stone-600">
          Sign in and this becomes your trip — every stop, what is still missing on each, and the numbers to call
          before you leave.
        </p>
        <Link href="/login" className="mt-7 inline-block bg-[var(--navy)] px-6 py-3 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--gold)]">
          Sign in
        </Link>
      </Shell>
    );
  }

  const trip = await getTripItinerary(account.email);
  const stops = trip ? await stopsForTrip(trip.itinerary) : [];
  const readiness = tripReadiness(stops);
  // WHERE THIS TRIP GOES, and what the governments there currently say.
  // The advisory feed and the roll-up have both existed for months and were
  // wired to nothing here — and StopFacts.country was never populated, so even
  // once wired they would have seen a trip with no countries in it. Both are
  // fixed together, because either alone shows an empty card.
  const feed = await fetchAdvisories();
  const advisories = tripAdvisories(stops, feed.available ? feed.advisories : []);
  // Read once, here, rather than while the page renders.
  const today = new Date().toISOString().slice(0, 10);
  const leaving = daysUntil(trip?.itinerary.startDate, today);

  // The clock time each stop was planned for, which is what decides whether a
  // Friday afternoon runs past candle-lighting.
  const timesById = Object.fromEntries((trip?.itinerary.activities ?? []).map((a) => [a.id, a.startTime]));
  // Read here, from the owner's own trip. Nothing is fetched — these are the
  // references the itinerary already holds, and each one opens only for the
  // account that uploaded it.
  const documents = tripDocuments(trip?.itinerary);
  const alerts = tripAlerts({
    stops,
    readiness,
    startDate: trip?.itinerary.startDate,
    today,
    timesById,
  });

  if (!stops.length) {
    return (
      <Shell name={trip?.tripName}>
        <p className="text-lg leading-8 text-stone-600">
          Nothing on this trip yet. Add the kevarim and the towns you are going to, and this page will tell you
          what is still missing on each of them.
        </p>
        <Link href="/itinerary" className="mt-7 inline-block bg-[var(--navy)] px-6 py-3 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--gold)]">
          Plan the trip
        </Link>
      </Shell>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <Navbar />

      <section className="wg-page-hero border-b border-[var(--gold-light)] px-5 py-14 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-[var(--gold-ink)]">Your trip</p>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-[clamp(2.5rem,7vw,4rem)] leading-tight text-[var(--navy)]">
            {trip?.tripName || trip?.itinerary.title || "Before you go"}
          </h1>
          <p className="mt-5 text-lg leading-8 text-stone-600">
            {stops.length} {stops.length === 1 ? "stop" : "stops"}
            {leaving ? `, leaving ${leaving}` : ""}.{" "}
            {readiness.needsAttention.length === 0
              ? "Nothing is missing — every stop has a way in and somewhere to navigate to."
              : `${readiness.needsAttention.length} ${readiness.needsAttention.length === 1 ? "needs" : "need"} something before you travel.`}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        {/* Above everything, because these are the ones that get worse the
            longer nobody notices — and Shabbos above those. */}
        {alerts.length > 0 && (
          <div className="mb-10 space-y-3">
            {alerts.map((alert, index) => (
              <div
                key={`${alert.kind}-${index}`}
                className={`border-l-4 p-5 ${
                  alert.urgency === 1
                    ? "border-red-600 bg-red-50"
                    : alert.urgency === 2
                      ? "border-amber-500 bg-amber-50"
                      : "border-[var(--gold)] bg-[#FAF8F3]"
                }`}
              >
                <p className={`font-[family-name:var(--font-display)] text-2xl leading-snug ${alert.urgency === 1 ? "text-red-900" : "text-[var(--navy)]"}`}>
                  {alert.headline}
                </p>
                {alert.detail && <p className="mt-1.5 text-sm leading-6 text-stone-700">{alert.detail}</p>}
              </div>
            ))}
          </div>
        )}

        {/* The phone calls, first, because that is the thing to actually do. */}
        {readiness.callAhead.length > 0 && (
          <div className="border border-[var(--gold)] bg-white p-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Call before you go</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">
              The numbers worth having in your phone
            </h2>
            <ul className="mt-5 divide-y divide-[var(--gold-light)]">
              {readiness.callAhead.map((contact, index) => (
                <li key={`${contact.stop}-${contact.phone}-${index}`} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
                  <span className="text-sm leading-6 text-stone-700">
                    <span className="font-semibold text-[var(--navy)]">{contact.stop}</span>
                    <span className="text-stone-500"> · {contact.label}</span>
                    {contact.note && <span className="block text-stone-500">{contact.note}</span>}
                  </span>
                  <a
                    href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`}
                    className="shrink-0 border border-[var(--gold)] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white"
                  >
                    {contact.phone}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Then the stops that need something. */}
        {readiness.needsAttention.length > 0 && (
          <div className="mt-10">
            <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Still to sort</h2>
            <div className="mt-5 space-y-4">
              {readiness.needsAttention.map((item) => <StopCard key={item.stop.id} item={item} today={today} />)}
            </div>
          </div>
        )}

        {/* And everything else, in the order they will reach it. */}
        <div className="mt-10">
          <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">
            {readiness.needsAttention.length > 0 ? "The rest of the trip" : "Every stop"}
          </h2>
          <div className="mt-5 space-y-4">
            {readiness.stops
              .filter((item) => !readiness.needsAttention.includes(item))
              .map((item) => <StopCard key={item.stop.id} item={item} today={today} />)}
          </div>
        </div>

        {/* The passes and tickets, read by the day they are needed rather than
            by which stop they were filed on. The planner's shape is right for
            building a trip; this one is right at half past five at the
            airport. */}
        <div className="mt-12 border-t border-[var(--gold-light)] pt-10">
          <TripAdvisories roll={advisories} unavailable={feed.available ? undefined : feed.reason} />
        </div>

        {/* The official pages for the countries on this trip. Renders nothing
            when the trip says nowhere it is going, or when the site holds no
            official page for where it goes — an empty card here would be worse
            than none, because a reader would take it for "nothing to check". */}
        <div className="mt-12">
          <BeforeYouGo countries={advisories.countries.map((c) => c.country)} fetchedAt={feed.available ? feed.fetchedAt : undefined} />
        </div>

        <div className="mt-12 border-t border-[var(--gold-light)] pt-10">
          <TripDocuments documents={documents} today={today} />
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/itinerary" className="border border-[var(--navy)] bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--gold)]">
            Change the trip
          </Link>
          <Link href="/account" className="border border-[var(--gold-light)] px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] text-[var(--navy)]">
            Your account
          </Link>
          <Link href="/rate" className="border border-[var(--gold-light)] px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] text-[var(--navy)]">
            Rate this trip
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  );
}

function StopCard({ item, today }: { item: StopReadiness; today: string }) {
  const { stop, concerns } = item;
  const when = daysUntil(stop.plannedDate, today);
  const worst = concerns[0]?.weight;

  return (
    <article className={`wg-card border bg-[#FAF8F3] p-5 sm:p-6 ${worst === 1 ? "border-amber-400" : "border-[var(--gold-light)]"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          {stop.yiddishName && (
            <h3 dir="rtl" lang="yi" className="font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--navy)]">
              <MixedText text={stop.yiddishName} lang="yi" />
            </h3>
          )}
          <p className={stop.yiddishName ? "mt-1 text-base text-stone-500" : "font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]"}>
            {stop.name}
          </p>
        </div>
        {when && <span className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">{when}</span>}
      </div>

      {stop.address && <p className="mt-3 text-sm leading-6 text-stone-600">{stop.address}</p>}

      {concerns.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {concerns.map((concern) => (
            <li key={concern.says} className="text-sm leading-6">
              <span className={concern.weight === 1 ? "font-semibold text-amber-800" : "font-semibold text-[var(--navy)]"}>
                {concern.says}
              </span>
              {concern.doThis && <span className="block text-stone-600">{concern.doThis}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm font-semibold text-emerald-800">
          ✓ Somewhere to navigate to, and somebody to call.
        </p>
      )}

      {stop.href && (
        <Link href={stop.href} className="mt-4 inline-block text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4">
          Open the page →
        </Link>
      )}
    </article>
  );
}

function Shell({ children, name }: { children: React.ReactNode; name?: string }) {
  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <Navbar />
      <section className="mx-auto max-w-3xl px-5 py-20 sm:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.26em] text-[var(--gold-ink)]">Your trip</p>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-[clamp(2.5rem,7vw,4rem)] leading-tight text-[var(--navy)]">
          {name || "Before you go"}
        </h1>
        <div className="mt-6">{children}</div>
      </section>
      <Footer />
    </main>
  );
}
