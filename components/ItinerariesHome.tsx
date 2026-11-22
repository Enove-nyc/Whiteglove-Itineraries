import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { LAKE_COMO_PREVIEW } from "@/data/lake-como-sample";

const starts = [
  { title: "Import a booking", body: "Sign in to add details from a confirmation to your trip.", href: "/itinerary?start=import" },
  { title: "Use a sample", body: "Copy three days on Lake Como and set your dates whenever you’re ready.", href: "/itinerary?start=sample" },
  { title: "Build from scratch", body: "Start with your trip name, then add flights, stays and stops.", href: "/itinerary" },
];

export default function ItinerariesHome() {
  return (
    <main className="wg-itineraries-home min-h-screen bg-[var(--cream)] text-[var(--ink)]">
      <Navbar brand="itineraries" />
      <section className="wg-itineraries-hero px-5 py-12 text-[var(--header-ink)] sm:px-8 sm:py-20">
        <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-[1fr_20rem]">
          <div>
            <h1 className="max-w-xl font-[family-name:var(--font-display)] text-5xl leading-tight sm:text-6xl">Build your trip. Take it with you.</h1>
            <p className="mt-4 max-w-lg text-base leading-7">Put flights, stays and stops into one day-by-day itinerary, then open the trip on your phone.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="#start" className="inline-flex min-h-11 items-center rounded-md bg-[var(--navy)] px-5 font-semibold text-white">Start an itinerary</Link>
              <Link href="/app/preview" className="inline-flex min-h-11 items-center rounded-md border border-[var(--navy)] px-5 font-semibold">See a finished trip</Link>
            </div>
            <Link href="/book" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">Search flights, stays and cars</Link>
          </div>
          <Link href="/app/preview" className="mx-auto block w-full max-w-xs rounded-[2rem] border-4 border-[var(--navy)] bg-white p-5 text-[var(--navy)] shadow-lg">
            <p className="text-sm text-stone-600">Sample itinerary · Lake Como</p>
            <p className="mt-1 text-2xl font-semibold">{LAKE_COMO_PREVIEW.title}</p>
            <ol className="mt-4 divide-y divide-stone-200">
              {LAKE_COMO_PREVIEW.activities.map((activity, index) => (
                <li key={activity.id} className="py-3">
                  <p className="text-xs font-semibold text-stone-600">Day {index + 1} · {activity.startTime}</p>
                  <p className="mt-1 font-semibold">{activity.name}</p>
                  <p className="text-sm text-stone-600">{activity.address}</p>
                </li>
              ))}
            </ol>
          </Link>
        </div>
      </section>
      <section id="start" className="mx-auto max-w-5xl scroll-mt-20 px-5 py-12 sm:px-8">
        <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">How would you like to start?</h2>
        <p className="mt-3 leading-7 text-stone-700">Start as a guest. Your draft stays in this browser until you save it to your account.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {starts.map(({ title, body, href }) => (
            <Link key={href} href={href} className="rounded-xl border border-[var(--gold-light)] bg-white p-5 hover:border-[var(--gold)]">
              <h3 className="text-lg font-semibold text-[var(--navy)]">{title} <span aria-hidden="true">→</span></h3>
              <p className="mt-2 text-sm leading-6 text-stone-700">{body}</p>
            </Link>
          ))}
        </div>
      </section>
      <Footer />
    </main>
  );
}
