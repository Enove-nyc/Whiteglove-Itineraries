import Link from "next/link";
import { COMPANION_DEMO_TRIP } from "@/data/companion-demo";
import CompanionApp from "@/components/companion/CompanionApp";
import { LAKE_COMO_PREVIEW } from "@/data/lake-como-sample";
import { SAMPLE_ITINERARY } from "@/data/sample-itinerary";
import { buildCompanionFromItinerary } from "@/lib/companion-build";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const brand = await currentBrand();
  return pageMetadata({ title: brand === "itineraries" ? "Lake Como sample trip — White Glove Itineraries" : "A sample trip — White Glove Kosher Travel", description: "Explore a sample itinerary, personal travel wallet and trip group chat.", path: "/app/preview", noIndex: true });
}
export default async function AppPreviewPage() {
  const brand = await currentBrand();
  const sample = brand === "itineraries" ? LAKE_COMO_PREVIEW : SAMPLE_ITINERARY;
  const trip = await buildCompanionFromItinerary(sample, { today: sample.startDate, kosher: brand === "kosher" });
  return (
    <main>
      <div className="border-b border-stone-200 bg-[#FAF8F3] px-5 py-4 text-[#102F35]">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-xl font-semibold">{sample.title}</h1>
          <p className="mt-2 text-sm leading-6">A fictional trip to explore in the companion app. Browse the itinerary, map and travel wallet. The stops are real places and there are no bookings.</p>
          <div className="mt-2 flex flex-wrap gap-x-5">
            {brand === "itineraries" && <Link href="/itinerary?start=sample" className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">Copy this trip</Link>}
            <Link href="/app?enter=1" className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">Open your own trip</Link>
          </div>
        </div>
      </div>
      {trip ? <CompanionApp trip={{ ...trip, ...(brand === "kosher" ? { walletGroups: COMPANION_DEMO_TRIP.walletGroups } : {}), previewAsClient: true }} travelerPreview personalWalletKey={brand === "itineraries" ? "sample:lake-como" : "sample:rome"} /> : <p className="p-5">The sample trip is temporarily unavailable.</p>}
    </main>
  );
}
