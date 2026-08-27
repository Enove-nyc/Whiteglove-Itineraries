import Link from "next/link";
import SectionHeading from "@/components/SectionHeading";
import type { NearbyAirport } from "@/components/DestinationActions";
import type { Burial } from "@/data/cemeteries";
import type { NearbyKever } from "@/lib/nearby-kevarim";
import type { TownQuestion } from "@/lib/town-questions";

/**
 * The sections a town page is made of, written once.
 *
 * THE SITE HAS TWO KINDS OF TOWN PAGE and they had drifted apart. Fourteen
 * researched towns render from app/[city]/page.tsx and got these sections
 * first; a hundred and nine directory towns render from
 * app/heritage/towns/[place]/page.tsx and had none of them — not even the
 * names of the tzaddikim buried there, though the listing behind the page
 * holds every one. Somebody searching for a kever in Przysucha reached a page
 * that showed a cemetery card and did not say who was in it.
 *
 * Copying the markup across would have made a third list to keep in step, in a
 * codebase that has been bitten by exactly that (see lib/destination-sections
 * on the three copies of one section list). So the sections live here and both
 * pages call them.
 *
 * Every one renders nothing when it has nothing. That is what lets the same
 * component serve a page with a shomer's phone number and a page with two
 * lines of arrival notes, without either pretending to be the other.
 */

/**
 * Airports, with distances when they were measured.
 *
 * `measured` is not cosmetic: airportsFor() falls back to a country's main
 * airports when a town has no coordinates, and those come back with no
 * distance. Calling one of those "nearest" would be a guess printed as a fact,
 * so the heading changes instead.
 */
export function GettingThere({
  airports,
  country,
  measured,
  stayDestination,
}: {
  airports: NearbyAirport[];
  country: string;
  measured: boolean;
  stayDestination: string;
}) {
  if (!airports.length) return null;
  return (
    <section id="getting-there" className="border-y border-[var(--gold-light)] bg-[var(--cream-deep)] px-5 py-20 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="Getting there"
          title={measured ? "The nearest airports, and the drive at the end of each." : `Airports for ${country}.`}
          description={
            measured
              ? "Distances are straight-line, so the road is always longer. There is no flight to the town itself — however you arrive, the last leg is by car or driver."
              : `The main airports of ${country}. There is no flight to the town itself — however you arrive, the last leg is by car or driver.`
          }
        />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {airports.map((airport) => (
            <article key={airport.code} className="flex flex-col border border-[var(--gold-light)] bg-[#fcfaf6] p-7">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--gold-ink)]">{airport.code}</p>
              <h3 className="mt-3 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{airport.name}</h3>
              {airport.km && <p className="mt-3 text-sm font-semibold text-[var(--navy)]">{airport.km} away, straight line</p>}
              <div className="mt-auto pt-6">
                <a href={airport.directionsUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-[0.15em] text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4 transition hover:text-[var(--gold-ink)]">Driving route from {airport.code} →</a>
                <Link href={`/book?type=flights&to=${airport.code}`} className="mt-3 inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-[0.15em] text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4 transition hover:text-[var(--gold-ink)]">Search flights to {airport.code} →</Link>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-6">
          <Link href="/book?type=cars" className="inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-[0.15em] text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4">Search car hire →</Link>
          <Link href={`/book?type=hotels&destination=${stayDestination}`} className="inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-[0.15em] text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4">Search places to stay →</Link>
        </div>
        <p className="mt-6 text-sm leading-7 text-stone-500">Searches open with a booking partner, who takes the booking and the payment. Nothing is booked on this site.</p>
      </div>
    </section>
  );
}

/**
 * Who lies here, by name.
 *
 * The heading differs between the two pages because the fact differs: a
 * researched town names its tzaddik in a panel above, so this is everybody
 * ELSE; a directory town names nobody until this section does.
 */
export function WhoIsBuried({
  burials,
  title,
  description,
}: {
  burials: Burial[];
  title: string;
  description: string;
}) {
  if (!burials.length) return null;
  return (
    <section id="buried-here" className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
      <SectionHeading eyebrow="At the kever" title={title} description={description} />
      <div className="mt-12 grid gap-x-10 gap-y-6 md:grid-cols-2">
        {burials.map((burial) => (
          <article key={burial.name} className="border-t border-[var(--gold-light)] pt-5">
            <p dir="rtl" lang="yi" className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{burial.yiddishName}</p>
            <p className="mt-1 font-semibold text-[var(--navy)]">{burial.name}</p>
            {burial.knownAs && <p className="mt-1 text-sm text-stone-500">{burial.knownAs}</p>}
            {burial.seforim && <p dir="rtl" lang="yi" className="mt-2 text-sm text-stone-600">{burial.seforim}</p>}
            {burial.yahrzeit && <p dir="rtl" lang="yi" className="mt-1 text-sm text-stone-600">{burial.yahrzeit}</p>}
            {burial.note && <p className="mt-2 text-sm leading-6 text-stone-600">{burial.note}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

/** Other kevarim within reach, measured from this one. */
export function NearbyKevarim({ nearby }: { nearby: NearbyKever[] }) {
  if (!nearby.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
      <SectionHeading
        eyebrow="Nearby"
        title="What else is within reach."
        description="Few people travel this far for one kever. Distances are straight-line from this one, so allow more for the road."
      />
      <div className="mt-12 grid gap-5 md:grid-cols-2">
        {nearby.map((place) => (
          <Link key={place.slug} href={`/cemeteries/${place.slug}`} className="block border border-[var(--gold-light)] bg-[#fcfaf6] p-7 transition hover:border-[var(--gold)]">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--gold-ink)]">{place.km} km · {place.country}</p>
            <h3 className="mt-3 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{place.name}</h3>
          </Link>
        ))}
      </div>
      <Link href="/stops" className="mt-8 inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-[0.15em] text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4">Browse every kever on the site →</Link>
    </section>
  );
}

/**
 * The questions the page answers, in words.
 *
 * Rendered from the same strings handed to schema.org FAQPage, so what a
 * search engine reads and what a visitor reads cannot drift.
 */
export function TownQuestions({ questions }: { questions: TownQuestion[] }) {
  if (!questions.length) return null;
  return (
    <section className="border-t border-[var(--gold-light)] px-5 py-20 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeading eyebrow="Questions" title="What people ask before they go." />
        <div className="mt-12 max-w-4xl divide-y divide-[var(--gold-light)]">
          {questions.map((entry) => (
            <div key={entry.question} className="py-7 first:pt-0">
              <h3 className="font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]">{entry.question}</h3>
              <p className="mt-3 leading-8 text-stone-600">{entry.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
