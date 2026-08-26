import Footer from "@/components/Footer";
import MyRouteDashboard from "@/components/MyRouteDashboard";
import Navbar from "@/components/Navbar";
import { allCrossings } from "@/lib/border-store";
import { requireSignedIn } from "@/lib/require-signed-in";

import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";

// Private to one person. Nothing here belongs in a search result. Brand-aware:
// /my-route is one of the itineraries domain's own pages too.
export async function generateMetadata() {
  const itineraries = (await currentBrand()) === "itineraries";
  return pageMetadata({
    title: itineraries ? "My Route | White Glove Itineraries" : "My Route | White Glove Kosher Travel",
    description: "The stops you have saved, in order, with driving times and directions.",
    path: "/my-route",
    noIndex: true,
  });
}

// The route itself lives in the browser, but which crossings exist and what
// was found at them does not — so it is read here and handed down. Today's
// date comes from here too, because nothing should ask what day it is while
// React is rendering.
export const dynamic = "force-dynamic";

export default async function MyRoutePage() {
  // Somebody's own saved route — signed-in only, at the owner's word.
  await requireSignedIn("/my-route");
  const itineraries = (await currentBrand()) === "itineraries";
  const crossings = await allCrossings();
  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <Navbar minimal={itineraries} />
      <MyRouteDashboard crossings={crossings} today={new Date().toISOString().slice(0, 10)} />
      <Footer minimal={itineraries} />
    </main>
  );
}
