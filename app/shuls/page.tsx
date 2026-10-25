import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import PageBlocks from "@/components/PageBlocks";
import Breadcrumbs from "@/components/Breadcrumbs";
import StructuredData from "@/components/StructuredData";
import { IconLink } from "@/components/icons/IconAction";
import { listPublishedShuls } from "@/lib/shuls";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbs } from "@/lib/structured-data";
import { resolvePage } from "@/lib/pages";
import { placeMapUrl } from "@/data/route-utils";

export const metadata = pageMetadata({
  title: "Shuls — White Glove Kosher Travel",
  description: "Shul and minyan listings, with a source behind each one. Confirm times locally before you go.",
  path: "/shuls",
});

export default async function ShulsPage() {
  const listings = await listPublishedShuls();
  const byCountry = new Map<string, typeof listings>();
  for (const listing of listings) {
    const list = byCountry.get(listing.country) ?? [];
    list.push(listing);
    byCountry.set(listing.country, list);
  }
  const page = await resolvePage("shuls");

  return (
    <main className="min-h-screen bg-[var(--cream)] text-[var(--ink)]">
      <StructuredData
        data={breadcrumbs([
          { name: "Home", path: "/" },
          { name: "Kosher", path: "/kosher-travel" },
          { name: "Shuls", path: "/shuls" },
        ])}
      />
      <Navbar />

      {page?.edited ? (
        <PageBlocks blocks={page.blocks} />
      ) : (
        <section className="border-b border-[var(--gold-light)] px-5 py-10 sm:px-8">
          <div className="mx-auto max-w-7xl">
            <Breadcrumbs trail={[{ name: "Kosher", href: "/kosher-travel" }, { name: "Shuls" }]} />
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.26em] text-[var(--gold-ink)]">Kosher travel</p>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-[clamp(2rem,5vw,3rem)] leading-[1.08] text-[var(--navy)]">Shuls</h1>
            <p className="mt-3 max-w-2xl leading-7 text-stone-600">
              {listings.length > 0
                ? "Shul and minyan listings, each with a source behind it — confirm times locally before you go."
                : "Shul listings appear here once they have a source and are ready to publish."}
            </p>
          </div>
        </section>
      )}

      {listings.length === 0 ? (
        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <p className="max-w-2xl leading-7 text-stone-600">Nothing published yet.</p>
        </section>
      ) : (
        <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
          <div className="space-y-12">
            {[...byCountry].map(([country, list]) => (
              <div key={country}>
                <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{country}</h2>
                <ul className="mt-5 grid gap-4 md:grid-cols-2">
                  {list.map((listing) => (
                    <li id={listing.id} key={listing.id} className="rounded-xl border border-[var(--gold-light)] bg-[var(--surface)] p-5">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">{listing.city}</p>
                      <h3 className="mt-1 font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--navy)]">{listing.name}</h3>
                      {listing.address && <p className="mt-2 text-sm leading-6 text-stone-600">{listing.address}</p>}
                      {listing.hours && <p className="mt-2 text-sm leading-6 text-stone-600">{listing.hours}</p>}
                      {listing.notes && <p className="mt-2 text-sm leading-6 text-stone-600">{listing.notes}</p>}
                      <div className="mt-4 flex flex-wrap items-center gap-1">
                        {listing.phone && <IconLink icon="phone" label="Call" href={`tel:${listing.phone.replace(/[^+\d]/g, "")}`} />}
                        {listing.website && <IconLink icon="website" label="Website" href={listing.website} />}
                        {listing.address && <IconLink icon="map-pin" label="Directions" href={placeMapUrl(listing.address, listing.coordinates)} />}
                        {/* Only shown when the link actually goes somewhere else —
                            a real destination page. A listing with no destination
                            of its own now links to its own row here, and a
                            "Destination" button that only scrolled to the card it
                            is already on would be pointless. */}
                        {listing.href !== `/shuls#${listing.id}` && (
                          <a
                            href={listing.href}
                            className="ml-2 text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
                          >
                            Destination
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <Footer />
    </main>
  );
}
