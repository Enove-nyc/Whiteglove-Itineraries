import { ADVISORY_LEVELS, ADVISORY_SOURCE_URL, type Advisory } from "@/lib/travel-advisories";
import { summarise, toneFor, worthLeadingWith, type TripAdvisories as Roll } from "@/lib/trip-advisories";

/**
 * What is currently being said about the countries this trip goes to.
 *
 * A server component: everything is decided before it renders, and nothing
 * here fetches. The advisory already showed on a beis hachaim's own page one
 * country at a time; this is the same information arranged around the trip
 * rather than around the place.
 *
 * IT SAYS WHAT IT DOES NOT KNOW. A trip listing three countries as fine while
 * a fourth was never checked reads as "all clear", and here that is a sentence
 * about somebody's safety. So a stop with no country and a country the feed
 * does not carry are both counted and named, in the summary line and in the
 * list.
 *
 * NOTHING IS RE-WORDED. The level, its label and the summary are the State
 * Department's, with the date they published it and a link to the source. This
 * site does not have a view on whether somebody should go somewhere.
 */

const TONES: Record<string, { border: string; bg: string; text: string }> = {
  ok: { border: "border-emerald-600", bg: "bg-emerald-50", text: "text-emerald-900" },
  caution: { border: "border-amber-500", bg: "bg-amber-50", text: "text-amber-900" },
  warn: { border: "border-orange-600", bg: "bg-orange-50", text: "text-orange-900" },
  danger: { border: "border-red-600", bg: "bg-red-50", text: "text-red-900" },
  unknown: { border: "border-[var(--gold)]", bg: "bg-[#fcfaf6]", text: "text-[var(--navy)]" },
};

function when(advisory: Advisory | null): string {
  if (!advisory?.updated) return "";
  const parsed = Date.parse(advisory.updated);
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default function TripAdvisories({ roll, unavailable }: { roll: Roll; unavailable?: string }) {
  // Nothing to say at all — no stops with countries and none without — is not
  // a section worth drawing an empty box for.
  if (!roll.countries.length && !roll.stopsWithNoCountry) return null;

  const lead = TONES[toneFor(roll.highest)] ?? TONES.unknown;

  return (
    <section aria-labelledby="advisories-heading" className="mt-10">
      <h2 id="advisories-heading" className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">
        Where you are going
      </h2>

      {unavailable ? (
        // Said plainly rather than shown as an empty list, which would read as
        // "nothing to report" when it means "nobody could check".
        <p className="mt-3 max-w-2xl border-l-4 border-[var(--gold)] bg-[#fcfaf6] px-4 py-3 text-sm leading-6 text-[var(--navy)]">
          The State Department&rsquo;s advisories could not be read just now, so this is not saying anything about your
          countries either way.{" "}
          <a href={ADVISORY_SOURCE_URL} rel="noreferrer noopener" target="_blank" className="font-semibold underline decoration-[var(--gold)] underline-offset-4">
            Check them yourself
          </a>
          .
        </p>
      ) : (
        <>
          <p
            className={`mt-3 max-w-2xl border-l-4 px-4 py-3 text-sm leading-6 ${lead.border} ${lead.bg} ${lead.text} ${
              worthLeadingWith(roll.highest) ? "font-semibold" : ""
            }`}
          >
            {summarise(roll)}
          </p>

          <ul className="mt-5 divide-y divide-[var(--gold-light)] border-t border-[var(--gold-light)]">
            {roll.countries.map((entry) => {
              const tone = TONES[toneFor(entry.advisory?.level ?? null)] ?? TONES.unknown;
              const date = when(entry.advisory);
              return (
                <li key={entry.country} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <span className="font-semibold text-[var(--navy)]">
                      {entry.country}{" "}
                      <span className="text-sm font-normal text-stone-500">
                        · {entry.stops} {entry.stops === 1 ? "stop" : "stops"}
                      </span>
                    </span>
                    <span className={`px-2 py-1 text-xs font-bold ${tone.bg} ${tone.text}`}>
                      {entry.advisory?.level
                        ? `Level ${entry.advisory.level}: ${ADVISORY_LEVELS[entry.advisory.level]?.label ?? entry.advisory.levelLabel}`
                        : "No advisory published"}
                    </span>
                  </div>
                  {entry.advisory?.summary && (
                    <p className="mt-1 text-sm leading-6 text-stone-600">{entry.advisory.summary}</p>
                  )}
                  {(date || entry.advisory?.link) && (
                    <p className="mt-1 text-xs text-stone-500">
                      {date ? `Published ${date}` : ""}
                      {date && entry.advisory?.link ? " · " : ""}
                      {entry.advisory?.link && (
                        <a href={entry.advisory.link} rel="noreferrer noopener" target="_blank" className="underline decoration-[var(--gold)] underline-offset-2">
                          Read it in full
                        </a>
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="mt-3 text-xs leading-5 text-stone-500">
            From the{" "}
            <a href={ADVISORY_SOURCE_URL} rel="noreferrer noopener" target="_blank" className="underline decoration-[var(--gold)] underline-offset-2">
              US State Department
            </a>
            , whose words these are. White Glove does not add to them or take anything away.
          </p>
        </>
      )}
    </section>
  );
}
