import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ClientsList from "@/components/ClientsList";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { PageHeader } from "@/components/ui/PageHeader";
import { accountCookieName, getCurrentAccountSummary, readSessionEmail, resolveBusinessOwner } from "@/lib/account-store";
import { getPlan } from "@/lib/account-plan-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { LinkButton } from "@/components/ui/Button";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";

// A planner's own client list — every distinct client on their trips, and
// where each one stands. Nothing here is a visitor's business, and the gate
// below means most accounts never reach it.
export async function generateMetadata() {
  const itineraries = (await currentBrand()) === "itineraries";
  return pageMetadata({
    title: itineraries ? "Clients | White Glove Itineraries" : "Clients | White Glove Kosher Travel",
    description: "Every client you've planned a trip for, in one place.",
    path: "/clients",
    noIndex: true,
  });
}

export const dynamic = "force-dynamic";

/**
 * A simple, travel-specific CRM — one card per client, derived fresh from
 * the name typed onto each trip's Details (never a second list to keep in
 * sync — see data/clients.ts). BUSINESS-ONLY, the same door as the pipeline
 * it's built from.
 */
export default async function ClientsPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(accountCookieName())?.value;
  const account = await getCurrentAccountSummary(cookie);
  const sessionEmail = readSessionEmail(cookie);
  const who = account?.email || sessionEmail || "";
  if (!who) redirect("/login?next=%2Fclients");

  const plan = await getPlan(await resolveBusinessOwner(who));
  if (!mayServeCompanionClients(plan)) {
    return (
      <main className="min-h-screen bg-[var(--cream)]">
        <Navbar />
        <section className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-16 sm:px-8 sm:py-24">
          <PageHeader
            eyebrow="Clients"
            title="Part of a Business account."
            description="Clients are every trip's own client name, gathered in one place — who they are, their upcoming and past trips, and anything worth remembering about them."
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
          eyebrow="Clients"
          title="Your clients"
          description="Everyone you've planned a trip for — named on a trip's Details in the planner."
        />
        <div className="mt-8">
          <ClientsList />
        </div>
      </section>
      <Footer />
    </main>
  );
}
