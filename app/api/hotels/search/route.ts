import { NextResponse, type NextRequest } from "next/server";
import { duffelApiHeaders } from "@/lib/duffel-api";
import { duffelRefusal } from "@/lib/duffel-guard";
import {
  DUFFEL_STAYS_SEARCH_URL,
  explainDuffelStaysError,
  mapStayResults,
  parseCoordinateQuery,
  parseCoordinates,
  staysSearchBody,
  validateStaySearchInput,
  type StayPlaceMatch,
} from "@/lib/duffel-stays";
import { duffelBearer } from "@/lib/duffel-token";
import { findPlaces } from "@/lib/place-lookup";
import { redact } from "@/lib/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only Duffel Stays search.
 *
 * POST https://api.duffel.com/stays/search with Duffel-Version v2 and a Bearer
 * token. The public site never calls this: visitors use Stay22 on /book.
 * Taking the buttons off /book is not the same as closing the door — see
 * lib/duffel-guard.ts.
 */
export async function POST(request: NextRequest) {
  const refused = await duffelRefusal(request);
  if (refused) return NextResponse.json({ message: refused.error }, { status: refused.status });

  const access = duffelBearer();
  if (!access.ok) return NextResponse.json({ message: access.message, detail: access.detail }, { status: 503 });
  const token = access.token;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "The search could not be read." }, { status: 400 });
  }

  const dates = validateStaySearchInput({
    checkInDate: payload.checkInDate,
    checkOutDate: payload.checkOutDate,
    rooms: payload.rooms,
    guests: payload.guests,
  });
  if (!dates.ok) return NextResponse.json({ message: dates.message }, { status: 400 });

  const resolved = await resolveSearchPoint(payload);
  if (resolved.kind === "error") {
    return NextResponse.json({ message: resolved.message }, { status: 400 });
  }
  if (resolved.kind === "choices") {
    return NextResponse.json({
      message: "Several places match. Pick one, then search again.",
      places: resolved.places,
    });
  }

  const body = staysSearchBody({
    checkInDate: dates.checkInDate,
    checkOutDate: dates.checkOutDate,
    rooms: dates.rooms,
    guests: dates.guests,
    latitude: resolved.latitude,
    longitude: resolved.longitude,
  });

  let response: Response;
  try {
    response = await fetch(DUFFEL_STAYS_SEARCH_URL, {
      method: "POST",
      headers: duffelApiHeaders(token),
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : String(error));
    if (/aborted|timeout|timed out/i.test(message)) {
      return NextResponse.json(
        { message: "Duffel did not answer in time.", detail: "Stay searches can be slow. Try once more before assuming Stays is disabled." },
        { status: 504 },
      );
    }
    return NextResponse.json({ message: "The request to Duffel could not be completed.", detail: message }, { status: 502 });
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    const explained = explainDuffelStaysError(response.status, errorBody, response.headers.get("x-request-id"));
    return NextResponse.json(
      { message: redact(explained.message), detail: explained.detail ? redact(explained.detail) : undefined, hotels: [] },
      { status: 502 },
    );
  }

  const result = (await response.json()) as { data?: { results?: unknown } };
  const hotels = mapStayResults(result.data?.results);
  const where = resolved.label ? ` near ${resolved.label}` : "";
  return NextResponse.json({
    message: hotels.length
      ? `${hotels.length} stay${hotels.length === 1 ? "" : "s"} found${where}. The total is Duffel's cheapest rate for the stay.`
      : `Duffel returned no stays${where} for those dates.`,
    hotels,
    searched: { latitude: resolved.latitude, longitude: resolved.longitude, label: resolved.label },
  });
}

async function resolveSearchPoint(payload: Record<string, unknown>): Promise<
  | { kind: "point"; latitude: number; longitude: number; label: string }
  | { kind: "choices"; places: StayPlaceMatch[] }
  | { kind: "error"; message: string }
> {
  const given = parseCoordinates(payload.latitude, payload.longitude);
  if (given) {
    const label = String(payload.destination ?? payload.place ?? "").trim();
    return { kind: "point", ...given, label };
  }

  const typedCoords = parseCoordinateQuery(payload.destination ?? payload.place);
  if (typedCoords) {
    return { kind: "point", ...typedCoords, label: String(payload.destination ?? "").trim() };
  }

  const query = String(payload.destination ?? payload.place ?? "").trim();
  if (query.length < 3) {
    return { kind: "error", message: "Type a city or place (at least three letters), then search." };
  }

  const found = await findPlaces(query);
  if (found.length === 0) {
    return { kind: "error", message: "Nothing matched that city or place. Try the town name and the country." };
  }

  const places: StayPlaceMatch[] = found.map((place) => ({
    id: place.id,
    name: place.name,
    country: place.country,
    latitude: place.latitude,
    longitude: place.longitude,
  }));

  if (places.length > 1) {
    return { kind: "choices", places };
  }

  const [only] = places;
  return {
    kind: "point",
    latitude: only.latitude,
    longitude: only.longitude,
    label: only.country ? `${only.name}, ${only.country}` : only.name,
  };
}
