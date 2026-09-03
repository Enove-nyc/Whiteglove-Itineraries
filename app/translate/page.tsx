import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import ItineraryTranslationPanel from "@/components/ItineraryTranslationPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireSignedIn } from "@/lib/require-signed-in";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";

// Brand-aware, signed-in only: /translate is one of the itineraries
// domain's own pages, the same as /packing and /optimize — a personal-
// travel tool, no plan gate.
export async function generateMetadata() {
  const itineraries = (await currentBrand()) === "itineraries";
  return pageMetadata({
    title: itineraries ? "Translate your itinerary — White Glove Itineraries" : "Translate your itinerary — White Glove Kosher Travel",
    description: "Read the trip in your planner right now in another language.",
    path: "/translate",
    noIndex: true,
  });
}

export const dynamic = "force-dynamic";

export default async function TranslatePage() {
  await requireSignedIn("/translate");

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <Navbar />
      <section className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <PageHeader
          eyebrow="Translate"
          title="Read it in another language"
          description="Stops, where you sleep and flight notes, translated — dates, times, addresses and phone numbers always stay exactly as given."
        />
        <div className="mt-8">
          <ItineraryTranslationPanel />
        </div>
      </section>
      <Footer />
    </main>
  );
}
