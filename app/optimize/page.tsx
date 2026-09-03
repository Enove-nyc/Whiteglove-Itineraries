import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import ItineraryOptimizationPanel from "@/components/ItineraryOptimizationPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireSignedIn } from "@/lib/require-signed-in";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";

// Brand-aware, signed-in only: /optimize is one of the itineraries domain's
// own pages, the same as /packing — a personal-travel tool, no plan gate.
export async function generateMetadata() {
  const itineraries = (await currentBrand()) === "itineraries";
  return pageMetadata({
    title: itineraries ? "Review your itinerary — White Glove Itineraries" : "Review your itinerary — White Glove Kosher Travel",
    description: "AI suggestions on the pacing and flow of the trip in your planner right now.",
    path: "/optimize",
    noIndex: true,
  });
}

export const dynamic = "force-dynamic";

export default async function OptimizePage() {
  await requireSignedIn("/optimize");

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <Navbar />
      <section className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <PageHeader
          eyebrow="Review"
          title="Review your itinerary"
          description="AI suggestions on this trip's pacing and flow — an overloaded day, a long empty stretch, nearby stops split across separate days. Nothing here changes the itinerary itself; it's suggestions to act on in the planner."
        />
        <div className="mt-8">
          <ItineraryOptimizationPanel />
        </div>
      </section>
      <Footer />
    </main>
  );
}
