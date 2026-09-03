import Image from "next/image";
import Link from "next/link";
import PrintButton from "@/components/PrintButton";
import {
  connectionInfo,
  flightItineraryLabel,
  formatFlightDate,
  landsNextDay,
  splitByDirection,
  type ConnectionInfo,
  type FlightLeg,
} from "@/lib/flight-itinerary";
import { getFlightItineraryByShareId } from "@/lib/flight-itinerary-store";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";
import { BRAND_NAME, type SiteBrand } from "@/lib/site-brand-core";

// A flight itinerary is handed to a named customer, not found. Indexing it
// would put their name, dates and confirmation code into search results.
// Brand-aware: /f is one of the itineraries domain's own pages too.
export async function generateMetadata() {
  const itineraries = (await currentBrand()) === "itineraries";
  return pageMetadata({
    title: itineraries ? "Flight itinerary | White Glove Itineraries" : "Flight itinerary | White Glove Kosher Travel",
    description: "A flight itinerary prepared for you.",
    path: "/f",
    noIndex: true,
  });
}

export const dynamic = "force-dynamic";

function Wordmark({ siteBrand }: { siteBrand: SiteBrand }) {
  return (
    <div className="flex items-center gap-3">
      <Image src="/logo-hand-navy.png" alt="" width={355} height={460} className="h-11 w-auto object-contain" />
      <span className="flex flex-col leading-none">
        <span className="font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">White Glove</span>
        <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">
          {siteBrand === "itineraries" ? "Itineraries" : "Kosher Travel"}
        </span>
      </span>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">{label}</dt>
      <dd className="mt-0.5 text-sm text-[var(--navy)]">{value}</dd>
    </div>
  );
}

/** The line (or note) that sits above a flight that connects from the one before it. */
function ConnectionNote({ connection }: { connection: ConnectionInfo }) {
  const wait = connection.layover;

  if (connection.kind === "separate") {
    return (
      <div className="rounded-lg border border-[var(--gold-light)] border-l-4 border-l-amber-500 bg-[#FAF8F3] px-4 py-3 text-sm">
        <p className="font-semibold text-[var(--navy)]">
          Change at {connection.airport}
          {wait ? <span className="font-normal text-stone-600"> · {wait} between flights</span> : null}
        </p>
        <p className="mt-1 leading-6 text-stone-700">
          Separate tickets — collect your bags and check in again for the next flight, and leave enough time. A missed
          connection here is not covered by the airline.
        </p>
      </div>
    );
  }

  if (connection.kind === "airline") {
    return (
      <div className="px-1 text-sm">
        <p className="flex flex-wrap items-center gap-x-2 text-stone-600">
          <span aria-hidden="true" className="text-[var(--gold-ink)]">↳</span>
          <span className="font-semibold text-[var(--navy)]">Stopover in {connection.airport}</span>
          {wait ? <span>· {wait}</span> : null}
        </p>
        <p className="mt-0.5 pl-6 text-stone-500">
          One ticket — the airline checks your bags through and protects the connection.
        </p>
      </div>
    );
  }

  return (
    <p className="flex flex-wrap items-center gap-x-2 px-1 text-sm text-stone-600">
      <span aria-hidden="true" className="text-[var(--gold-ink)]">↳</span>
      <span className="font-semibold text-[var(--navy)]">Connect at {connection.airport}</span>
      {wait ? <span>· {wait} layover</span> : null}
    </p>
  );
}

/** One journey's legs, with a connection line drawn between legs that link up. */
function LegGroup({ legs }: { legs: FlightLeg[] }) {
  return (
    <div className="grid gap-4">
      {legs.map((leg, index) => {
        const prev = index > 0 ? legs[index - 1] : null;
        const connection = prev ? connectionInfo(prev, leg) : null;
        return (
          <div key={leg.id} className="wg-leg grid gap-4">
            {connection ? <ConnectionNote connection={connection} /> : null}
            <FlightCard leg={leg} index={index} />
          </div>
        );
      })}
    </div>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 mt-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--gold-ink)] first:mt-0">
      {children}
    </h2>
  );
}

