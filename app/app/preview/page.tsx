import Link from "next/link";
import CompanionApp from "@/components/companion/CompanionApp";
import { SAMPLE_ITINERARY } from "@/data/sample-itinerary";
import { buildCompanionFromItinerary } from "@/lib/companion-build";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const brand = await currentBrand();
  return pageMetadata({ title: brand === "itineraries" ? "A sample trip — White Glove Itineraries" : "A sample trip — White Glove Kosher Travel", description: "Explore a sample itinerary, personal travel wallet and trip group chat.", path: "/app/preview", noIndex: true });
}
export default async function AppPreviewPage() {
  const trip = await buildCompanionFromItinerary(SAMPLE_ITINERARY, { today: SAMPLE_ITINERARY.startDate, kosher: (await currentBrand()) === "kosher" });
  return <main><div className="border-b border-stone-200 bg-[#FAF8F3] px-5 py-4 text-[#102F35]"><div className="mx-auto max-w-5xl"><h1 className="text-xl font-semibold">A sample trip</h1><p className="mt-2 text-sm leading-6">An illustrative family trip in Rome. Explore the itinerary, personal wallet and sample group conversation. Nothing here is booked.</p><Link href="/app?enter=1" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">Open your own trip</Link></div></div>{trip ? <CompanionApp trip={trip} travelerPreview personalWalletKey="sample:rome" /> : <p className="p-5">The sample trip is temporarily unavailable.</p>}</main>;
}
