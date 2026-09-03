import { redirect } from "next/navigation";
import CompanionApp from "@/components/companion/CompanionApp";
import ClientCodeMemory from "@/components/companion/ClientCodeMemory";
import { getPlan } from "@/lib/account-plan-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { checkTripFlightStatus, getSharedTraveler, getTripAlerts } from "@/lib/account-store";
import { noteShareOpened } from "@/lib/share-open-recorder";
import { emptyItinerary, redactForTraveler, travelerUnitKey } from "@/data/itinerary";
import { buildCompanionFromItinerary } from "@/lib/companion-build";
import { readBrand } from "@/lib/business-brand-store";
import { getAppPrefs } from "@/lib/app-prefs-store";
import { paymentForUnit } from "@/lib/companion-payment";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";

// One traveler's own link, not found. It carries their family's dates and
// stops; it does not belong in a search result.
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
    path: "/t",
    noIndex: true,
  });
}

export const dynamic = "force-dynamic";

/**
 * A trip, opened through ONE TRAVELER'S OWN LINK rather than the one
 * trip-wide link — for a family or group trip where each person (or each
 * family, sharing a `family` label) is handed their own door in. Mirrors
 * app/i/[shareId]/app/page.tsx exactly, with one difference: the itinerary is
 * passed through redactForTraveler (data/itinerary.ts) first, so this
 * traveler's own unit's notes stay, and every other traveler's notes,
 * email and phone are stripped before the trip is even built. Attachments
 * are already stripped for every client link, traveler-scoped or not — see
 * getSharedTraveler in lib/account-store.ts.
 *
 * The chat thread is the trip's own — shared with every traveler on it and
 * the advisor, the same one link opens — a traveler-scoped link changes what
 * is SEEN, not who the conversation is with.
 */
export default async function TravelerAppPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  // A dead or downgraded traveller link (revoked, dates removed, advisor plan
  // lapsed, or the trip lost its days) must not dump the family on the
  // marketing homepage with no way back in. Send them to /app, which shows a
  // "have a code?" field they can retry from — the same recovery /i uses.
  const shared = await getSharedTraveler(shareId);
  if (!shared) redirect("/app");

  // A traveller's own door is its own link with its own status, so it is this
  // token that is recorded, not the trip-wide one.
  await noteShareOpened(shareId, shared.ownerEmail);

  const plan = await getPlan(shared.ownerEmail);
  if (!mayServeCompanionClients(plan)) redirect("/app");

  const label = shared.traveler.family?.trim() || shared.traveler.name;
  const [brand, prefs, payment] = await Promise.all([
    readBrand(shared.ownerEmail).catch(() => null),
    getAppPrefs(shared.ownerEmail).catch(() => ({ kosherFeatures: false })),
    paymentForUnit(shared.ownerEmail, shared.tripId, travelerUnitKey(shared.traveler), label, shareId).catch(() => undefined),
  ]);
  const redacted = redactForTraveler({ ...emptyItinerary(), ...shared.itinerary }, shared.traveler.id);
  const trip = await buildCompanionFromItinerary(redacted, {
    today: new Date().toISOString().slice(0, 10),
    advisorName: shared.advisor || (brand?.enabled ? brand.name : undefined) || shared.ownerName,
    client: label,
    kosher: prefs.kosherFeatures,
  });
  if (!trip) redirect("/app");
  if (payment) trip.payment = payment;
  await checkTripFlightStatus(shared.ownerEmail, shared.tripId).catch(() => []);
  trip.liveAlerts = await getTripAlerts(shared.ownerEmail, shared.tripId).catch(() => []);

  // THIS traveler's own token, never shared.internalChatKey — that field is
  // the trip's whole, unredacted share token and must never reach a browser.
  // The chat route resolves this token to the same shared thread server-side
  // (resolveCompanionShare in lib/account-store.ts).
  const chat = {
    shareId,
    side: "client" as const,
    advisorName: trip.contactName ?? "your advisor",
  };

  return (
    <main>
      <ClientCodeMemory path={`/t/${shareId}/app`} />
      <CompanionApp trip={trip} chat={chat} />
    </main>
  );
}
