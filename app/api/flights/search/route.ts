import { explainDuffelError } from "@/lib/duffel-error";
import { NextResponse, type NextRequest } from "next/server";
import { duffelRefusal } from "@/lib/duffel-guard";
import { duffelBearer } from "@/lib/duffel-token";
import { flightDateProblem } from "@/lib/date-range";
import { resolveEndpoint } from "@/lib/flight-endpoint";
import { redact } from "@/lib/redact";

const duffelUrl = "https://api.duffel.com/air/offer_requests";

/**
 * What Duffel actually said, turned into something a person can act on.
 *
 * This used to be one line — "Duffel could not complete this flight search
 * right now" — with Duffel's own reply thrown away unread. Every failure looked
 * identical: a token for the wrong environment, an expired token, a route with
 * no test data behind it, a rate limit. There was no way to tell them apart
 * from the screen, and no way to fix any of them.
 *
 * Duffel's errors are well made: each carries a title, a message and a code.
 * They are passed through, redacted, with the fix added for the ones that are
 * easy to hit.
 */


type Carrier = { name?: string; iata_code?: string; logo_symbol_url?: string; logo_lockup_url?: string };
type RawSegment = { origin?: { iata_code?: string; name?: string; terminal?: string }; destination?: { iata_code?: string; name?: string; terminal?: string }; departing_at?: string; arriving_at?: string; duration?: string; marketing_carrier?: Carrier; operating_carrier?: Carrier; marketing_carrier_flight_number?: string; aircraft?: { name?: string; iata_code?: string } };

