import { cookies } from "next/headers";
import Footer from "@/components/Footer";
import AdvisorTabBar from "@/components/companion/AdvisorTabBar";
import GroupPartiesPanel from "@/components/GroupPartiesPanel";
import LockedToolCard from "@/components/LockedToolCard";
import Navbar from "@/components/Navbar";
import { PageHeader } from "@/components/ui/PageHeader";
import { accountCookieName, getCurrentAccountData } from "@/lib/account-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { getPlan } from "@/lib/account-plan-store";
import { requireSignedIn } from "@/lib/require-signed-in";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";
import TripContextBar from "@/components/TripContextBar";

// Brand-aware, signed-in only: /group is one of the itineraries domain's own
// pages, the same as /payments, /proposal and /pipeline.
export async function generateMetadata() {
  const itineraries = (await currentBrand()) === "itineraries";
  return pageMetadata({
    title: itineraries ? "Group trip — White Glove Itineraries" : "Group trip — White Glove Kosher Travel",
    description: "Every family on one trip: who has paid, who owes, and who still needs to send something back.",
    path: "/group",
    noIndex: true,
  });
}

export const dynamic = "force-dynamic";

export default async function GroupPage() {
  await requireSignedIn("/group");
  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountData(cookie);
  const plan = account ? await getPlan(account.email) : "free";
  const allowed = mayServeCompanionClients(plan);

  return (
    <main className="min-h-screen bg-[var(--cream)] pb-24 sm:pb-0">
      <Navbar minimal />
      {/* Which trip this is, and the trip's other screens. */}
      <TripContextBar current="/group" />
      <section className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <PageHeader
          eyebrow="Group trip"
          title="Every family on the trip"
          description="One itinerary, several families — who has paid, who owes, who has not sent their information back. Travelers sharing a family name in the planner are one party here, the same way they are for the split and for privacy."
        />

        {allowed ? (
          <div className="mt-8">
            <GroupPartiesPanel />
          </div>
        ) : (
          <LockedToolCard
            toolLabel="Group trips"
            plan={plan}
            bullets={[
              "One itinerary with several families on it — never a copy per family.",
              "Who has paid, who owes, and who still owes you information.",
              "Each family's own details stay their own.",
            ]}
          />
        )}
      </section>
      <Footer />
      {allowed && <AdvisorTabBar />}
    </main>
  );
}
