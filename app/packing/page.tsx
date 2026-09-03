import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import PackingListPanel from "@/components/PackingListPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { isSignedIn } from "@/lib/require-signed-in";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";

// Brand-aware and OPEN. This used to be signed-in only, and a visitor who
// wanted to know what to pack met the login door instead of an answer. It now
// opens with the starter list (data/packing-basics.ts) for everybody, and a
// signed-in visitor with a trip in the planner gets the list generated from
// that trip in its place. No plan gate either: a personal-travel tool, the
// same as /itinerary and /my-route.
export async function generateMetadata() {
  const itineraries = (await currentBrand()) === "itineraries";
  return pageMetadata({
    title: itineraries ? "Packing list — White Glove Itineraries" : "Packing list — White Glove Kosher Travel",
    description: "What to pack for your trip — documents, clothing, electronics and the rest. Build a trip and the list is made for it.",
    path: "/packing",
  });
}

export const dynamic = "force-dynamic";

export default async function PackingPage() {
  // Whether to ask the account for a trip at all. A signed-out visitor gets
  // the starter list without a round trip that could only return a 401.
  const signedIn = await isSignedIn();
  // NO GEAR SHELF HERE. The kosher copy reads its travel-gear shelf and hands
  // it down so a packing line naming a product can link to one. That shelf is
  // a settled decision of that product and does not exist on this one — see
  // components/PackingListPanel.tsx. Nothing to read, and no affiliate
  // disclosure to print, because there are no affiliate links on this page.

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <Navbar />
      <section className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <PageHeader
          eyebrow="Packing list"
          title="What to pack"
          description="A starting list to check off as you pack. With a trip in the planner it is built from where you are going, when, and what you have planned."
        />
        <div className="mt-8">
          <PackingListPanel signedIn={signedIn} />
        </div>
      </section>
      <Footer />
    </main>
  );
}
