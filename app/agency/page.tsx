import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AgencyPanel from "@/components/AgencyPanel";
import AgencyTravelingPanel from "@/components/AgencyTravelingPanel";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { accountCookieName, getCurrentAccountSummary, readSessionEmail } from "@/lib/account-store";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";

// Private to whoever is on it. Nothing here belongs in a search result.
export async function generateMetadata() {
  const itineraries = (await currentBrand()) === "itineraries";
  return pageMetadata({
    title: itineraries ? "Your agency | White Glove Itineraries" : "Your agency | White Glove Kosher Travel",
    description: "Advisors sharing one Advisor Pro subscription and one letterhead.",
    path: "/agency",
    noIndex: true,
  });
}

/**
 * Where an Advisor Pro account turns itself into an agency, or manages one
 * it is already on. See lib/agency.ts for what that actually means — every
 * member is a full, separate login; the plan check itself is done by
 * AgencyPanel reading /api/account/agency, the same door that does
 * everything else here.
 */
export default async function AgencyPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(accountCookieName())?.value;
  const account = await getCurrentAccountSummary(cookie);
  const sessionEmail = readSessionEmail(cookie);
  const who = account?.email || sessionEmail || "";
  if (!who) redirect("/login?next=%2Fagency");

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <Navbar minimal homeHref="/advisor" />
      <section className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold-ink)]">Your account</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--navy)] sm:text-5xl">
          Your agency
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-600">
          Several advisor logins, one Advisor Pro subscription and one letterhead. Every advisor&apos;s own trips stay
          theirs — an agency shares who you are, not your client list.
        </p>
        <div className="mt-8">
          <AgencyPanel />
        </div>
        <AgencyTravelingPanel />
        <div className="mt-8 border-t border-[var(--gold-light)] pt-6">
          <Link href="/account" className="text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">
            Back to your account
          </Link>
        </div>
      </section>
      <Footer />
    </main>
  );
}
