import Footer from "@/components/Footer";
import LockedToolCard from "@/components/LockedToolCard";
import Navbar from "@/components/Navbar";
import ProposalBuilder from "@/components/ProposalBuilder";
import { requireSignedIn } from "@/lib/require-signed-in";
import { accountCookieName, getCurrentAccountData } from "@/lib/account-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { getPlan } from "@/lib/account-plan-store";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";
import { cookies } from "next/headers";

// Brand-aware, signed-in only: /proposal is one of the itineraries domain's
// own pages, the same as /itinerary and /app.
export async function generateMetadata() {
  const itineraries = (await currentBrand()) === "itineraries";
  return pageMetadata({
    title: itineraries ? "Build a proposal — White Glove Itineraries" : "Build a proposal — White Glove Kosher Travel",
    description: "Offer a client one or more trip options to compare and approve before it becomes the itinerary.",
    path: "/proposal",
    noIndex: true,
  });
}

export const dynamic = "force-dynamic";

export default async function ProposalPage() {
  await requireSignedIn("/proposal");
  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountData(cookie);
  const plan = account ? await getPlan(account.email) : "free";
  const allowed = mayServeCompanionClients(plan);

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <Navbar minimal homeHref="/advisor" />
      <section className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold-ink)]">Proposals</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--navy)] sm:text-5xl">
          Build a proposal
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          One or more options for the trip in your planner right now — hotels, flights, activities, a price. Send it, and
          your client compares and approves before it becomes the itinerary.
        </p>

        {allowed ? (
          <div className="mt-8">
            <ProposalBuilder />
          </div>
        ) : (
          <LockedToolCard
            toolLabel="Proposals"
            plan={plan}
            bullets={[
              "Compare hotels, flights and activities side by side, with a price.",
              "A client approves it with one tap — no back-and-forth over email.",
              "Once approved, it becomes the itinerary automatically.",
            ]}
          />
        )}
      </section>
      <Footer />
    </main>
  );
}
