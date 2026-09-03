import Footer from "@/components/Footer";
import LockedToolCard from "@/components/LockedToolCard";
import Navbar from "@/components/Navbar";
import TripActivityFeed from "@/components/TripActivityFeed";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireSignedIn } from "@/lib/require-signed-in";
import { accountCookieName, getCurrentAccountData, resolveBusinessOwner } from "@/lib/account-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { getPlan } from "@/lib/account-plan-store";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";
import { cookies } from "next/headers";

// Brand-aware, signed-in only: /activity is one of the itineraries domain's
// own pages, the same as /payments and /pipeline.
export async function generateMetadata() {
  const itineraries = (await currentBrand()) === "itineraries";
  return pageMetadata({
    title: itineraries ? "Trip activity — White Glove Itineraries" : "Trip activity — White Glove Kosher Travel",
    description: "What actually happened on the trip in your planner right now.",
    path: "/activity",
    noIndex: true,
  });
}

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  await requireSignedIn("/activity");
  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountData(cookie);
  const plan = account ? await getPlan(await resolveBusinessOwner(account.email)) : "free";
  const allowed = mayServeCompanionClients(plan);

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <Navbar />
      <section className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <PageHeader
          eyebrow="Activity"
          title="Trip activity"
          description="A proposal sent, a payment received, an add-on answered, a stage changed — logged automatically as it happens on the trip in your planner right now."
        />

        {allowed ? (
          <div className="mt-8">
            <TripActivityFeed />
          </div>
        ) : (
          <LockedToolCard
            toolLabel="A trip's activity feed"
            plan={plan}
            bullets={[
              "A proposal sent, a payment received, an add-on answered — logged as it happens.",
              "Nothing to keep by hand: every entry writes itself at the moment it occurs.",
            ]}
          />
        )}
      </section>
      <Footer />
    </main>
  );
}
