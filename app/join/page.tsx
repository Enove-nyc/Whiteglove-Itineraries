import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import InvitationJoin from "@/components/InvitationJoin";
import { currentBrand } from "@/lib/site-brand";
import { BRAND_NAME } from "@/lib/site-brand-core";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const name = BRAND_NAME[await currentBrand()];
  return { ...pageMetadata({ title: `Your invitation — ${name}`, description: "Accept your invitation to create an account.", path: "/join", noIndex: true }), referrer: "no-referrer" as const };
}

export default async function JoinPage() {
  const name = BRAND_NAME[await currentBrand()];
  return <main className="min-h-screen bg-[var(--cream)]">
    <Navbar />
    <section className="mx-auto max-w-xl px-5 py-12 sm:px-8 sm:py-16">
      <div className="rounded-xl border border-[var(--gold-light)] bg-white p-6 sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--gold-ink)]">{name}</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Your invitation</h1>
        <InvitationJoin />
      </div>
    </section>
    <Footer />
  </main>;
}
