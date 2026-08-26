import { cookies } from "next/headers";
import Footer from "@/components/Footer";
import LockedToolCard from "@/components/LockedToolCard";
import Navbar from "@/components/Navbar";
import LibraryManager from "@/components/LibraryManager";
import { requireSignedIn } from "@/lib/require-signed-in";
import { accountCookieName, getCurrentAccountData } from "@/lib/account-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { getPlan } from "@/lib/account-plan-store";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";

// Brand-aware, signed-in only: /library is one of the itineraries domain's
// own pages, the same as /itinerary, /app and /proposal.
export async function generateMetadata() {
  const itineraries = (await currentBrand()) === "itineraries";
  return pageMetadata({
    title: itineraries ? "Your content library — White Glove Itineraries" : "Your content library — White Glove Kosher Travel",
    description: "Save hotels, activities, tours and contacts once, and reuse them on any proposal or trip.",
    path: "/library",
    noIndex: true,
  });
}

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  await requireSignedIn("/library");
  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountData(cookie);
  const plan = account ? await getPlan(account.email) : "free";
  const allowed = mayServeCompanionClients(plan);

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <Navbar minimal homeHref="/advisor" />
      <section className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold-ink)]">Content library</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--navy)] sm:text-5xl">
          Your content library
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          Hotels, activities, tours and contacts, saved once and ready to drop into any proposal instead of retyping
          them — group them into a destination pack, like Rome Family Trip, to add several at once.
        </p>

        {allowed ? (
          <div className="mt-8">
            <LibraryManager />
          </div>
        ) : (
          <LockedToolCard
            toolLabel="A content library"
            plan={plan}
            bullets={[
              "Save a hotel, activity or contact once, and reuse it on any proposal.",
              "Group favorites into a pack, like Rome Family Trip, to add several at once.",
              "Stop retyping the same details for every client.",
            ]}
          />
        )}
      </section>
      <Footer />
    </main>
  );
}
