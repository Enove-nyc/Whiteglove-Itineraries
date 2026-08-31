import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ClientProfilePanel from "@/components/ClientProfilePanel";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkButton } from "@/components/ui/Button";
import { accountCookieName, getClientTrips, getCurrentAccountSummary, readSessionEmail, resolveBusinessOwner } from "@/lib/account-store";
import { getPlan } from "@/lib/account-plan-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";

export async function generateMetadata() {
  // Reads the brand rather than saying "White Glove" and meaning neither.
  // tests/itineraries-brand.test.ts holds every page on this domain to it:
  // two companies, and a title that names the wrong one is the whole failure.
  const itineraries = (await currentBrand()) === "itineraries";
  return pageMetadata({
    title: itineraries ? "Client | White Glove Itineraries" : "Client | White Glove Kosher Travel",
    description: "One client, their trips and what's noted about them.",
    path: "/clients",
    noIndex: true,
  });
}

export const dynamic = "force-dynamic";

export default async function ClientProfilePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const cookieStore = await cookies();
  const cookie = cookieStore.get(accountCookieName())?.value;
  const account = await getCurrentAccountSummary(cookie);
  const sessionEmail = readSessionEmail(cookie);
  const who = account?.email || sessionEmail || "";
  if (!who) redirect(`/login?next=%2Fclients%2F${encodeURIComponent(key)}`);

  const owner = await resolveBusinessOwner(who);
  const plan = await getPlan(owner);
  if (!mayServeCompanionClients(plan)) redirect("/clients");

  const trips = await getClientTrips(owner, key);
  if (trips.length === 0) {
    return (
      <main className="min-h-screen bg-[var(--cream)]">
        <Navbar />
        <section className="mx-auto max-w-2xl px-5 py-20 sm:px-8">
          <EmptyState
            title="No client by that name"
            description="They may have been renamed on their trips, or this link is out of date."
            action={<LinkButton href="/clients">Back to clients</LinkButton>}
          />
        </section>
        <Footer />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <Navbar />
      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        <PageHeader eyebrow="Clients" title={trips[0].client || "This client"} />
        <div className="mt-8">
          <ClientProfilePanel clientKey={key} />
        </div>
      </section>
      <Footer />
    </main>
  );
}