function FlightCard({ leg, index }: { leg: FlightLeg; index: number }) {
  const carrier = [leg.airline, leg.flightNumber].filter(Boolean).join(" · ");
  return (
    <article className="wg-flight rounded-xl border border-[var(--gold-light)] bg-[#FAF8F3] p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">Flight {index + 1}</p>
        {carrier ? <p className="text-sm font-semibold text-[var(--navy)]">{carrier}</p> : null}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">Departs</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">{leg.from}</p>
          <p className="mt-1 text-sm text-stone-600">
            {[formatFlightDate(leg.departDate), leg.departTime].filter(Boolean).join(" · ")}
          </p>
        </div>

        <div aria-hidden="true" className="hidden text-center text-[var(--gold-ink)] sm:block">✈</div>

        <div className="sm:text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">Arrives</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">{leg.to}</p>
          <p className="mt-1 text-sm text-stone-600">
            {[formatFlightDate(leg.arriveDate), leg.arriveTime].filter(Boolean).join(" · ")}
            {landsNextDay(leg) ? <span className="font-semibold text-[var(--gold-ink)]"> (next day)</span> : null}
          </p>
        </div>
      </div>

      {(leg.cabin || leg.confirmation || leg.notes) && (
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-[var(--gold-light)] pt-3">
          {leg.cabin ? <Detail label="Cabin" value={leg.cabin} /> : null}
          {leg.confirmation ? <Detail label="Confirmation" value={leg.confirmation} /> : null}
          {leg.notes ? <Detail label="Note" value={leg.notes} /> : null}
        </dl>
      )}
    </article>
  );
}

export default async function FlightItineraryPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const itinerary = await getFlightItineraryByShareId(shareId);
  const siteBrand = await currentBrand();

  if (!itinerary) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--cream)] px-5 py-20 text-center">
        <div className="max-w-md">
          <Wordmark siteBrand={siteBrand} />
          <h1 className="mt-8 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">
            This itinerary isn&apos;t available
          </h1>
          <p className="mt-4 text-stone-600">
            The link may have been turned off, or replaced with a newer one. Ask the person who sent it for a fresh link.
          </p>
          <Link
            href="/"
            className="mt-8 inline-block border border-[var(--navy)] bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white"
          >
            Back to White Glove
          </Link>
        </div>
      </main>
    );
  }

  const { outbound, returning } = splitByDirection(itinerary.legs);
  const hasReturn = returning.length > 0;

  const details: Array<{ label: string; value: string }> = [
    itinerary.passengers ? { label: "Passenger(s)", value: itinerary.passengers } : null,
    itinerary.reference ? { label: "Booking reference", value: itinerary.reference } : null,
    { label: "Flights", value: String(itinerary.legs.length) },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <main className="wg-flight-doc min-h-screen bg-[var(--cream)] text-[var(--ink)]">
      {/* Print styles: drop the site's ground to white and hide the toolbar so
          what prints is the document alone. */}
      <style>{`
        @media print {
          .wg-flight-doc { background: #fff !important; }
          .wg-flight, .wg-leg { break-inside: avoid; }
          @page { margin: 16mm; }
        }
      `}</style>

      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="print:hidden mb-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--gold-light)] bg-[#FAF8F3] p-4">
          <p className="text-sm text-stone-600">
            Your flight itinerary is below. Use <strong>Print / Save as PDF</strong> to keep a copy.
          </p>
          <PrintButton />
        </div>

        <header className="border-b border-[var(--gold-light)] pb-6">
          <Wordmark siteBrand={siteBrand} />
          <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--gold-ink)]">Flight itinerary</p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--navy)] sm:text-4xl">
            {flightItineraryLabel(itinerary)}
          </h1>
          <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
            {details.map((item) => (
              <Detail key={item.label} label={item.label} value={item.value} />
            ))}
          </dl>
        </header>

        <section className="mt-8">
          {hasReturn ? (
            <>
              <GroupHeading>Outbound</GroupHeading>
              <LegGroup legs={outbound} />
              <div className="mt-6">
                <GroupHeading>Return</GroupHeading>
                <LegGroup legs={returning} />
              </div>
            </>
          ) : (
            <LegGroup legs={outbound} />
          )}
        </section>

        {itinerary.notes ? (
          <section className="mt-8 rounded-xl border border-[var(--gold-light)] bg-[#FAF8F3] p-5 sm:p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">Good to know</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-stone-700">{itinerary.notes}</p>
          </section>
        ) : null}

        <footer className="mt-10 border-t border-[var(--gold-light)] pt-5 text-xs text-stone-500">
          <p>
            Times are shown for each flight&rsquo;s own airport. Please check in online and confirm each flight with the
            airline before you travel.
          </p>
          <p className="mt-2">Prepared by {BRAND_NAME[siteBrand]}.</p>
        </footer>
      </div>
    </main>
  );
}
