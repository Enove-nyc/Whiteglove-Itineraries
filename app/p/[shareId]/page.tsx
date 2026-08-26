import Link from "next/link";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import ProposalClientView from "@/components/ProposalClientView";
import { getSharedProposal } from "@/lib/account-store";
import { PROPOSAL_STATUS_LABEL, proposalExpired } from "@/data/proposal";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";

// A proposal is handed to one client, not found — the same reason /i and /f
// are noindexed. Brand-aware: /p is one of the itineraries domain's own
// pages too, the same as the trip app it eventually becomes.
export async function generateMetadata() {
  const itineraries = (await currentBrand()) === "itineraries";
  return pageMetadata({
    title: itineraries ? "Your proposal | White Glove Itineraries" : "Your proposal | White Glove Kosher Travel",
    description: "A trip proposal prepared for you.",
    path: "/p",
    noIndex: true,
  });
}

export const dynamic = "force-dynamic";

export default async function ProposalPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const shared = await getSharedProposal(shareId);

  if (!shared) {
    return (
      <main className="min-h-screen bg-[var(--cream)]">
        <Navbar />
        <section className="mx-auto max-w-2xl px-5 py-20 text-center sm:px-8">
          <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">This proposal isn&apos;t available</h1>
          <p className="mt-4 text-stone-600">The link may have been turned off, or the proposal hasn&apos;t been sent yet. Ask your travel advisor for a fresh link.</p>
          <Link href="/" className="mt-8 inline-block border border-[var(--navy)] bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white">Back to White Glove</Link>
        </section>
        <Footer />
      </main>
    );
  }

  const { proposal, tripName, ownerName, advisor } = shared;
  const today = new Date().toISOString().slice(0, 10);
  const expired = proposalExpired(proposal, today);

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <Navbar />
      <section className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
        <div className="border border-[var(--gold-light)] bg-[#fcfaf6] p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--gold-ink)]">
            Trip proposal{expired ? " — expired" : ""}
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)] sm:text-3xl">
            {tripName || "Your trip"}
          </h1>
          <p className="mt-2 text-sm text-stone-600">
            Prepared by {advisor || ownerName || "your travel advisor"}
            {proposal.expiresAt && !expired ? ` · Open through ${proposal.expiresAt}` : ""}
          </p>
          <p className="mt-3 inline-block rounded-full border border-[var(--gold-light)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)]">
            {PROPOSAL_STATUS_LABEL[proposal.status]}
          </p>
        </div>

        <ProposalClientView shareId={shareId} proposal={proposal} expired={expired} />
      </section>
      <Footer />
    </main>
  );
}
