import Link from "next/link";
import CopyLinkButton from "@/components/CopyLinkButton";
import FlightItineraryBuilder from "@/components/FlightItineraryBuilder";
import FlightItineraryRemoveButton from "@/components/FlightItineraryRemoveButton";
import { CANONICAL_ORIGIN } from "@/lib/canonical-origin";
import { flightItineraryLabel, formatFlightDate, splitByDirection } from "@/lib/flight-itinerary";
import { flightItineraryStoreAvailable, listFlightItineraries } from "@/lib/flight-itinerary-store";

export const dynamic = "force-dynamic";

export default async function AdminFlightItinerariesPage() {
  const [itineraries, storeReady] = await Promise.all([
    listFlightItineraries(),
    Promise.resolve(flightItineraryStoreAvailable()),
  ]);

  return (
    <>
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--gold-ink)]">White Glove admin</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">Flight itineraries</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          Write up the flights you sell privately as one clean page to send a customer. Save it, then send the link or
          print it to PDF. Nothing here is public — each page opens only for someone who has its link.
        </p>
      </header>

      <section className="mt-10">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">New itinerary</h2>
        <FlightItineraryBuilder storeReady={storeReady} />
      </section>

      <section className="mt-14">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
          Saved {itineraries.length ? `(${itineraries.length})` : ""}
        </h2>
        {itineraries.length === 0 ? (
          <p className="mt-3 max-w-xl text-sm leading-6 text-stone-600">
            Nothing saved yet. The itineraries you build appear here, each with a link to send.
          </p>
        ) : (
          <ul className="mt-5 grid gap-4">
            {itineraries.map((itinerary) => {
              const url = `${CANONICAL_ORIGIN}/f/${itinerary.shareId}`;
              const { outbound, returning } = splitByDirection(itinerary.legs);
              const first = outbound[0] ?? itinerary.legs[0];
              const destination = outbound[outbound.length - 1] ?? first;
              return (
                <li
                  key={itinerary.id}
                  className="rounded-xl border border-[var(--gold-light)] bg-[#FAF8F3] p-5 shadow-[0_1px_2px_rgba(16, 47, 53,.04)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--navy)]">
                        {flightItineraryLabel(itinerary)}
                      </p>
                      <p className="mt-1 text-sm text-stone-600">
                        {itinerary.legs.length} {itinerary.legs.length === 1 ? "flight" : "flights"}
                        {returning.length ? " · round trip" : null}
                        {first ? (
                          <>
                            {" · "}
                            {first.from} → {destination.to}
                          </>
                        ) : null}
                        {first?.departDate ? <> · {formatFlightDate(first.departDate)}</> : null}
                      </p>
                    </div>
                    <FlightItineraryRemoveButton id={itinerary.id} />
                  </div>

                  <p className="mt-3 break-all rounded-md border border-[var(--gold-light)] bg-white px-3 py-2 text-xs text-stone-500">
                    {url}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Link
                      href={`/f/${itinerary.shareId}`}
                      target="_blank"
                      className="inline-flex min-h-11 items-center rounded-md border border-[var(--navy)] bg-[var(--navy)] px-4 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] hover:border-[var(--gold)]"
                    >
                      View / print
                    </Link>
                    <CopyLinkButton value={url} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
