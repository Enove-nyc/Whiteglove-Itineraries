import Link from "next/link";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import PageBlocks from "@/components/PageBlocks";
import { resolvePage } from "@/lib/pages";
import StructuredData from "@/components/StructuredData";
import { breadcrumbs } from "@/lib/structured-data";
import { pageMetadata } from "@/lib/seo";
import { AMAZON_DISCLOSURE, needsAmazonDisclosure } from "@/lib/travel-extras";
import { gearCtaFor, gearShownToVisitors, priceCheckedLabel } from "@/lib/travel-gear";
import { readGear } from "@/lib/travel-gear-store";

export const metadata = pageMetadata({
  title: "Travel gear for a kosher trip | White Glove Kosher Travel",
  description: "The things worth packing or picking up before you go — a travel blech, a plug adapter, and the rest of the shelf.",
  path: "/travel-gear",
});

const ALSO_BEFORE_YOU_GO = [
  { href: "/travel-guide", label: "Travel guide", detail: "Documents, advisories and how to pay." },
  { href: "/transfers", label: "Airport transfers", detail: "A car between the airport and where you stay." },
  { href: "/esim", label: "eSIMs and data", detail: "A data plan for the country you are going to." },
  { href: "/travel-insurance", label: "Travel insurance", detail: "Cover for the trip, from the partners we point to." },
] as const;

/**
 * The Amazon travel-gear shelf.
 *
 * ALWAYS A REAL PAGE. It used to 404 until something was on the shelf, and
 * it was left out of the menu and the footer, so the address itself could not
 * be found. An empty shop is still worse than a useful page — so with nothing
 * on the shelf this route shows the rest of "before you go" rather than an
 * empty grid or a note that something is unfinished.
 *
 * WHY THE PRICE READS "checked 3 days ago" INSTEAD OF JUST A NUMBER. A price
 * typed in by hand goes stale, and the site's own rule (docs/vacation-
 * expansion.md) is not to publish one without a way to tell how current it
 * is. priceCheckedLabel does that arithmetic once, here, so every card is
 * honest about its own age instead of asserting a number as current fact.
 */
export default async function TravelGearPage() {
  const shown = gearShownToVisitors(await readGear());
  const amazon = needsAmazonDisclosure(shown.map((item) => ({ id: item.id, name: item.name, blurb: item.description, url: item.url })));
  const page = await resolvePage("travel-gear");

  return (
    <main className="min-h-screen bg-[var(--cream)] text-[var(--ink)]">
      <StructuredData
        data={breadcrumbs([
          { name: "Home", path: "/" },
          { name: "Travel gear", path: "/travel-gear" },
        ])}
      />
      <Navbar />

      {page?.edited ? (
        <PageBlocks blocks={page.blocks} />
      ) : (
        <section className="border-b border-[var(--gold-light)] bg-white px-5 py-14 sm:px-8 sm:py-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">Before you go</p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl text-[var(--navy)] sm:text-5xl">Travel gear</h1>
            <p className="mt-4 text-base leading-7 text-stone-600">
              {shown.length > 0
                ? "The things worth packing or picking up before a trip — the same shelf we point to when someone asks what to bring."
                : "Packing, data abroad, transfers and insurance — the practical things to sort before you go."}
            </p>
            {amazon && <p className="mt-4 text-xs leading-5 text-stone-500">{AMAZON_DISCLOSURE}</p>}
          </div>
        </section>
      )}

      {shown.length > 0 && (
        <section className="px-5 py-14 sm:px-8 sm:py-16">
          <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((item) => {
              const priceLabel = priceCheckedLabel(item);
              return (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer sponsored"
                  className="flex flex-col overflow-hidden rounded-2xl border border-[var(--gold-light)] bg-white shadow-[0_8px_24px_rgba(16, 47, 53,.05)] transition hover:border-[var(--gold)] hover:shadow-[0_14px_34px_rgba(16, 47, 53,.09)]"
                >
                  {item.imageUrl.trim() && (
                    // A picture well of a fixed height, and the product sits
                    // INSIDE it whole.
                    //
                    // This used to be `aspect-square w-full object-cover`, which
                    // on a card 370px wide made a 370px-tall picture — the
                    // largest thing on the page by a distance, with the words
                    // pushed under the fold on a phone. And `cover` crops to
                    // fill, so a wide product (a blech, an adapter on its side)
                    // had its ends cut off to make a square nobody asked for.
                    //
                    // `contain` in a short well fixes both: the whole product is
                    // visible, every card is the same height whatever shape its
                    // picture is, and the name and price are what the eye lands
                    // on. The cream behind it is what an Amazon cut-out sits on
                    // — the white background of the file itself would otherwise
                    // disappear into the card and leave the product floating.
                    <div className="flex h-36 items-center justify-center border-b border-[var(--gold-light)] bg-[var(--cream)] p-4 sm:h-40">
                      {/* eslint-disable-next-line @next/next/no-img-element -- an
                          owner-pasted external URL, not one next/image can optimise
                          without an allow-listed host that changes with every item. */}
                      <img src={item.imageUrl} alt={item.name} className="max-h-full max-w-full object-contain" loading="lazy" />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col justify-between p-6">
                    <div>
                      <h2 className="font-[family-name:var(--font-display)] text-lg leading-tight text-[var(--navy)]">{item.name}</h2>
                      <p className="mt-2 text-sm leading-6 text-stone-600">{item.description}</p>
                    </div>
                    <div className="mt-5 flex items-center justify-between gap-3">
                      {priceLabel && <span className="text-sm font-semibold text-stone-700">{priceLabel}</span>}
                      <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">{gearCtaFor(item)}</span>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {shown.length === 0 && (
        <section className="px-5 py-14 sm:px-8 sm:py-16">
          <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
            {ALSO_BEFORE_YOU_GO.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-2xl border border-[var(--gold-light)] bg-white p-6 transition hover:border-[var(--gold)]"
              >
                <span className="font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">{item.label}</span>
                <span className="mt-2 block text-sm leading-6 text-stone-600">{item.detail}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Footer />
    </main>
  );
}
