import Image from "next/image";
import Link from "next/link";

// שתוליכנו לשלום by White Glove — the Jewish-heritage side of the site.
//
// It is a section of White Glove Kosher Travel, not a separate company, so the
// mark is built from the same gloved hand and compass as the parent logo and
// always carries "by White Glove Kosher Travel" underneath. A traveler moving
// between a kever page and the booking pages should never wonder whether they
// have left the site.

/** The phrase itself, for headings and prose. */
export const SUB_BRAND_HEBREW = "שתוליכנו לשלום";
export const SUB_BRAND_NAME = "שתוליכנו לשלום by White Glove";

/**
 * A slim band that sits above a page's hero and badges it as part of the
 * section. Use on every Jewish-heritage page in Europe and Asia.
 */
export default function SubBrandBanner({ className = "" }: { className?: string }) {
  return (
    <div className={`border-b border-[var(--gold-light)] bg-[#FAF8F3] px-5 py-4 sm:px-8 ${className}`}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2">
        <Link href="/stops" className="shrink-0" aria-label={`${SUB_BRAND_NAME} — Jewish heritage journeys`}>
          <Image
            src="/shetolichenu-logo.png"
            alt={SUB_BRAND_NAME}
            width={937}
            height={308}
            priority={false}
            className="h-11 w-auto sm:h-14"
          />
        </Link>
        <p className="min-w-0 text-xs leading-5 text-stone-500">
          Kevarim and nesios across Europe and Asia — a section of{" "}
          <Link href="/" className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">
            White Glove Kosher Travel
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

/**
 * The stacked lockup, for the top of the section's own landing pages where the
 * mark should carry the page rather than label it.
 */
export function SubBrandCrest({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-block ${className}`}>
      {/* THE ARTWORK HAD THE OLD COMPANY NAME DRAWN INTO IT. Beneath the arch
          it read "BY WHITE GLOVE ITINERARIES" — the name this business does
          not trade under any more — on /heritage, /cemeteries, /stops,
          /tzaddikim, every kever page and every town guide. Roughly five
          hundred and forty pages, and invisible to any search of the code,
          because it was pixels.

          The file is cut at 690px, inside the 52-row blank gap under the mark,
          so the arch, the hand and the Hebrew are untouched and the two lines
          below them are gone. The line is set in HTML now, which is why this
          will never happen twice: the name is a string. */}
      <Image
        src="/shetolichenu-logo-stacked.png"
        alt={SUB_BRAND_NAME}
        width={583}
        height={690}
        className="h-auto w-40 sm:w-52"
      />
      <span className="mt-2 block text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--gold-ink)] sm:text-[10px]">
        by White Glove Kosher Travel
      </span>
    </span>
  );
}
