import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { readBookingLink } from "@/lib/booking-access-store";
import Footer from "@/components/Footer";
import GloveMark from "@/components/GloveMark";
import Navbar from "@/components/Navbar";
import TravelExtras from "@/components/TravelExtras";
import { readExtras } from "@/lib/travel-extras-store";
import { COUNTRY_DOCS, DOCUMENT_CHECKLIST, PAYMENT_GUIDE } from "@/data/travel-guide";
import { ADVISORY_LEVELS, ADVISORY_SOURCE_URL, advisoryFor, fetchAdvisories } from "@/lib/travel-advisories";

export const metadata = pageMetadata({
  title: "Travel guide — documents, advisories & paying | White Glove Kosher Travel",
  description: "Entry documents, live U.S. State Department safety advisories, and how to pay for your trip with points or cash.",
  path: "/travel-guide",
});

// Advisories are read on the server and cached for an hour.
export const revalidate = 3600;

const TONE: Record<string, string> = {
  ok: "border-emerald-300 bg-emerald-50 text-emerald-900",
  caution: "border-amber-300 bg-amber-50 text-amber-900",
  warn: "border-orange-400 bg-orange-50 text-orange-900",
  danger: "border-red-400 bg-red-50 text-red-900",
};

export default async function TravelGuidePage() {
  // Where the booking call to action may point today. See lib/booking-access.ts.
  const booking = await readBookingLink();
  const extras = await readExtras();
  const feed = await fetchAdvisories();
  const rows = COUNTRY_DOCS.map((c) => ({
    ...c,
    advisory: feed.available ? advisoryFor(feed.advisories, c.country) : null,
  }));
  const fetchedAt = feed.available
    ? new Date(feed.fetchedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })
    : null;

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <Navbar />

      <section className="wg-page-hero border-b border-[var(--gold-light)] px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.26em] text-[var(--gold-ink)]"><GloveMark size="xs" />Before you travel</p>
          <h1 className="mt-5 font-[family-name:var(--font-display)] text-5xl leading-tight text-[var(--navy)] sm:text-6xl">Travel guide</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-600">
            Entry documents, live government safety advisories, and how to pay for the trip. The advisory levels below update automatically from the U.S. State Department.
          </p>
          <nav className="mt-8 flex flex-wrap gap-3">
            <a href="#advisories" className="border border-[var(--gold)] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white">Safety advisories</a>
            <a href="#documents" className="border border-[var(--gold)] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white">Documents &amp; visas</a>
            <a href="#paying" className="border border-[var(--gold)] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white">Paying for the trip</a>
            {/* Data abroad is the same kind of question as documents and money,
                and this is the page somebody already thinking "before I
                travel" is on. It had no link from here at all. */}
            <Link href="/esim" className="border border-[var(--gold)] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white">eSIMs &amp; data</Link>
            <Link href="/travel-gear" className="border border-[var(--gold)] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white">Travel gear</Link>
          </nav>
        </div>
      </section>

      {/* ---- Live advisories ---- */}
      <section id="advisories" className="mx-auto max-w-5xl px-5 py-14 sm:px-8">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--gold-ink)]"><GloveMark size="xs" />Live · U.S. State Department</p>
        <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">Safety advisories</h2>
        {feed.available ? (
          <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
            Republished from the official feed{fetchedAt ? ` · last read ${fetchedAt} UTC` : ""}. These are the U.S. government&apos;s assessments, not ours.
          </p>
        ) : (
          <p className="mt-3 max-w-3xl border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            The live feed could not be read just now ({feed.reason}) — please check the{" "}
            <a href={ADVISORY_SOURCE_URL} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">official advisory page</a>{" "}
            directly. We don&apos;t show a saved safety level, because an out-of-date one is worse than none.
          </p>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {rows.map(({ country, advisory }) => {
            const tone = advisory?.level ? ADVISORY_LEVELS[advisory.level]?.tone ?? "caution" : null;
            return (
              <div key={country} className={`border-l-4 px-4 py-3 ${tone ? TONE[tone] : "border-[var(--gold-light)] bg-[#FAF8F3] text-stone-600"}`}>
                <p className="font-[family-name:var(--font-display)] text-2xl leading-tight">{country}</p>
                {advisory ? (
                  <>
                    <p className="mt-1 font-semibold">{advisory.levelLabel}</p>
                    <a href={advisory.link || ADVISORY_SOURCE_URL} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-bold uppercase tracking-[0.1em] underline underline-offset-2">Full advisory →</a>
                  </>
                ) : (
                  <p className="mt-1 text-sm">No current advisory listed for this country in the feed — check the official page before traveling.</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ---- Documents ---- */}
      <section id="documents" className="border-y border-[var(--gold-light)] bg-[#FAF8F3] px-5 py-14 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--gold-ink)]"><GloveMark size="xs" />Passports, visas &amp; entry</p>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">Documents</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
            Entry rules change without warning and depend on your passport — confirm with the official source for each country below.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {DOCUMENT_CHECKLIST.map((item) => (
              <article key={item.title} className="wg-card border border-[var(--gold-light)] bg-white p-5">
                <p className="font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--navy)]">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">{item.text}</p>
              </article>
            ))}
          </div>

          <h3 className="mt-12 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Official source by country</h3>

          {/* On a phone a three-column table means constant side-scrolling, so
              the same information stacks into cards instead. */}
          <div className="mt-4 grid gap-3 sm:hidden">
            {COUNTRY_DOCS.map((c) => (
              <div key={c.country} className="border border-[var(--gold-light)] bg-white p-4">
                <p className="font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--navy)]">{c.country}</p>
                {c.note && <p className="mt-1 text-xs leading-5 text-amber-800">{c.note}</p>}
                <div className="mt-3 flex flex-col gap-1">
                  <a href={c.officialUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">Government source →</a>
                  <a href={c.stateDeptUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">State Dept page →</a>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 hidden overflow-x-auto border border-[var(--gold-light)] bg-white sm:block">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[var(--gold-light)] text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">
                <tr><th className="px-4 py-3">Country</th><th className="px-4 py-3">Official entry information</th><th className="px-4 py-3">U.S. country page</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--gold-light)]">
                {COUNTRY_DOCS.map((c) => (
                  <tr key={c.country}>
                    <td className="px-4 py-3 align-top">
                      <span className="font-semibold text-[var(--navy)]">{c.country}</span>
                      {c.note && <span className="mt-1 block text-xs leading-5 text-amber-800">{c.note}</span>}
                    </td>
                    <td className="px-4 py-3 align-top"><a href={c.officialUrl} target="_blank" rel="noreferrer" className="text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">Government source →</a></td>
                    <td className="px-4 py-3 align-top"><a href={c.stateDeptUrl} target="_blank" rel="noreferrer" className="text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">State Dept page →</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ---- Paying ---- */}
      <section id="paying" className="mx-auto max-w-5xl px-5 py-14 sm:px-8">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--gold-ink)]"><GloveMark size="xs" />Points &amp; money</p>
        <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">Paying for the trip</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
          General practice for using points and cards well. Program rules and transfer partners change often — always confirm current terms with your own card and airline programs before moving points.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {PAYMENT_GUIDE.map((item) => (
            <article key={item.title} className="wg-card border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
              <p className="font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--navy)]">{item.title}</p>
              <p className="mt-2 text-sm leading-6 text-stone-600">{item.text}</p>
            </article>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={booking.href} className="border border-[var(--navy)] bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] hover:border-[var(--gold)]">{booking.label} →</Link>
          <Link href="/itinerary" className="border border-[var(--gold)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white">Open the planner →</Link>
        </div>
        <p className="mt-8 text-xs leading-5 text-stone-500">
          This guide is general information, not legal, financial or immigration advice. Entry requirements, safety conditions and program terms are set by governments and companies, and can change at any time — always confirm with the official source before you travel.
        </p>
      </section>

      {/* THE THINGS THEMSELVES, under the guidance about them. This row lived
          on /book alone, where somebody has just searched a flight — the wrong
          moment for a travel hotplate. Anybody reading this page is already
          thinking about what to take. */}
      <TravelExtras
        extras={extras}
        heading="Worth taking with you"
        intro="Bought from the seller, not from us. Nothing here is a recommendation about which to choose."
      />
      <p className="px-5 pb-12 text-center text-sm sm:px-8">
        <Link href="/travel-gear" className="font-semibold text-[var(--gold-ink)] underline">
          See the full travel gear shelf →
        </Link>
      </p>

      <Footer />
    </main>
  );
}
