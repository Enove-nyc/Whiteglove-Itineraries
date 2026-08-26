import Link from "next/link";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import ClientFormFill from "@/components/ClientFormFill";
import { getSharedForm } from "@/lib/account-store";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";

// A pre-trip form is handed to one client, not found — the same reason /i,
// /f and /p are noindexed. Brand-aware: /form is one of the itineraries
// domain's own pages too.
export async function generateMetadata() {
  const itineraries = (await currentBrand()) === "itineraries";
  return pageMetadata({
    title: itineraries ? "Your travel form | White Glove Itineraries" : "Your travel form | White Glove Kosher Travel",
    description: "A short pre-trip form your advisor asked for.",
    path: "/form",
    noIndex: true,
  });
}

export const dynamic = "force-dynamic";

export default async function ClientFormPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const shared = await getSharedForm(shareId);

  if (!shared) {
    return (
      <main className="min-h-screen bg-[var(--cream)]">
        <Navbar />
        <section className="mx-auto max-w-2xl px-5 py-20 text-center sm:px-8">
          <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">This form isn&apos;t available</h1>
          <p className="mt-4 text-stone-600">The link may have been turned off. Ask your travel advisor for a fresh one.</p>
          <Link href="/" className="mt-8 inline-block border border-[var(--navy)] bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white">Back to White Glove</Link>
        </section>
        <Footer />
      </main>
    );
  }

  const { template, tripName, advisor } = shared;

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <Navbar />
      <section className="mx-auto max-w-2xl px-5 py-10 sm:px-8">
        <div className="border border-[var(--gold-light)] bg-[#fcfaf6] p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--gold-ink)]">A few details for your trip</p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)] sm:text-3xl">
            {tripName || "Your trip"}
          </h1>
          <p className="mt-2 text-sm text-stone-600">Requested by {advisor || "your travel advisor"}</p>
          {template.note && <p className="mt-3 text-sm text-stone-700">{template.note}</p>}

          <ClientFormFill shareId={shareId} template={template} />
        </div>
      </section>
      <Footer />
    </main>
  );
}
