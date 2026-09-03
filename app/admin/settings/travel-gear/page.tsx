import Link from "next/link";
import { CANONICAL_ORIGIN, siteOrigin } from "@/lib/seo";
import TravelGearForm from "@/components/TravelGearForm";
import { gearStoreAvailable, readGearFresh } from "@/lib/travel-gear-store";

export const dynamic = "force-dynamic";

/**
 * The Amazon travel-gear shelf, admin side.
 *
 * WHY THERE IS NO "PASTE A LINK AND WE'LL FILL IT IN" HERE. Amazon's Product
 * Advertising API is the only sanctioned way to pull a picture, title and
 * price from a link, and Amazon does not grant — or keep — API access for an
 * Associates account without 3 qualifying sales in its first 180 days. A new
 * account has none yet, so that door is not open today regardless of how
 * this screen is built. Scraping the product page directly is against the
 * Associates Operating Agreement and risks the account this whole shelf
 * depends on, so this deliberately does not do that either. See
 * lib/travel-gear.ts for the same note kept next to the code it explains.
 */
export default async function TravelGearSettings() {
  const current = await readGearFresh();
  const storeReady = gearStoreAvailable();

  return (
    <>
      <header>
        <Link href="/admin/settings" className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">
          ← Settings
        </Link>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Travel gear</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
          A travel blech, a hotplate, a plug adapter — anything worth having in a suitcase, with your Amazon (or other)
          affiliate link. This page is separate from the shorter list of extras under Earnings
          (eSIM, insurance, transfers) — this one is its own page, <code>/travel-gear</code>, built to hold a whole shelf
          rather than three cards under a search.
        </p>
        <p className="mt-3">
          <a
            href={`${siteOrigin()?.origin || CANONICAL_ORIGIN}/travel-gear`}
            className="text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4"
          >
            View the public page
          </a>
        </p>
        <p className="mt-3 max-w-2xl rounded-md border border-[var(--gold-light)] bg-[#FAF8F3] p-3 text-xs leading-5 text-stone-600">
          The picture, description and price are typed in by hand for now — Amazon only hands those over automatically
          through its Product Advertising API, and it does not grant that until an Associates account has 3 qualifying
          sales. Once yours does, this can switch over to pulling them from the link itself.
        </p>
        {!storeReady && (
          <p className="mt-3 text-sm font-semibold text-red-700">
            The private store is not connected, so nothing here can be saved yet.
          </p>
        )}
      </header>

      <TravelGearForm current={current} storeReady={storeReady} />
    </>
  );
}
