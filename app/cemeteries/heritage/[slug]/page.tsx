import { notFound } from "next/navigation";
import Link from "next/link";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import SubBrandBanner from "@/components/SubBrand";
import DestinationActions from "@/components/DestinationActions";
import StructuredData from "@/components/StructuredData";
import { airportsFor } from "@/lib/destination-actions";
import { heritageCemeteryBySlug } from "@/lib/heritage-cemeteries";
import { placeDirectionsUrl } from "@/data/route-utils";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbs } from "@/lib/structured-data";

/**
 * A Nesiya Tova bais hachaim, as a page of its own.
 *
 * IT CARRIES OUR BUTTONS, NOT NESIYA TOVA'S DETAILS. These are locator entries
 * — where a Jewish cemetery is, and nothing invented. So this page gives the
 * traveler the same actions as any destination (navigate, add to route, add to
 * the itinerary, nearest airport) and forwards to Nesiya Tova for the live
 * details, access and contacts, rather than copying them. Nesiya Tova is the
 * source, and the source stays the one place those details live.
 *
 * RENDERED ON DEMAND. There are close to two thousand of these; prerendering
 * every one would bloat the build for pages most visitors never open. An empty
 * generateStaticParams with dynamic params on means each is built the first
 * time it is asked for and cached after — a real page per cemetery, without the
 * two-thousand-page build.
 *
 * NOINDEXED. A locator entry that forwards for its details is thin by design,
 * and two thousand thin pages are a doorway problem in a search index. The
 * indexed home for these is the locator inside /cemeteries; each page here
 * exists to be used, not found through Google.
 */
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cem = await heritageCemeteryBySlug(slug);
  if (!cem) {
    return pageMetadata({
      title: "Bais hachaim not found | White Glove Kosher Travel",
      description: "This heritage cemetery could not be found.",
      path: `/cemeteries/heritage/${slug}`,
      noIndex: true,
    });
  }
  return pageMetadata({
    title: `${cem.name} — ${cem.city}, ${cem.country} | White Glove`,
    description: `Where the bais hachaim in ${cem.city}, ${cem.country} is, with navigation and White Glove's trip tools. Access, hours and contacts are on Nesiya Tova.`,
    path: `/cemeteries/heritage/${cem.slug}`,
    noIndex: true,
  });
}

export default async function HeritageCemeteryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cem = await heritageCemeteryBySlug(slug);
  if (!cem) notFound();

  const mapUrl = placeDirectionsUrl(cem.address, cem.coordinates);

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <StructuredData
        data={breadcrumbs([
          { name: "Home", path: "/" },
          { name: "Cemeteries", path: "/cemeteries" },
          { name: cem.name, path: `/cemeteries/heritage/${cem.slug}` },
        ])}
      />
      <Navbar />
      <SubBrandBanner />

      <section className="wg-page-hero border-b border-[var(--gold-light)] px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-[var(--gold-ink)]">Bais hachaim · {cem.country}</p>
          <h1 className="mt-5 font-[family-name:var(--font-display)] text-[clamp(2.25rem,6vw,3.75rem)] leading-tight text-[var(--navy)]">{cem.name}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-stone-600">{cem.city} · {cem.country}</p>
          {cem.address ? <p className="mt-2 max-w-2xl leading-7 text-stone-500">{cem.address}</p> : null}

          <a
            href={mapUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-8 inline-block bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--gold)]"
          >
            Navigate to this bais hachaim →
          </a>

          <DestinationActions
            place={{
              id: `heritage-${cem.slug}`,
              name: cem.name,
              address: cem.address,
              coordinates: cem.coordinates,
              href: `/cemeteries/heritage/${cem.slug}`,
            }}
            airports={airportsFor(cem.country, cem.address, cem.coordinates)}
          />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="wg-card max-w-2xl border border-[var(--gold-light)] bg-[#FAF8F3] p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">Access &amp; details</p>
          <p className="mt-3 leading-7 text-stone-600">
            Access, hours and contacts for this bais hachaim are kept by Nesiya Tova. Many grounds are locked —
            confirm access before travelling.
          </p>
          <a
            href={cem.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-block bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--gold)]"
          >
            See the details on Nesiya Tova →
          </a>
        </div>

        <p className="mt-8 text-sm">
          <Link
            href="/cemeteries#heritage"
            className="inline-flex min-h-11 items-center font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
          >
            ← All heritage cemeteries
          </Link>
        </p>
      </section>

      <Footer />
    </main>
  );
}
