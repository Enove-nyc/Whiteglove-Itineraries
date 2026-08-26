import Link from "next/link";
import { cookies } from "next/headers";
import AppCodeEntry from "@/components/companion/AppCodeEntry";
import CompanionApp from "@/components/companion/CompanionApp";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import {
  accountCookieName,
  checkTripFlightStatus,
  getCurrentAccountSummary,
  getTripAlerts,
  getTripItinerary,
  getTrips,
  readSessionEmail,
} from "@/lib/account-store";
import { getPlan } from "@/lib/account-plan-store";
import { mayServeCompanionClients, mayUseCompanionApp } from "@/lib/account-limits";
import { PLAN_LABELS } from "@/lib/account-plans";
import { emptyItinerary } from "@/data/itinerary";
import { buildCompanionFromItinerary } from "@/lib/companion-build";
import { readBrand } from "@/lib/business-brand-store";
import { getAppPrefs } from "@/lib/app-prefs-store";
import { pageMetadata } from "@/lib/seo";

// One person's trip, on one person's phone. Nothing here belongs in a search
// result, and the gate below means most visitors never see it at all.
export const metadata = pageMetadata({
  title: "The White Glove app",
  description: "The trip in your pocket — a day at a time, with a travel wallet kept for when there is no signal.",
  path: "/app",
  noIndex: true,
});

// The plan and the trip are read fresh each time.
export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/**
 * The White Glove app — a trip in your pocket.
 *
 * EVERY PAID PLAN, in one place. The gate is mayUseCompanionApp in
 * lib/account-limits.ts, and this page is the only door that reads it. Handing a
 * trip to a client stays Advisor Starter and up, behind a separate gate
 * (mayServeCompanionClients) — the Messages inbox below, and the client links,
 * chat and report routes elsewhere.
 *
 * IT SHOWS THE OWNER'S OWN TRIP, never a sample. `?trip=<id>` opens a specific
 * one (that is what the "Open the app" links carry); otherwise it opens the
 * trip that is open in the planner. A trip with no dates yet is not padded with
 * a demo — the page says, plainly, that its dates need setting in the planner,
 * and lists the account's other trips to switch to.
 */
