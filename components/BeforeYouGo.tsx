import { beforeYouGo, checkedLine } from "@/lib/before-you-go";

/**
 * A compact card of official pages for where this trip goes.
 *
 * IT NEVER STATES A REQUIREMENT. Every line is a link to the government's own
 * page; White Glove does not summarise, interpret or verify what is on the
 * other side of it, and the card says whose words those are. Entry rules are
 * per-passport and change without notice — repeating them here, even
 * accurately, would be the site taking on a promise it cannot keep.
 *
 * IT DOES NOT APPEAR WHEN THERE IS NOTHING TO SAY. No known country, or no
 * official page on record for it, and this renders nothing at all rather than
 * a row of headings with no links under them.
 *
 * THE TONE IS DELIBERATELY FLAT. This sits on a screen somebody reads the week
 * before they travel. "Entry requirements · Safety advisory · Health guidance"
 * is what they came for; an alarm is not.
 */
export function BeforeYouGo({ countries, fetchedAt }: { countries: readonly string[]; fetchedAt?: string }) {
  const guidance = beforeYouGo(countries);
  if (guidance.length === 0) return null;

  return (
    <section aria-labelledby="before-you-go" className="border-t border-[var(--gold-light)] pt-6">
      <h2 id="before-you-go" className="text-lg font-bold text-[var(--navy)]">
        Before you go
      </h2>
      <p className="mt-1 text-xs leading-5 text-stone-500">{checkedLine(fetchedAt)}</p>

      <ul className="mt-4 flex flex-col gap-4">
        {guidance.map((entry) => (
          <li key={entry.country}>
            <p className="text-sm font-semibold text-[var(--navy)]">{entry.country}</p>
            <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-2">
              {entry.links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            {entry.note && <p className="mt-1 text-xs leading-5 text-stone-600">{entry.note}</p>}
          </li>
        ))}
      </ul>

      {/* Said plainly, because the alternative is a reader assuming the site
          checked. It did not, and cannot: these are per-passport rules on
          somebody else's page. */}
      <p className="mt-4 text-xs leading-5 text-stone-500">
        These are the official pages. White Glove does not check entry rules for you — they depend on your passport and
        change without notice.
      </p>
    </section>
  );
}
