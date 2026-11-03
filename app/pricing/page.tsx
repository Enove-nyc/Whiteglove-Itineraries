import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";

export async function generateMetadata() {
  const brand = await currentBrand();
  return pageMetadata({
    title: brand === "itineraries" ? "Account options — White Glove Itineraries" : "Account options — White Glove Kosher Travel",
    description: "Tools for your own itinerary or for managing client trips.",
    path: "/pricing",
  });
}

const OPTIONS = [
  { name: "Personal planning", detail: "Build, save and print your own itineraries." },
  { name: "Trip Pass", detail: "Carry an itinerary and saved travel documents in the app." },
  { name: "Advisor Starter", detail: "Manage client trips, share client app links and keep conversations organised around each trip." },
  { name: "Advisor Pro", detail: "Use adviser branding, reusable trip templates and additional tools for managing client trips." },
] as const;

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[var(--cream)] text-[var(--ink)]">
      <Navbar />
      <section className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">Account options</p>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--navy)] sm:text-5xl">Tools for the way you travel.</h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-stone-700">Organise your own journey or manage trips for your clients. These options bring the right tools together for each kind of traveller.</p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {OPTIONS.map((option) => (
            <article key={option.name} className="rounded-xl border border-[var(--gold-light)] bg-white p-6">
              <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{option.name}</h2>
              <p className="mt-3 text-sm leading-7 text-stone-700">{option.detail}</p>
            </article>
          ))}
        </div>
        <p className="mt-8 text-sm leading-7 text-stone-700">New accounts are available by invitation. Log in to view your account and its available tools.</p>
        <Link href="/sample-itinerary" className="mt-7 inline-flex min-h-11 items-center rounded-full bg-[var(--navy)] px-6 py-3 text-sm font-semibold text-white">Explore a sample itinerary</Link>
      </section>
      <Footer />
    </main>
  );
}

