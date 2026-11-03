import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";

export async function generateMetadata() {
  const brand = await currentBrand();
  return pageMetadata({
    title: brand === "itineraries" ? "Planned options — White Glove Itineraries" : "Planned Itineraries options — White Glove Kosher Travel",
    description: "White Glove Itineraries is in development. Explore the options we are planning for travellers and advisers; purchases are not open.",
    path: "/pricing",
  });
}

const OPTIONS = [
  { name: "Personal planning", detail: "We plan to offer tools for travellers to build, save and print their own itineraries." },
  { name: "Trip Pass", detail: "We are developing a one-trip upgrade for carrying an itinerary and saved travel documents in the app." },
  { name: "Advisor Starter", detail: "We plan to offer client trip management, client app links and conversations organised around each trip." },
  { name: "Advisor Pro", detail: "We are working toward adviser branding, reusable trip templates and additional tools for managing a travel business." },
] as const;

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[var(--cream)] text-[var(--ink)]">
      <Navbar />
      <section className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">In development · Not open yet</p>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--navy)] sm:text-5xl">Options we are planning for launch.</h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-stone-700">White Glove Itineraries is not open for business yet. We are not accepting purchases or subscriptions. The outlines below describe what we are working toward, rather than services available to buy today.</p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {OPTIONS.map((option) => (
            <article key={option.name} className="rounded-xl border border-[var(--gold-light)] bg-white p-6">
              <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{option.name}</h2>
              <p className="mt-3 text-sm leading-7 text-stone-700">{option.detail}</p>
            </article>
          ))}
        </div>
        <p className="mt-8 text-sm leading-7 text-stone-700">Features, plan details and pricing may change before opening. We will publish the available options and their prices when we are ready to launch.</p>
        <Link href="/sample-itinerary" className="mt-7 inline-flex min-h-11 items-center rounded-full bg-[var(--navy)] px-6 py-3 text-sm font-semibold text-white">Explore a sample itinerary</Link>
      </section>
      <Footer />
    </main>
  );
}
