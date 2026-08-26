import Footer from "@/components/Footer";
import LockedToolCard from "@/components/LockedToolCard";
import Navbar from "@/components/Navbar";
import PaymentsPanel from "@/components/PaymentsPanel";
import { requireSignedIn } from "@/lib/require-signed-in";
import { accountCookieName, getCurrentAccountData } from "@/lib/account-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { getPlan } from "@/lib/account-plan-store";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";
import { cookies } from "next/headers";

// Brand-aware, signed-in only: /payments is one of the itineraries domain's
// own pages, the same as /proposal and /pipeline.
export async function generateMetadata() {
  const itineraries = (await currentBrand()) === "itineraries";
  return pageMetadata({
    title: itineraries ? "Trip payments — White Glove Itineraries" : "Trip payments — White Glove Kosher Travel",
    description: "Set a trip's balance, split it across families, and see what's been collected.",
    path: "/payments",
    noIndex: true,
  });
}

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  await requireSignedIn("/payments");
  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountData(cookie);
  const plan = account ? await getPlan(account.email) : "free";
  const allowed = mayServeCompanionClients(plan);

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <Navbar minimal homeHref="/advisor" />
      <section className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold-ink)]">Payments</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--navy)] sm:text-5xl">
          Trip payments
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          Set a total for the trip in your planner right now, split it across the families or travelers on it, and see
          what each has paid. Money goes straight to your own connected Stripe account — never through White Glove.
        </p>

        {allowed ? (
          <div className="mt-8">
            <PaymentsPanel />
          </div>
        ) : (
          <LockedToolCard
            toolLabel="Trip payments"
            plan={plan}
            bullets={[
              "Set one total for a trip and split it across families or travelers.",
              "See what each person has paid and what's outstanding.",
              "Money goes straight to your own connected Stripe account.",
            ]}
          />
        )}
      </section>
      <Footer minimal />
    </main>
  );
}
