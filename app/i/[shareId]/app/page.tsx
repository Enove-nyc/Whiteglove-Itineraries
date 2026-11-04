import { redirect } from "next/navigation";
import CompanionApp from "@/components/companion/CompanionApp";
import ClientCodeMemory from "@/components/companion/ClientCodeMemory";
import { getSharedItineraryByShareId, getTripAlerts } from "@/lib/account-store";
import { emptyItinerary } from "@/data/itinerary";
import { SAMPLE_ITINERARY, SAMPLE_TRIP_CODE } from "@/data/sample-itinerary";
import { buildCompanionFromItinerary } from "@/lib/companion-build";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";

export const metadata = pageMetadata({ title: "Your trip", description: "Your itinerary, personal wallet and trip group chat.", path: "/i", noIndex: true });
export const dynamic = "force-dynamic";

// A code is already a read credential for this exact shared itinerary.
// Viewing that itinerary in its companion needs no advisor or subscription.
export default async function SharedAppPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  if (shareId === SAMPLE_TRIP_CODE) return sampleApp();
  const shared = await getSharedItineraryByShareId(shareId);
  if (!shared) redirect(`/i/${encodeURIComponent(shareId)}`);
  const trip = await buildCompanionFromItinerary({ ...emptyItinerary(), ...shared.itinerary }, {
    today: new Date().toISOString().slice(0, 10),
    kosher: (await currentBrand()) === "kosher",
  });
  if (!trip) redirect(`/i/${encodeURIComponent(shareId)}`);
  if (shared.tripId) trip.liveAlerts = await getTripAlerts(shared.ownerEmail, shared.tripId).catch(() => []);
  return <main>
    <ClientCodeMemory path={`/i/${shareId}/app`} />
    <CompanionApp trip={trip} travelerGroupCode={shareId} personalWalletKey={`trip:${shareId}`} />
  </main>;
}

async function sampleApp() {
  const brand = await currentBrand();
  const trip = await buildCompanionFromItinerary(SAMPLE_ITINERARY, {
    today: SAMPLE_ITINERARY.startDate,
    tripName: SAMPLE_ITINERARY.title,
    kosher: brand !== "itineraries",
  }).catch(() => null);
  if (!trip) redirect("/sample-itinerary");

  return (
    <main>
      {/* Above the app rather than over it: the app below owns every pixel of
          the screen, so a floating notice would sit on a control. Every one of
          these screens is a picture of somebody's private trip, and a sample
          that does not say so invites exactly the wrong reading. */}
      <div className="border-b border-[var(--gold)]/30 bg-[var(--cream)] px-5 py-2.5 sm:px-8">
        <p className="mx-auto max-w-5xl text-xs leading-5 text-stone-700">
          <span className="font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">Sample</span> — a made-up
          trip, for seeing how the app works. Nothing here is booked.
        </p>
      </div>
      <CompanionApp trip={trip} />
    </main>
  );
}

