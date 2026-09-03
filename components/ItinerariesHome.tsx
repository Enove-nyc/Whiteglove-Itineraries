import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import HomeAudience from "@/components/HomeAudience";
import StartingPoints from "@/components/StartingPoints";

/**
 * The home page for whitegloveitineraries.com.
 *
 * The same app, worn as a general itinerary tool rather than a kosher travel
 * site. It leads with the thing this domain is for — planning a trip and
 * handing it to somebody on their phone — and leaves the kosher directory on
 * the other domain. Everything it links to already exists; this is a front
 * door, not a new section.
 *
 * TWO AUDIENCES, AND THE HERO NOW ASKS WHICH. It spoke to one of them only —
 * "in your client's pocket", "one link per client" — so somebody planning a
 * single trip of their own, which is a plan this product sells at a one-time
 * fee, read a page about running clients and had to work out for themselves
 * that it was also for them. components/HomeAudience.tsx.
 *
 * The three cards below are for the advisor already
 * using this as a client tool. Underneath them is the site's other real
 * audience — somebody planning their own trip — who used to have no way in
 * from this page at all: no self-service door, nothing free, nothing to
 * search. StartingPoints is the same three doors every other page on the
 * site names the same way (lib/starting-points.ts) — get recommendations,
 * build it yourself, search booking partners — not a new pitch invented here.
 */
export default function ItinerariesHome() {
  return (
    <main className="min-h-screen bg-[var(--cream)] text-[var(--ink)]">
      <Navbar brand="itineraries" />

      <section className="relative overflow-hidden bg-[var(--navy)] px-5 py-20 text-white sm:px-8 sm:py-28">
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-[var(--navy)] via-[#193F46] to-[#193F46]" />
        <div className="relative mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#D8BC7A]">White Glove Itineraries</p>
          <HomeAudience />
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            {
              title: "Plan it",
              body: "Dates, where they are staying, the stops, the flights. The planner keeps the day-by-day in order.",
              href: "/itinerary",
              link: "Open the planner",
            },
            /* BOTH OF THESE POINTED AT /app, AND /app IS A DOOR.
               To a visitor who has not signed in it offers two things — enter
               a code from your adviser, or log in — so "See the app" showed
               somebody a code field instead of the app, and "Open your inbox"
               showed them the client-code door instead of an inbox. Two of the
               three cards on the page that explains the product opened onto a
               lock.

               The app has a real public demonstration at /app/preview: one
               synthetic trip, no account, the thing itself. The inbox has no
               public version because it holds real client conversations, so
               that one goes to sign-in and carries where it was headed. */
            {
              title: "Hand it over",
              body: "Create a client link for a trip. It opens as an app on their phone — no account, only their itinerary.",
              href: "/app/preview",
              link: "See the app",
            },
            {
              title: "Stay in touch",
              body: "Every client is a chat. You see all of them in one inbox; they reach you from their trip.",
              href: "/login?next=%2Fapp",
              link: "Open your inbox",
            },
          ].map((c) => (
            <div key={c.title} className="flex flex-col rounded-2xl border border-[var(--gold-light)] bg-white p-6">
              <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{c.title}</h2>
              <p className="mt-3 flex-1 text-sm leading-6 text-stone-600">{c.body}</p>
              {/* min-h-11: these measured 300x20 at every width — the whole
                  card is not a link, so this line is the only thing to press
                  and it was half the minimum target. */}
              <Link
                href={c.href}
                className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2"
              >
                {c.link} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-16 sm:px-8">
        {/* Build the trip yourself and search booking partners lead; get
            recommendations still earns revenue and stays reachable, just
            without competing for the same attention. */}
        <StartingPoints heading="Planning your own trip?" deemphasize={["/plan"]} />
      </section>

      <Footer brand="itineraries" />
    </main>
  );
}
