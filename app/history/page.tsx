import { cookies } from "next/headers";
import Footer from "@/components/Footer";
import LockedToolCard from "@/components/LockedToolCard";
import Navbar from "@/components/Navbar";
import TripHistory from "@/components/TripHistory";
import { requireSignedIn } from "@/lib/require-signed-in";
import { accountCookieName, getCurrentAccountData } from "@/lib/account-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { getPlan } from "@/lib/account-plan-store";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";
import TripContextBar from "@/components/TripContextBar";

// Brand-aware, signed-in only: /history is one of the itineraries domain's
// own per-trip screens, the same as /proposal, /forms and /payments.
export async function generateMetadata() {
  const itineraries = (await currentBrand()) === "itineraries";
  return pageMetadata({
    title: itineraries ? "Trip history — White Glove Itineraries" : "Trip history — White Glove Kosher Travel",
    description: "Everything that has happened on a trip — proposals, forms, payments — in one place.",
    path: "/history",
    noIndex: true,
  });
}

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  await requireSignedIn("/history");
  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountData(cookie);
  const plan = account ? await getPlan(account.email) : "free";
  const allowed = mayServeCompanionClients(plan);

  return (
    <main className="flex min-h-screen flex-col bg-[var(--cream)]">
      <Navbar minimal homeHref="/advisor" />
      {/* Which trip this is, and the trip's other screens. */}
      <TripContextBar current="/history" />
      <section className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold-ink)]">History</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--navy)] sm:text-5xl">
          Trip history
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          What has actually happened on this trip — a proposal sent, a form returned, a payment settled — newest first.
          Nothing to fill in here; it is the record of the work on the trip&rsquo;s other screens.
        </p>

        {allowed ? (
          <div className="mt-8">
            <TripHistory />
          </div>
        ) : (
          <LockedToolCard
            toolLabel="Trip history"
            plan={plan}
            bullets={[
              "Proposals, forms and payments on a trip, in the order they happened.",
              "See what has moved without opening every screen to piece it together.",
              "A read-only record — nothing here to fill in or send.",
            ]}
          />
        )}
      </section>
      <Footer minimal />
    </main>
  );
}
