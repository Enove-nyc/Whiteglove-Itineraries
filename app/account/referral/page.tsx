import Link from "next/link";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { publicReferralStatus } from "@/lib/referral";
import { getOrCreateReferralCode, readReferralSettings, referralStoreAvailable } from "@/lib/referral-store";
import { accountCookieName, readSessionEmail } from "@/lib/account-store";
import { cookies } from "next/headers";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";
import { BRAND_NAME } from "@/lib/site-brand-core";

export async function generateMetadata() {
  const name = BRAND_NAME[await currentBrand()];
  return pageMetadata({
    title: `Referral programme | ${name}`,
    description: `Invite friends when the ${name} referral programme is open.`,
    path: "/account/referral",
    noIndex: true,
  });
}

export const dynamic = "force-dynamic";

export default async function AccountReferralPage() {
  const settings = await readReferralSettings();
  const status = publicReferralStatus(settings);
  const jar = await cookies();
  const email = readSessionEmail(jar.get(accountCookieName())?.value);

  let code: string | null = null;
  if (status.open && email && referralStoreAvailable()) {
    const record = await getOrCreateReferralCode(email);
    code = record?.code ?? null;
  }

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <Navbar />
      <section className="mx-auto max-w-xl px-5 py-16 sm:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Account</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">{status.headline}</h1>
        <p className="mt-4 text-sm leading-7 text-stone-600">{status.body}</p>

        {!status.open ? (
          <p className="mt-6 text-sm leading-6 text-stone-500">
            Nothing to share yet. When the owner opens the programme and publishes reward rules, your link will appear
            here.
          </p>
        ) : !email ? (
          <p className="mt-6 text-sm leading-6 text-stone-600">
            <Link href="/account" className="font-semibold underline decoration-[var(--gold)] underline-offset-4">
              Sign in
            </Link>{" "}
            to see your referral link.
          </p>
        ) : code ? (
          <div className="mt-6 rounded-xl border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">Your code</p>
            <p className="mt-2 font-mono text-2xl text-[var(--navy)]">{code}</p>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Your invite link: <code className="text-xs">/r/{code}</code>. Rewards follow the rules above — nothing is
              invented here.
            </p>
          </div>
        ) : (
          <p className="mt-6 text-sm text-stone-600">Could not create a code just now. Try again later.</p>
        )}

        <Link
          href="/account"
          className="mt-8 inline-flex min-h-11 items-center border border-[var(--gold)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]"
        >
          Back to account
        </Link>
      </section>
      <Footer />
    </main>
  );
}
