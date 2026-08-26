import { NextResponse } from "next/server";
import { rateLimit, requesterKey, tooManyMessage } from "@/lib/rate-limit";
import { parseLocal, type LookupFlight } from "@/lib/flight-lookup";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// Look up a real flight by its number + date so the itinerary planner can
// auto-fill the airline, airports, and times. We never fabricate flight
// details: without a configured provider, or when the flight is not found,
// we say so and return nothing to fill.
//
// One provider: AeroDataBox via RapidAPI (AERODATABOX_API_KEY).
//
// Amadeus was supported here too, and picked FIRST whenever its keys were
// present — not as a fallback, despite being described as one. So adding
// Amadeus test keys, which carry a thin schedule, silently replaced a working
// lookup with a worse one and never fell back. Two providers where only one
// can ever run is not redundancy, it is a trap for whoever adds the second
// key. Removed rather than made into a real fallback: nothing was using it.

type LookupResult = { flight?: LookupFlight; reason?: string; moreResults?: number };

type AdbAirport = { iata?: string; icao?: string; name?: string; shortName?: string };
type AdbEndpoint = { airport?: AdbAirport; scheduledTime?: { local?: string } };
type AdbFlight = { number?: string; airline?: { name?: string }; departure?: AdbEndpoint; arrival?: AdbEndpoint };

async function lookupAeroDataBox(flightNumber: string, date: string): Promise<LookupResult> {
  const key = process.env.AERODATABOX_API_KEY?.trim();
  if (!key) return { reason: "unconfigured" };
  const res = await fetch(
    `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(flightNumber)}/${encodeURIComponent(date)}?withAircraftImage=false&withLocation=false`,
    { headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com" }, cache: "no-store" },
  );
  if (res.status === 204 || res.status === 404) return { reason: `No flight ${flightNumber} found on ${date}. Check the number and date.` };
  if (res.status === 401 || res.status === 403) return { reason: "The flight-lookup key was rejected. Check AERODATABOX_API_KEY." };
  if (res.status === 429) return { reason: "Flight lookups are rate-limited right now — try again shortly, or enter the details by hand." };
  if (!res.ok) return { reason: `Flight lookup returned HTTP ${res.status}.` };

  const raw = (await res.json().catch(() => null)) as AdbFlight[] | AdbFlight | null;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const chosen = list.find((f) => parseLocal(f.departure?.scheduledTime?.local)?.date === date) ?? list[0];
  if (!chosen) return { reason: `No flight ${flightNumber} found on ${date}. Check the number and date.` };
  const dep = parseLocal(chosen.departure?.scheduledTime?.local);
  const arr = parseLocal(chosen.arrival?.scheduledTime?.local);
  const label = (a?: AdbAirport) => a?.iata || a?.icao || a?.shortName || a?.name || "";
  return {
    flight: {
      airline: chosen.airline?.name || "",
      flightNo: (chosen.number || flightNumber).replace(/\s+/g, ""),
      from: label(chosen.departure?.airport),
      to: label(chosen.arrival?.airport),
      date: dep?.date || date,
      departTime: dep?.time || "",
      arriveTime: arr?.time || "",
      arriveDate: arr && dep && arr.date > dep.date ? arr.date : "",
      // This endpoint reports one leg at a time, so a connection comes back as
      // its own flight number. Nothing to carry through.
      stops: [],
    },
    moreResults: Math.max(0, list.length - 1),
  };
}

export async function POST(request: Request) {
  if (!process.env.AERODATABOX_API_KEY?.trim()) {
    return NextResponse.json({
      available: false,
      reason: "Flight lookup is off. Add an AERODATABOX_API_KEY in the site settings to enable it.",
    });
  }

  const body = (await request.json().catch(() => null)) as { flightNumber?: string; date?: string } | null;
  const flightNumber = String(body?.flightNumber || "").toUpperCase().replace(/\s+/g, "");
  const date = String(body?.date || "").trim();
  if (!/^[A-Z0-9]{3,8}$/.test(flightNumber)) {
    return NextResponse.json({ available: false, reason: "Enter a flight number like LY1 or BA2490." });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ available: false, reason: "Choose the flight date first." });
  }

  // Each valid lookup is a billable call to RapidAPI, and the route is public
  // with no auth, so cap it by who is asking — generously, since one itinerary
  // can hold several flights, but not unbounded.
  const gate = await rateLimit(`flight-lookup:${requesterKey(request.headers)}`, { limit: 30, windowSeconds: 60 * 60 });
  if (!gate.ok) return NextResponse.json({ available: false, reason: tooManyMessage(gate.retryAfter) }, { status: 429, headers: { "Retry-After": String(gate.retryAfter) } });

  try {
    const result = await lookupAeroDataBox(flightNumber, date);
    if (result.flight) {
      return NextResponse.json({ available: true, flight: result.flight, moreResults: result.moreResults ?? 0 });
    }
    return NextResponse.json({ available: false, reason: result.reason && result.reason !== "unconfigured" ? result.reason : `No flight ${flightNumber} found on ${date}.` });
  } catch {
    return NextResponse.json({ available: false, reason: "Could not reach the flight-lookup service." });
  }
}
