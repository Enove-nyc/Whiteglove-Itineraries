import Link from "next/link";
import PageBlocks from "@/components/PageBlocks";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import DestinationSearch from "@/components/DestinationSearch";
import SectionHeading from "@/components/SectionHeading";
import StructuredData from "@/components/StructuredData";
import VerificationBadge from "@/components/VerificationBadge";
import { SubBrandCrest, SUB_BRAND_HEBREW, SUB_BRAND_NAME } from "@/components/SubBrand";
import { guidedDestinations, destinationHref } from "@/data/destinations";
import { ACTION_BUTTON_CLASS } from "@/lib/action-button";
import { getPublicCemeteryList } from "@/lib/cemeteries-view";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbs, collectionPage } from "@/lib/structured-data";
import { TRUST_LEVELS } from "@/lib/trust-status";
import { resolvePage } from "@/lib/pages";

// NOT force-dynamic any more, and this needed a real fix rather than deleting
// the line. A plain `revalidate` window was tried on pages like this before
// and measured to not work: the reads mix Prisma with a `cache: "no-store"`
// fetch to Redis, and that fetch leaves the page frozen at its build-time
// render however long the window is. force-dynamic was the right answer to
// that at the time — but it meant re-reading whole tables for every visit,
// including every crawler, which is what emptied the database's monthly
// transfer quota.
//
// The fix is in the read layer: the list is now a tagged cache busted by every
// write path the moment it saves (lib/cache-tags.ts). Same instant-on-save
// freshness, without a fresh database read per hit.

export const metadata = pageMetadata({
  title: "שתוליכנו לשלום — Jewish heritage travel, kevarim and batei hachaim | White Glove",
  description:
    "The heritage side of White Glove: who is buried where, how to reach the kever, who holds the key, and what is around it. Search a kever, a town or a tzaddik.",
  path: "/heritage",
});

/**
 * The heritage traveler's own page, inside the same Destinations directory
 * as everywhere else on the site.
 *
 * IT EXISTS BECAUSE THE WHOLE SITE USED TO BE THIS. The kevarim database is
 * the deepest thing White Glove has — over a hundred towns, hundreds of
 * kevarim, cemetery records with arrival notes and shomer contacts — and it
 * had spread into every global component: the front page led with it, the bar
 * carried three entries pointing at it, the footer asked for your kevarim, and
 * the sub-brand banner sat above pages about mountain hotels.
 *
 * None of that made the heritage content better. It made a vacation customer
 * think they were in the wrong place, and it left the heritage traveler with
 * no page that was theirs — the database was everywhere and had no door.
 *
 * NOTHING WAS MOVED, HIDDEN OR THINNED to make this page: every record, every
 * guide, every verification status and every Yiddish name is exactly where it
 * was. What changed since is the bar itself — Heritage is no longer a
 * category of its own there; the towns here are reached through the same
 * Destinations door as a beach holiday, and kevarim and cemeteries through
 * Kosher. This page still exists and is linked from the destinations
 * directory, for the visitor who wants the fuller heritage-specific view.
 */
