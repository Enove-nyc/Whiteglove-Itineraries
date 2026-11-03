import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import HomeAudience from "@/components/HomeAudience";

const PLANNED_FEATURES = [
  {
    title: "Build a complete itinerary",
    body: "We are developing a place to organise flights, accommodation, transport, activities and notes in one day-by-day plan.",
    href: "/sample-itinerary",
    link: "Explore a sample itinerary",
  },
  {
    title: "Put the trip on the traveller’s phone",
    body: "We plan to turn that itinerary into a companion app with the schedule, directions and travel documents together, including access to saved information offline.",
    href: "/app/preview",
    link: "Explore the companion app",
  },
  {
    title: "Help advisers manage their clients’ trips",
    body: "Our plans include client trip management, shared itineraries, messages and adviser branding, so the work can stay connected as a trip develops.",
    href: "/about",
    link: "Read what we are building",
  },
] as const;

export default function ItinerariesHome() {
  return (
    <main className="min-h-screen bg-[var(--cream)] text-[var(--ink)]">
      <Navbar brand="itineraries" />
      <section className="bg-[var(--navy)] px-5 py-16 text-white sm:px-8 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D8BC7A]">In development · Preparing for launch</p>
          <HomeAudience />
          <p className="mx-auto mt-7 max-w-2xl text-sm leading-7 text-[#e0e7e7]">
            White Glove Itineraries is a company in development. We look forward to welcoming you soon.
            Purchases and subscriptions are not yet available.
          </p>
        </div>
      </section>
      <section id="planned-features" className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">What we are planning to offer</p>
        <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--navy)] sm:text-4xl">One connected experience, from planning to travelling.</h2>
        <p className="mt-5 max-w-3xl text-base leading-7 text-stone-700">
          Our ambition is to make a meaningful step forward in how travellers and advisers build, organise and carry a trip.
          We are bringing these plans together as we prepare for launch.
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
        <p className="mt-7 text-sm leading-6 text-stone-700">These are planned capabilities. Features, pricing and availability may change before launch; we have not announced an opening date.</p>
      </section>
      <Footer />
    </main>
  );
}

