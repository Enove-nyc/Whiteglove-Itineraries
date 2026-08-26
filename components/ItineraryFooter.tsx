"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import GloveMark from "@/components/GloveMark";
import PromotionBanner from "@/components/PromotionBanner";
import type { Promotion } from "@/lib/admin-content";
import { brandForHost, configuredBrand } from "@/lib/site-brand-core";

// The band at the bottom of an itinerary.
//
// An itinerary gets shared, printed and forwarded — it travels further than any
// other page on the site — so it is the one place worth signing. Any live
// promotion targeted at "Bottom of the itinerary" sits above the signature;
// with none set, the signature stands on its own rather than leaving a gap.
//
// BRAND-AWARE, the same way Navbar is: this page (/itinerary, /i/[shareId]) is
// reachable on both domains and does not read the host server-side, so the
// brand is settled client-side after mount. This matters more than it looks —
// the second button used to be a bare /cemeteries link with no brand check at
// all, which is a guide-only path (middleware.ts): reached on the itineraries
// domain it silently bounced the visitor to the kosher domain, which breaks
// out of an installed itineraries app entirely (Android drops a Trusted Web
// Activity to an ordinary browser tab, address bar and all, the moment
// navigation leaves the verified domain).
export default function ItineraryFooter({ promotion }: { promotion: Promotion | null }) {
  // Start from the build's own brand so the itineraries deployment renders the
  // itineraries button at SSR — no pre-hydration flash of the /cemeteries link
  // (which would 307 to the kosher domain if tapped in that window). The effect
  // then corrects to the host, for a build that serves both.
  const [itineraries, setItineraries] = useState(() => configuredBrand() === "itineraries");
  useEffect(() => {
    if (typeof window !== "undefined") setItineraries(brandForHost(window.location.hostname) === "itineraries");
  }, []);

  return (
    <div className="mt-14">
      {promotion && (
        <div className="mb-8">
          <PromotionBanner promotion={promotion} placement="itinerary-footer" />
        </div>
      )}

      <div className="border-t border-[var(--gold-light)] pt-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--gold-ink)]">
              <GloveMark size="xs" />
              Planned with White Glove
            </p>
            <p className="mt-3 font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]">
              {itineraries ? "White Glove Itineraries" : "White Glove Kosher Travel"}
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--navy)]">
              {itineraries ? "whitegloveitineraries.com" : "whiteglovekoshertravel.com"}
            </p>
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-auto lg:shrink-0">
            <Link
              href="/plan"
              className="inline-flex min-h-11 w-full items-center justify-center whitespace-nowrap border border-[var(--navy)] bg-[var(--navy)] px-5 py-3 text-center text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)] lg:w-52"
            >
              Plan a trip
            </Link>
            {itineraries ? (
              <Link
                href="/app"
                className="inline-flex min-h-11 w-full items-center justify-center whitespace-nowrap border border-[var(--gold)] px-5 py-3 text-center text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white lg:w-52"
              >
                Open the app
              </Link>
            ) : (
              <Link
                href="/cemeteries"
                className="inline-flex min-h-11 w-full items-center justify-center whitespace-nowrap border border-[var(--gold)] px-5 py-3 text-center text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white lg:w-52"
              >
                Browse kevarim
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