export default async function HeritagePage() {
  const [cemeteries, guides] = await Promise.all([getPublicCemeteryList(), Promise.resolve(guidedDestinations())]);
  const page = await resolvePage("heritage");
  // Countries, by how much we hold for each. Built from the records rather
  // than typed out, so a country cannot appear here with nothing behind it.
  const byCountry = new Map<string, number>();
  for (const cemetery of cemeteries) byCountry.set(cemetery.country, (byCountry.get(cemetery.country) ?? 0) + 1);
  const countries = [...byCountry.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return (
    <main className="min-h-screen bg-[var(--cream)] text-[var(--ink)]">
      <StructuredData
        data={[
          collectionPage({
            name: "Jewish heritage travel — kevarim and batei hachaim",
            description: "Kevarim, batei hachaim and the towns they are in, across Europe and beyond.",
            path: "/heritage",
            count: cemeteries.length,
          }),
          breadcrumbs([
            { name: "Home", path: "/" },
            { name: "Heritage travel", path: "/heritage" },
          ]),
        ]}
      />
      <Navbar />

      {page?.edited ? (
        <PageBlocks blocks={page.blocks} />
      ) : (
        <section className="wg-page-hero border-b border-[var(--gold-light)] px-5 py-14 sm:px-8 sm:py-20">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-14 gap-y-8">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.26em] text-[var(--gold-ink)]">
                <span lang="he" dir="rtl">
                  {SUB_BRAND_HEBREW}
                </span>{" "}
                by White Glove
              </p>
              <h1 className="mt-5 max-w-3xl font-[family-name:var(--font-display)] text-[clamp(2.25rem,6vw,3.75rem)] leading-[1.08] text-[var(--navy)]">
                Kevarim, batei hachaim, and the towns they are in.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-600">
                Who is buried where, how to reach the kever, who holds the key, and what is around it.
              </p>
            </div>
            <SubBrandCrest className="hidden shrink-0 lg:block" />
          </div>
        </section>
      )}

      <section className="border-b border-[var(--gold-light)] bg-[var(--surface)] px-5 py-10 sm:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--gold-ink)]">
            Search for a kever, a town or a tzaddik
          </h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            In English or in <span lang="yi" dir="rtl">יידיש</span> — Lizhensk or <span lang="yi" dir="rtl">ליזענסק</span>, the
            Noam Elimelech or Reb Elimelech.
          </p>
          <div className="mt-4">
            <DestinationSearch
              compact
              placeholder="A kever, a town, or a tzaddik…"
              ariaLabel="Search the heritage directory for a kever, a town or a tzaddik"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-16">
        <SectionHeading
          eyebrow="What is in here"
          title="Four ways in"
          description="The same records, indexed by the question you are actually asking."
        />
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              href: "/tzaddikim",
              title: "Who is buried where",
              body: "By the name he is known by, because somebody looking for the Noam Elimelech is not looking under W.",
              cta: "Browse kevarim by name",
            },
            {
              href: "/cemeteries",
              title: "Batei hachaim",
              body: "Cemetery by cemetery: the known kevarim, the address, arrival notes, and the shomer where we hold one.",
              cta: "Browse the batei hachaim",
            },
            {
              href: "/stops",
              title: "Towns and guides",
              body: "The town around the kever — where to eat, where to daven, where to sleep, and how to get in.",
              cta: "Browse towns and guides",
            },
            {
              href: "/map",
              title: "On a map",
              body: "Every kever, place to stay and airport the site holds, in one view. Useful for working out an order.",
              cta: "Open the map",
            },
          ].map((card) => (
            <article key={card.href} className="wg-card flex h-full flex-col border border-[var(--gold-light)] bg-[var(--surface)] p-6">
              <h3 className="font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]">
                {card.title}
              </h3>
              <p className="mt-3 flex-1 leading-7 text-stone-600">{card.body}</p>
              <Link
                href={card.href}
                className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
              >
                {card.cta} →
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-[var(--gold-light)] bg-[var(--cream-deep)] px-5 py-14 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="Browse by country"
            title="By country"
            description="Open a country to see the batei hachaim there."
          />
          <ul className="mt-8 flex flex-wrap gap-2">
            {countries.map(([country]) => (
              <li key={country}>
                <Link
                  href={`/cemeteries?country=${encodeURIComponent(country)}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-[var(--gold-light)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--navy)] transition hover:border-[var(--gold)]"
                >
                  {country}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-16">
        <SectionHeading
          eyebrow="Complete guides"
          title="Town guides"
          description="A guide means the tzaddik, the kever's location, how to get in, and the practical side of the town around it — not a stub."
        />
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {guides.slice(0, 9).map((guide) => (
            <Link
              key={guide.slug}
              href={destinationHref(guide)}
              className="wg-card block border border-[var(--gold-light)] bg-[var(--surface)] p-6"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">{guide.country}</p>
              <p className="mt-2 font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]">
                {guide.city}{" "}
                <span lang="yi" dir="rtl" className="text-xl text-stone-500">
                  {guide.yiddishCity}
                </span>
              </p>
              {guide.guide.tzaddik && <p className="mt-2 text-sm font-semibold text-stone-600">{guide.guide.tzaddik}</p>}
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-stone-600">{guide.summary}</p>
              <span className="mt-4 inline-block text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4">
                Open the {guide.city} guide →
              </span>
            </Link>
          ))}
        </div>
        <p className="mt-8">
          <Link
            href="/stops"
            className="inline-flex min-h-11 items-center rounded-md border border-[var(--gold)] px-6 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white"
          >
            Browse every town and guide
          </Link>
        </p>
      </section>

      <section className="border-y border-[var(--gold-light)] bg-[var(--surface)] px-5 py-14 sm:px-8 sm:py-16">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading
              eyebrow="Build a route"
              title="Build a route"
              description="Save what you want to reach, and the planner works out the order, the driving time between each one, and where the border crossings fall."
            />
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/my-route"
                className={`inline-flex min-h-11 items-center ${ACTION_BUTTON_CLASS.primary}`}
              >
                Open My Route
              </Link>
              <Link
                href="/itinerary"
                className="inline-flex min-h-11 items-center rounded-md border border-[var(--gold)] px-6 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--cream-deep)]"
              >
                Plan it day by day
              </Link>
            </div>
          </div>

          <div>
            <SectionHeading
              eyebrow="The practical side"
              title="Food, davening and getting there"
              description="A heritage journey needs the same things a holiday does, usually in places with much less of them."
            />
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                ["Kosher food", "/kosher", "Live, anywhere — plus the places we have written up."],
                ["Where to stay", "/hotels", "Which quarter, and what is near it."],
                ["Drivers and contacts", "/directory", "People who know these roads."],
                ["Documents and borders", "/travel-guide", "Entry rules, and what catches people out."],
              ].map(([label, href, blurb]) => (
                <li key={href}>
                  <Link href={href} className="wg-card block h-full border border-[var(--gold-light)] bg-[#FAF8F3] p-4">
                    <span className="block font-semibold text-[var(--navy)]">{label}</span>
                    <span className="mt-1 block text-sm leading-6 text-stone-600">{blurb}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_.8fr] lg:items-start">
          <div>
            <SectionHeading
              eyebrow="How we verify"
              title="Before you travel"
              description="Every practical detail carries a label saying how far it has been checked."
            />
            <div className="mt-8 flex flex-wrap gap-3">
              <VerificationBadge descriptor={TRUST_LEVELS.verified} lastChecked={undefined} />
              <VerificationBadge descriptor={TRUST_LEVELS.reported} />
              <VerificationBadge descriptor={TRUST_LEVELS["being-checked"]} />
              <VerificationBadge descriptor={TRUST_LEVELS.reconfirm} />
            </div>
            <p className="mt-6">
              <Link
                href="/verification"
                className="inline-flex min-h-11 items-center rounded-md border border-[var(--gold)] px-6 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white"
              >
                Read the full method
              </Link>
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--gold)] bg-[#FAF8F3] p-7">
            <h2 className="font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]">
              Plan the journey
            </h2>
            <p className="mt-3 leading-7 text-stone-600">
              Say which kevarim you want to reach and when. The planner works out the order, the driving, where
              Shabbos falls, and who to speak to at each place.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/plan?kind=heritage"
                className={`inline-flex min-h-11 items-center ${ACTION_BUTTON_CLASS.primary}`}
              >
                Start a heritage journey
              </Link>
            </div>
            <p className="mt-6 border-t border-[var(--gold-light)] pt-5 text-sm leading-6 text-stone-600">
              A shomer&apos;s number changes, a gate gets locked, a kever is missing from a list.{" "}
              <Link
                href="/contact?reason=correction"
                className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
              >
                Tell us and we will check it
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <p className="sr-only">{SUB_BRAND_NAME}</p>
      <Footer />
    </main>
  );
}