export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{ trip?: string | string[]; share_title?: string | string[]; share_text?: string | string[]; share_url?: string | string[] }>;
}) {
  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountSummary(cookie);
  const sessionEmail = readSessionEmail(cookie);
  const who = account?.email || sessionEmail || "";
  // Not signed in: the two doors. A client enters the code their advisor sent
  // and opens their one trip with no account; an advisor or a Gold member logs
  // in to their own trips. This replaced a straight redirect to /login, which
  // left a client with a code nowhere to put it.
  if (!who) {
    return (
      <main className="min-h-screen bg-[var(--cream)]">
        <Navbar minimal homeHref="/app" />
        <section className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-16 sm:px-8 sm:py-24">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold-ink)]">The White Glove app</p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--navy)] sm:text-5xl">
            The trip in your pocket.
          </h1>
          <p className="text-base leading-7 text-stone-600">
            A day at a time, with a travel wallet kept on the phone for when there is no signal.
          </p>

          <div className="rounded-2xl border border-[var(--gold)]/30 bg-white p-6">
            <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
              Have a code from your travel advisor?
            </h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              Enter it to open your trip. You do not need an account.
            </p>
            <div className="mt-4">
              <AppCodeEntry />
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--gold-light)] bg-white p-6">
            <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
              Travel advisor or member?
            </h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              Log in to open your own trips in the app.
            </p>
            <div className="mt-4">
              <Link
                href="/login?next=%2Fapp"
                className="inline-flex min-h-11 items-center rounded-full bg-[var(--navy)] px-6 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Log in
              </Link>
            </div>
          </div>
        </section>
        <Footer />
      </main>
    );
  }

  const plan = await getPlan(who);
  if (mayUseCompanionApp(plan)) {
    // Gold has the app for its own trips; only Business hands it to a client.
    // The copy below turns on this, so a Gold member is never offered a client
    // feature they do not have.
    const servesClients = mayServeCompanionClients(plan);
    const params = await searchParams;
    const wantedId = firstParam(params.trip);
    // A place shared in from outside — Google Maps' own share sheet, say —
    // arrives here as the OS's Web Share Target params (app/manifest.ts).
    // Held as a plain line of text; the advisor picks which client's thread
    // it goes into, the same way any other message does.
    const sharedDraft = [firstParam(params.share_title), firstParam(params.share_text), firstParam(params.share_url)]
      .filter(Boolean)
      .join("\n")
      .trim();
    const trips = await getTrips(who).catch(() => []);
    const selected =
      trips.find((t) => t.id === wantedId) ?? trips.find((t) => t.active) ?? trips[0] ?? null;

    let companionTrip = null;
    if (selected) {
      const chosen = await getTripItinerary(who, selected.id).catch(() => null);
      if (chosen) {
        const [brand, prefs] = await Promise.all([
          readBrand(who).catch(() => null),
          getAppPrefs(who).catch(() => ({ kosherFeatures: false })),
        ]);
        const advisorName = chosen.advisor || (brand?.enabled ? brand.name : undefined);
        companionTrip = await buildCompanionFromItinerary(
          { ...emptyItinerary(), ...chosen.itinerary },
          {
            today: new Date().toISOString().slice(0, 10),
            advisorName,
            tripName: chosen.tripName,
            client: chosen.client,
            tripId: selected.id,
            kosher: prefs.kosherFeatures,
          },
        );
        // Best-effort, and throttled server-side — see checkTripFlightStatus.
        // A failure here should never keep the app from opening.
        await checkTripFlightStatus(who, selected.id).catch(() => []);
        if (companionTrip) companionTrip.liveAlerts = await getTripAlerts(who, selected.id).catch(() => []);
      }
    }

    if (companionTrip) {
      // The app fills the screen — its own header, tabs and chrome, no site
      // furniture around it. On a phone it is the whole window; installed to the
      // home screen it is the whole app.
      //
      // Business hands the app to clients, so it gets the Messages inbox — every
      // client they have shared a trip with. Gold has the app for its own trips
      // and no inbox; the tab simply is not there.
      return (
        <main>
          <CompanionApp trip={companionTrip} advisorInbox={servesClients} sharedDraft={sharedDraft || undefined} />
        </main>
      );
    }

    // A Gold or Business account with no trip to show yet — say so plainly, and
    // offer the way to fix it, rather than pretending with a sample.
    const dated = trips.filter((t) => t.startDate && t.endDate);
    return (
      <main className="min-h-screen bg-[var(--cream)]">
        <Navbar minimal homeHref="/app" />
        <section className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-16 sm:px-8 sm:py-24">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold-ink)]">The White Glove app</p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--navy)] sm:text-5xl">
            {selected ? `${selected.name} needs its dates.` : "You don't have a trip yet."}
          </h1>
          <p className="text-base leading-7 text-stone-600">
            {selected
              ? "The app shows a trip a day at a time, so it needs the trip's start and end dates. Open it in the planner, set the dates, and it fills in here, ready for the phone."
              : servesClients
                ? "Build a trip in the planner — its dates, where you are staying, and the stops — and it appears here as the app you can hand your client."
                : "Build a trip in the planner — its dates, where you are staying, and the stops — and it appears here as the app in your pocket."}
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link href="/itinerary" className="rounded-full bg-[var(--navy)] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90">
              Open the planner
            </Link>
          </div>
          {dated.length > 0 && (
            <div className="mt-2 border-t border-[var(--gold-light)] pt-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Trips ready to open</p>
              <ul className="mt-3 flex flex-col gap-2">
                {dated.map((t) => (
                  <li key={t.id}>
                    <Link href={`/app?trip=${t.id}`} className="text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">
                      {t.name}
                      {t.client ? ` — for ${t.client}` : ""}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
        <Footer />
      </main>
    );
  }

  // Signed in with no plan yet — the only state the app is not part of (every
  // paid plan cleared the gate above). Say what it is, and point at One Trip,
  // the first and cheapest plan that includes it. It still takes a client's
  // code, since a client may have their own account and a code from their
  // advisor at once. The itineraries "See the app" link can land here, so this
  // is where that promise has to be true.
  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <Navbar minimal homeHref="/app" />
      <section className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-16 sm:px-8 sm:py-24">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold-ink)]">The White Glove app</p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--navy)] sm:text-5xl">
          The trip in your pocket.
        </h1>
        <p className="text-base leading-7 text-stone-600">
          Your itinerary a day at a time, with a travel wallet kept on the phone for when there is
          no signal. It is the trip you build in here, carried on your phone rather than on paper.
        </p>

        <div className="rounded-2xl border border-[var(--gold)]/30 bg-white p-6">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
            Have a code from your travel advisor?
          </h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Enter it to open your trip — you do not need the app on your own account for that.
          </p>
          <div className="mt-4">
            <AppCodeEntry />
          </div>
        </div>

        <p className="text-base leading-7 text-stone-600">
          The app comes with every plan. You are on {PLAN_LABELS[plan]}. Choose a plan from your account, and it
          opens.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href="/account"
            className="rounded-full bg-[var(--navy)] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Choose a plan
          </Link>
          <Link
            href="/itinerary"
            className="rounded-full border border-stone-300 px-6 py-3 text-sm font-semibold text-[var(--navy)] transition hover:bg-white"
          >
            Build a trip yourself
          </Link>
        </div>
      </section>
      <Footer />
    </main>
  );
}
