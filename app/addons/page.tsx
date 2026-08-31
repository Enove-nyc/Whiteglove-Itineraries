import Footer from "@/components/Footer";
import LockedToolCard from "@/components/LockedToolCard";
import Navbar from "@/components/Navbar";
import AddonsEditor from "@/components/AddonsEditor";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireSignedIn } from "@/lib/require-signed-in";
import { accountCookieName, getCurrentAccountData, resolveBusinessOwner } from "@/lib/account-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { getPlan } from "@/lib/account-plan-store";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";
import TripContextBar from "@/components/TripContextBar";
import { cookies } from "next/headers";

// Brand-aware, signed-in only: /addons is one of the itineraries domain's
// own pages, the same as /proposal and /payments.
export async function generateMetadata() {
  const itineraries = (await currentBrand()) === "itineraries";
  return pageMetadata({
    title: itineraries ? "Trip add-ons — White Glove Itineraries" : "Trip add-ons — White Glove Kosher Travel",
    description: "Offer optional extras on the trip in your planner right now, and see what your client has accepted.",
    path: "/addons",
    noIndex: true,
  });
}

export const dynamic = "force-dynamic";

export default async function AddonsPage() {
  await requireSignedIn("/addons");
  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountData(cookie);
  // A staff login's plan gate is the business it's linked to, not its own.
  const plan = account ? await getPlan(await resolveBusinessOwner(account.email)) : "free";
  const allowed = mayServeCompanionClients(plan);

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <Navbar />
      {/* Which trip this is, and the trip's other screens. Renders nothing
          for a plan that can only reach one of them. */}
      <TripContextBar current="/addons" />
      <section className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <PageHeader
          eyebrow="Add-ons"
          title="Trip add-ons"
          description="Optional extras on top of the trip in your planner right now — travel insurance, an airport transfer, a private tour. Your client accepts or declines each from its own link."
        />

        {allowed ? (
          <div className="mt-8">
            <AddonsEditor />
          </div>
        ) : (
          <LockedToolCard
            toolLabel="Trip add-ons"
            plan={plan}
            bullets={[
              "Offer optional extras — insurance, a transfer, a private tour — on top of a trip.",
              "Your client accepts or declines each from their own link, and you see the answer.",
            ]}
          />
        )}
      </section>
      <Footer />
    </main>
  );
}
