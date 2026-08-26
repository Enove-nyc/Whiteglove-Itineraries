import { cookies } from "next/headers";
import Footer from "@/components/Footer";
import LockedToolCard from "@/components/LockedToolCard";
import Navbar from "@/components/Navbar";
import ClientFormBuilder from "@/components/ClientFormBuilder";
import { requireSignedIn } from "@/lib/require-signed-in";
import { accountCookieName, getCurrentAccountData } from "@/lib/account-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { getPlan } from "@/lib/account-plan-store";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";

// Brand-aware, signed-in only: /forms is one of the itineraries domain's
// own pages, the same as /itinerary, /app, /proposal and /library.
export async function generateMetadata() {
  const itineraries = (await currentBrand()) === "itineraries";
  return pageMetadata({
    title: itineraries ? "Client forms — White Glove Itineraries" : "Client forms — White Glove Kosher Travel",
    description: "Send a secure pre-trip form and read back what your client answers.",
    path: "/forms",
    noIndex: true,
  });
}

export const dynamic = "force-dynamic";

export default async function FormsPage() {
  await requireSignedIn("/forms");
  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountData(cookie);
  const plan = account ? await getPlan(account.email) : "free";
  const allowed = mayServeCompanionClients(plan);

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <Navbar minimal homeHref="/advisor" />
      <section className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold-ink)]">Client forms</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--navy)] sm:text-5xl">
          Client forms
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          Ask for exactly what you need — legal names, passports, preferences — before the trip. Answers come back
          here, never onto the itinerary itself.
        </p>

        {allowed ? (
          <div className="mt-8">
            <ClientFormBuilder />
          </div>
        ) : (
          <LockedToolCard
            toolLabel="A client form"
            plan={plan}
            bullets={[
              "Ask for exactly what you need — passports, preferences, emergency contacts.",
              "Answers come back to you, never onto the itinerary itself.",
              "Send it once, before the trip, and read the answers whenever they arrive.",
            ]}
          />
        )}
      </section>
      <Footer />
    </main>
  );
}
