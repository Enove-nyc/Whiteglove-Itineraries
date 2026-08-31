import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import CommissionsPanel from "@/components/CommissionsPanel";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { PageHeader } from "@/components/ui/PageHeader";
import { accountCookieName, getCurrentAccountSummary, readSessionEmail, resolveBusinessOwner } from "@/lib/account-store";
import { getPlan } from "@/lib/account-plan-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { LinkButton } from "@/components/ui/Button";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";

// The agency-wide commission rollup — what suppliers owe the agency, across
// every client trip. Nothing here is a visitor's business.
export async function generateMetadata() {
  const itineraries = (await currentBrand()) === "itineraries";
  return pageMetadata({
    title: itineraries ? "Commissions | White Glove Itineraries" : "Commissions | White Glove Kosher Travel",
    description: "What suppliers owe the agency, across every trip.",
    path: "/commissions",
    noIndex: true,
  });
}

export const dynamic = "force-dynamic";

/**
 * BUSINESS-ONLY, the same door as the pipeline and clients. A different
 * money from Payments (client-to-agency) — see data/trip-commission.ts for
 * why the two are kept as separate ledgers.
 */
export default async function CommissionsPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(accountCookieName())?.value;
  const account = await getCurrentAccountSummary(cookie);
  const sessionEmail = readSessionEmail(cookie);
  const who = account?.email || sessionEmail || "";
  if (!who) redirect("/login?next=%2Fcommissions");

  const plan = await getPlan(await resolveBusinessOwner(who));
  if (!mayServeCompanionClients(plan)) {
    return (
      <main className="min-h-screen bg-[var(--cream)]">
        <Navbar />
        <section className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-16 sm:px-8 sm:py-24">
          <PageHeader
            eyebrow="Commissions"
            title="Part of a Business account."
            description="Commission tracking is what each trip's suppliers — a hotel, a tour operator — owe the agency for the business, gathered across every trip."
          />
          <LinkButton href="/account" className="w-fit">Ask about Business</LinkButton>
        </section>
        <Footer />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <Navbar />
      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        <PageHeader
          eyebrow="Commissions"
          title="Commission tracking"
          description="What each trip's suppliers owe the agency, and what's still outstanding — a different money from what clients pay."
        />
        <div className="mt-8">
          <CommissionsPanel />
        </div>
      </section>
      <Footer />
    </main>
  );
}
