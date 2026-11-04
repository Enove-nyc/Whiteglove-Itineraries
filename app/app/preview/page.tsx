import Link from "next/link";
import { COMPANION_DEMO_TRIP } from "@/data/companion-demo";
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
  return <main><div className="border-b border-stone-200 bg-[#FAF8F3] px-5 py-4 text-[#102F35]"><div className="mx-auto max-w-5xl"><h1 className="text-xl font-semibold">A sample trip</h1><p className="mt-2 text-sm leading-6"><span className="font-bold uppercase tracking-widest">Sample</span> — an illustrative trip for a fictional family in Rome. Explore the itinerary, personal travel wallet and sample group conversation. Nothing here is booked.</p><ul className="my-3 grid gap-2 text-sm leading-6 sm:grid-cols-2">{["Today's schedule, a day at a time", "The map and directions to each stop", "Personal documents in a travel wallet", "Messages with your travel group", "Flight times from your itinerary", "Saved documents for when there is no signal"].map((line) => <li key={line}>{line}</li>)}</ul><Link href="/app?enter=1" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">Open your own trip</Link></div></div>{trip ? <CompanionApp trip={{ ...trip, walletGroups: COMPANION_DEMO_TRIP.walletGroups, previewAsClient: true }} travelerPreview personalWalletKey="sample:rome" /> : <p className="p-5">The sample trip is temporarily unavailable.</p>}</main>;
}
