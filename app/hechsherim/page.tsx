import Link from "next/link";
import Footer from "@/components/Footer";
import HechsherBadge from "@/components/HechsherBadge";
import Navbar from "@/components/Navbar";
import PageBlocks from "@/components/PageBlocks";
import SectionHeading from "@/components/SectionHeading";
import StructuredData from "@/components/StructuredData";
import { allHechsherim } from "@/data/hechsherim";
import { listAgencies } from "@/lib/hechsher-store";
import { resolvePage } from "@/lib/pages";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbs } from "@/lib/structured-data";

// Not force-dynamic. listAgencies (lib/hechsher-store.ts) is a tagged
// unstable_cache now, busted by saveAgency/deleteAgency the moment either
// actually writes, rather than this page reading Redis on every visit.
export const metadata = pageMetadata({
  title: "Kosher certification marks and the agencies behind them | White Glove Kosher Travel",
  description:
    "The certifying bodies this site knows by name, with the mark each one uses, where it certifies, and a link to the agency itself.",
  path: "/hechsherim",
});

/**
 * The marks, and who is behind each one.
 *
 * WHY THIS PAGE EXISTS. The site holds a list of certifying bodies and used it
 * in exactly two places: to draw a small circle on a listing, and to print its
 * own length in a sentence on /kosher-travel. A traveller who saw an
 * unfamiliar mark on a restaurant had nowhere on the site to find out whose it
 * was. That is a question the site can simply answer, so it does.
 *
 * WHAT IT DOES NOT DO, and the line is the same one data/hechsherim.ts draws
 * in its own first paragraph: it says who exists. It never says who certifies
 * what, never ranks one body against another, and never tells anybody which
 * hechsherim to rely on. That last one is not modesty — it is a question for
 * somebody's rov, and a travel website answering it would be overstepping in a
 * way no amount of research could fix.
 *
 * THE LINK IS THE POINT. Where the agency's own address is known it is here,
 * because a kashrus question belongs to the body that gave the hechsher. Where
 * it is not known there is no link rather than a guessed one — a wrong address
 * on a kashrus page is worse than an absent one.
 */
export default async function HechsherimPage() {
  const agencies = allHechsherim(await listAgencies());
  const page = await resolvePage("hechsherim");

  // Grouped by where each one certifies, in the order the list is written, so
  // somebody looking at a package in Antwerp is not reading down the American
  // agencies first. `local-rov` is not an agency and sits on its own.
  const groups = new Map<string, typeof agencies>();
  for (const agency of agencies) {
    if (agency.id === "local-rov") continue;
    const list = groups.get(agency.region) ?? [];
    list.push(agency);
    groups.set(agency.region, list);
  }

  return (
    <main className="min-h-screen bg-[var(--cream)] text-[var(--ink)]">
      <StructuredData
        data={breadcrumbs([
          { name: "Home", path: "/" },
          { name: "Kosher travel", path: "/kosher-travel" },
          { name: "Certification marks", path: "/hechsherim" },
        ])}
      />
      <Navbar />

      {page?.edited ? (
        <PageBlocks blocks={page.blocks} />
      ) : (
      <section className="wg-page-hero border-b border-[var(--gold-light)] px-5 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-[var(--gold-ink)]">Kosher certification</p>
          <h1 className="mt-5 max-w-4xl font-[family-name:var(--font-display)] text-[clamp(2.25rem,6vw,3.75rem)] leading-[1.08] text-[var(--navy)]">
            The marks, and who is behind them
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-stone-600">
            This page does not say who certifies what and does not rank them. Which to rely on is a question for your rov.
          </p>
        </div>
      </section>
      )}

      <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="space-y-12">
          {[...groups].map(([region, list]) => (
            <div key={region}>
              <h2 className="font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]">
                {region}
              </h2>
              <ul className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {list.map((agency) => (
                  <li
                    key={agency.id}
                    className="flex items-start gap-4 rounded-xl border border-[var(--gold-light)] bg-[var(--surface)] p-5"
                  >
                    <HechsherBadge
                      status={{ state: "certified", hechsherId: agency.id }}
                      agencies={agencies}
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="font-semibold leading-6 text-[var(--navy)]">{agency.name}</p>
                      {agency.website ? (
                        <a
                          href={agency.website}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 flex min-h-11 max-w-full items-center gap-1 text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
                        >
                          <span className="min-w-0 break-all">{agency.website.replace(/^https?:\/\/(www\.)?/, "")}</span>
                          <span aria-hidden="true">↗</span>
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 rounded-2xl border border-[var(--gold-light)] bg-[#fcfaf6] p-6 sm:p-8">
          <SectionHeading eyebrow="On a listing" title="What the circle beside a place means" />
          <p className="mt-5 max-w-3xl leading-7 text-stone-600">
            Gold means the hechsher was confirmed against a teudah, the rov, or the agency&rsquo;s list; grey means it
            wasn&rsquo;t. Supervision changes hands — always ask to see the current teudah before you eat.
          </p>
          <p className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
            <Link
              href="/kosher"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
            >
              Find kosher food →
            </Link>
            <Link
              href="/contact?reason=correction"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
            >
              Tell us about an agency we are missing →
            </Link>
          </p>
        </div>
      </section>

      <Footer />
    </main>
  );
}
