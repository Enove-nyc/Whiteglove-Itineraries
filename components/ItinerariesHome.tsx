import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import HomeAudience from "@/components/HomeAudience";

const PLANNED_FEATURES = [
  {
    title: "Build a complete itinerary",
    body: "Organise flights, accommodation, transport, activities and notes in one day-by-day itinerary.",
    href: "/sample-itinerary",
    link: "Explore a sample itinerary",
  },
  {
    title: "Put the trip on the traveller’s phone",
    body: "Keep the itinerary, schedule, directions and travel documents together on the traveller’s phone.",
    href: "/app/preview",
    link: "Explore the companion app",
  },
  {
    title: "Help advisers manage their clients’ trips",
    body: "Manage client trips, share itineraries and keep conversations with the right trip as plans develop.",
    href: "/about",
    link: "Explore the platform",
  },
] as const;

export default function ItinerariesHome() {
  return (
    <main className="wg-itineraries-home min-h-screen bg-[var(--cream)] text-[var(--ink)]">
      <Navbar brand="itineraries" />
      <section className="wg-itineraries-hero bg-[var(--navy)] px-5 py-16 text-white sm:px-8 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D8BC7A]">For travellers and travel advisers</p>
          <HomeAudience />

        </div>
      </section>
      <section id="planned-features" className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">Your trip, together</p>
        <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--navy)] sm:text-4xl">One connected experience, from planning to travelling.</h2>
        <p className="mt-5 max-w-3xl text-base leading-7 text-stone-700">
          Build, organise and carry your trip in one connected place — from the first plan to the last day.
        </p>
        <div className="mt-9 grid gap-6 md:grid-cols-3">
          {PLANNED_FEATURES.map((feature) => (
            <article key={feature.title} className="flex flex-col rounded-xl border border-[var(--gold-light)] bg-white p-6">
              <h3 className="font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]">{feature.title}</h3>
              <p className="mt-4 flex-1 text-sm leading-7 text-stone-700">{feature.body}</p>
              <Link href={feature.href} className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4">{feature.link} →</Link>
            </article>
          ))}
        </div>
        <p className="mt-7 text-sm leading-6 text-stone-700">Your itinerary stays in your account, ready to revisit whenever your plans change.</p>
      </section>
      <Footer />
    </main>
  );
}