export async function POST(request: NextRequest) {
  // ADMIN ONLY. Taking the buttons off the public page is not the same as
  // closing the door: anybody who saw the site last month can still post here,
  // and this endpoint reaches the White Glove Duffel account. See
  // lib/duffel-guard.ts.
  const refused = duffelRefusal(request);
  if (refused) return NextResponse.json({ message: refused.error }, { status: refused.status });


  const access = duffelBearer();
  if (!access.ok) return NextResponse.json({ message: access.message, detail: access.detail }, { status: 503 });
  const token = access.token;

  const body = await request.json();
  const { origin: submittedOrigin, destination: submittedDestination, departureDate, returnDate, maxConnections, cabin, departureTime } = body;
  // A city with several airports resolves to its IATA metropolitan code, so
  // Duffel searches all of them in one request. See lib/flight-endpoint.ts.
  const originPlace = resolveEndpoint(submittedOrigin);
  const destinationPlace = resolveEndpoint(submittedDestination);
  const airportCode = (value: unknown) => resolveEndpoint(value)?.code ?? "";
  const origin = originPlace?.code ?? ""; const destination = destinationPlace?.code ?? "";
  const multiCitySlices = Array.isArray(body.slices) ? body.slices.map((slice: { origin?: unknown; destination?: unknown; departureDate?: unknown }) => ({ origin: airportCode(slice.origin), destination: airportCode(slice.destination), departure_date: String(slice.departureDate ?? "") })) : null;
  if (multiCitySlices && (multiCitySlices.length < 2 || !multiCitySlices.every((slice: { origin: string; destination: string; departure_date: string }) => /^[A-Z]{3}$/.test(slice.origin) && /^[A-Z]{3}$/.test(slice.destination) && /^\d{4}-\d{2}-\d{2}$/.test(slice.departure_date)))) return NextResponse.json({ message: "Complete each multi-city flight with airports from the list and a departure date." }, { status: 400 });
  if (!multiCitySlices && (![origin, destination].every((value) => /^[A-Z]{3}$/.test(value)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(departureDate)))) return NextResponse.json({ message: "Choose an airport from the list, or enter a valid three-letter airport code." }, { status: 400 });
  if (!multiCitySlices && returnDate && (!/^\d{4}-\d{2}-\d{2}$/.test(String(returnDate)) || returnDate <= departureDate)) return NextResponse.json({ message: "Your return date must be after your departure date." }, { status: 400 });
  const past = multiCitySlices
    ? multiCitySlices.map((slice: { departure_date: string }) => flightDateProblem(slice.departure_date)).find(Boolean)
    : flightDateProblem(String(departureDate), returnDate ? String(returnDate) : undefined);
  if (past) return NextResponse.json({ message: past }, { status: 400 });

  const slices = multiCitySlices ?? [{ origin, destination, departure_date: departureDate }, ...(returnDate ? [{ origin: destination, destination: origin, departure_date: returnDate }] : [])];
  const response = await fetch(duffelUrl, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "Duffel-Version": "v2", Authorization: `Bearer ${token}` }, body: JSON.stringify({ data: { slices, passengers: [{ type: "adult" }], cabin_class: ["economy", "premium_economy", "business", "first"].includes(cabin) ? cabin : "economy", max_connections: [0, 1, 2].includes(Number(maxConnections)) ? Number(maxConnections) : 2, return_offers: true } }), cache: "no-store" });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    const explained = explainDuffelError(response.status, errorBody);
    // Redacted on the way out: Duffel quotes the request back on some refusals,
    // and the access token must never reach a browser. See lib/redact.ts.
    return NextResponse.json(
      { message: redact(explained.message), detail: explained.detail ? redact(explained.detail) : undefined },
      { status: 502 },
    );
  }
  const result = await response.json();
  const flights = (result.data?.offers ?? []).map((offer: { id: string; total_amount: string; total_currency: string; expires_at?: string; slices?: Array<{ segments?: RawSegment[] }> }) => {
    const detailedSlices = (offer.slices ?? []).map((slice) => ({ segments: (slice.segments ?? []).map((segment) => {
      const carrier = segment.marketing_carrier ?? segment.operating_carrier;
      const carrierCode = carrier?.iata_code ?? "";
      const number = segment.marketing_carrier_flight_number ?? "";
      return { origin: segment.origin?.iata_code ?? origin, originName: segment.origin?.name, originTerminal: segment.origin?.terminal, destination: segment.destination?.iata_code ?? destination, destinationName: segment.destination?.name, destinationTerminal: segment.destination?.terminal, departingAt: segment.departing_at ?? "", arrivingAt: segment.arriving_at ?? "", duration: segment.duration, airline: carrier?.name ?? "Airline", airlineLogo: carrier?.logo_symbol_url ?? carrier?.logo_lockup_url, flightNumber: number ? `${carrierCode}${number}` : carrierCode, aircraft: segment.aircraft?.name ?? segment.aircraft?.iata_code, operatingCarrier: segment.operating_carrier?.name };
    }) }));
    const segments = detailedSlices.flatMap((slice) => slice.segments); const first = segments[0];
    const route = detailedSlices.map((slice) => `${slice.segments[0]?.origin ?? origin} → ${slice.segments.at(-1)?.destination ?? destination}`).join(" · ");
    return { id: offer.id, airline: first?.airline ?? "Airline", airlineLogo: first?.airlineLogo, route, departure: first?.departingAt ?? "", stops: detailedSlices.reduce((total, slice) => total + Math.max(0, slice.segments.length - 1), 0), totalAmount: offer.total_amount, totalCurrency: offer.total_currency, expiresAt: offer.expires_at, slices: detailedSlices };
  }).filter((flight: { departure: string }) => { const hour = new Date(flight.departure).getHours(); return departureTime === "morning" ? hour < 12 : departureTime === "afternoon" ? hour >= 12 && hour < 17 : departureTime === "evening" ? hour >= 17 : true; }).slice(0, 12);
  // Say what was actually searched. Somebody who typed "London" should be told
  // all five airports were covered — otherwise the natural assumption is that
  // one of them was picked for them, which is exactly what used to happen.
  const wholeCity = [originPlace, destinationPlace].filter((p) => p?.wholeCity);
  const searchedNote = wholeCity.length
    ? ` Searched every airport in ${wholeCity.map((p) => `${p!.label.replace(" — all airports", "")} (${p!.airports.join(", ")})`).join(" and ")}.`
    : "";
  return NextResponse.json({
    message: flights.length
      ? `${flights.length} flight options found.${searchedNote}`
      : `No flight options were returned for those dates.${searchedNote}`,
    flights,
    searched: { origin: originPlace?.label, destination: destinationPlace?.label },
  });
}
