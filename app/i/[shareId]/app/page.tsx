import { redirect } from "next/navigation";
import CompanionApp from "@/components/companion/CompanionApp";
import { getPlan } from "@/lib/account-plan-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { checkTripFlightStatus, getSharedItineraryByShareId, getTripAlerts } from "@/lib/account-store";
import { noteShareOpened } from "@/lib/share-open-recorder";
import { emptyItinerary, unitsOf } from "@/data/itinerary";
import { buildCompanionFromItinerary } from "@/lib/companion-build";
import { readBrand } from "@/lib/business-brand-store";
import { getAppPrefs } from "@/lib/app-prefs-store";
import { paymentForUnit } from "@/lib/companion-payment";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";

// A link given to a client, not found. It carries somebody's dates and stops;
// it does not belong in a search result.
/**
 * The site's own brand in the tab, chosen from the host.
 *
 * A static title naming neither brand fell back to Kosher Travel, and this is
 * the page a client opens from the link their adviser sent — the tab, the
 * bookmark and the preview card all said the wrong product. Not the adviser's
 * own brand even when they have one: the trip behind this link is not open to
 * whoever is looking at the tab.
 */
export async function generateMetadata() {
  const brand = await currentBrand();
  return pageMetadata({
    title: brand === "itineraries" ? "Your trip — White Glove Itineraries" : "Your trip",
    description: "The trip in your pocket — a day at a time, with a travel wallet kept for when there is no signal.",
    path: "/i",
    noIndex: true,
  });
}

export const dynamic = "force-dynamic";

/**
 * A shared trip, opened as the White Glove app.
 *
 * This is how a Business account hands a client their trip on a phone: the
 * per-trip share token (lib/account-store.ts), rendered as the app rather than
 * the document. The client needs no account and no plan — they were given the
 * link, and it opens THIS trip and no other of the agency's.
 *
 * HANDING THE APP TO A CLIENT IS BUSINESS-ONLY. Gold has the app for its own
 * trips, but only a trip whose OWNER is on Business opens this way for a client;
 * anyone else's share link falls back to the ordinary read-only itinerary at
 * /i/[shareId]. The gate is mayServeCompanionClients, the client-facing half.
 */
export default async function SharedAppPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const shared = await getSharedItineraryByShareId(shareId);
  if (!shared) redirect(`/i/${shareId}`); // the shared view shows the "not available" notice

  // Somebody has opened the link. Recorded only when it is NOT the advisor
  // (or their colleague) checking their own work — see noteShareOpened.
  await noteShareOpened(shareId, shared.ownerEmail);


  // Handing the app to a client is Business-only; a non-Business owner's link
  // is still a real shared trip, just as the document rather than the app.
  const plan = await getPlan(shared.ownerEmail);
  if (!mayServeCompanionClients(plan)) redirect(`/i/${shareId}`);

  // A whole-trip link only ever shows Payments when the trip has exactly one
  // family/traveler on it — a link not scoped to one unit has no way to know
  // whose balance to show, the same rule app/api/pay/[shareId]/route.ts
  // applies before it lets a whole-trip link pay anything.
  const units = unitsOf({ ...emptyItinerary(), ...shared.itinerary });
  const [brand, prefs, payment] = await Promise.all([
    readBrand(shared.ownerEmail).catch(() => null),
    getAppPrefs(shared.ownerEmail).catch(() => ({ kosherFeatures: false })),
    units.length === 1 && shared.tripId
      ? paymentForUnit(shared.ownerEmail, shared.tripId, units[0].unitKey, units[0].label, shareId).catch(() => undefined)
      : Promise.resolve(undefined),
  ]);
  const trip = await buildCompanionFromItinerary(
    { ...emptyItinerary(), ...shared.itinerary },
    {
      today: new Date().toISOString().slice(0, 10),
      advisorName: shared.advisor || (brand?.enabled ? brand.name : undefined) || shared.ownerName,
      client: shared.client,
      kosher: prefs.kosherFeatures,
    },
  );
  if (!trip) redirect(`/i/${shareId}`); // no dates / no days — the document still reads
  if (payment) trip.payment = payment;
  if (shared.tripId) {
    await checkTripFlightStatus(shared.ownerEmail, shared.tripId).catch(() => []);
    trip.liveAlerts = await getTripAlerts(shared.ownerEmail, shared.tripId).catch(() => []);
  }

  // The client's side of the thread: this link IS the channel to their advisor.
  const chat = {
    shareId,
    side: "client" as const,
    advisorName: trip.contactName ?? "your advisor",
  };

  return (
    <main>
      <CompanionApp trip={trip} chat={chat} />
    </main>
  );
}
