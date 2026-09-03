import { redirect } from "next/navigation";
import CompanionApp from "@/components/companion/CompanionApp";
import ClientCodeMemory from "@/components/companion/ClientCodeMemory";
import { getPlan } from "@/lib/account-plan-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { mayOpenTripInApp } from "@/lib/companion-access";
import { checkTripFlightStatus, getShareKind, getSharedItineraryByShareId, getTripAlerts } from "@/lib/account-store";
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
 * TWO KINDS OF CODE COME THROUGH HERE, and the difference is who is on the
 * other end of it — see ShareKind in lib/account-store.ts.
 *
 * A CLIENT CODE is an adviser handing a trip to the person taking it. Two
 * people, so the app carries the conversation with the adviser. Making one is
 * Advisor Starter and up (mayServeCompanionClients); anyone else's share link
 * falls back to the ordinary read-only itinerary at /i/[shareId].
 *
 * A SELF CODE is somebody carrying their OWN trip on their own phone — the
 * thing a Trip Pass buys. It opens the identical app, on the strength of a
 * pass spent on that trip (mayOpenTripInApp), and it is handed NO chat: there
 * is nobody on the other end to message, so the Messages tab is not rendered
 * at all. The routes behind it are closed too — resolveCompanionShare refuses
 * a self code outright.
 */
export default async function SharedAppPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const shared = await getSharedItineraryByShareId(shareId);
  if (!shared) redirect(`/i/${shareId}`); // the shared view shows the "not available" notice

  // Somebody has opened the link. Recorded only when it is NOT the advisor
  // (or their colleague) checking their own work — see noteShareOpened.
  await noteShareOpened(shareId, shared.ownerEmail);


  // TWO KINDS OF CODE COME THROUGH HERE — see ShareKind in lib/account-store.ts.
  const plan = await getPlan(shared.ownerEmail);
  const kind = (await getShareKind(shareId)) ?? "client";
  if (kind === "self") {
    // The owner's own phone — the thing a Trip Pass buys. The gate is the
    // trip's, not the plan's: a pass spent on THIS trip, or an advisor plan
    // that covers every trip. Without one it is still a real shared trip, just
    // as the document.
    if (!shared.tripId || !(await mayOpenTripInApp(shared.ownerEmail, plan, shared.tripId))) redirect(`/i/${shareId}`);
  } else if (!mayServeCompanionClients(plan)) {
    // Handing the app to a CLIENT is Advisor Starter and up; a link from
    // anyone else is still a real shared trip, just as the document.
    redirect(`/i/${shareId}`);
  }

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
  //
  // A SELF CODE GETS NONE OF THIS, and that is the whole block. CompanionApp
  // draws its Messages tab, its unread badge, its polling and the message card
  // on the home screen from this one prop; passing nothing removes all of them
  // together. There is no tab to hide and no empty thread to open, because on
  // a trip somebody planned for themselves the only person to write to is the
  // person reading.
  const chat =
    kind === "self"
      ? undefined
      : {
          shareId,
          side: "client" as const,
          advisorName: trip.contactName ?? "your advisor",
        };

  return (
    <main>
      <ClientCodeMemory path={`/i/${shareId}/app`} />
      <CompanionApp trip={trip} chat={chat} />
    </main>
  );
}
