import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  accountCookieName,
  generateTranslation,
  getCurrentAccountData,
  getTranslation,
  getTripItinerary,
  readSessionEmail,
  resolveBusinessOwner,
} from "@/lib/account-store";
import { isStale } from "@/data/itinerary-translation";
import { itinerarySignature } from "@/data/itinerary-optimization";
import { rateLimit, tooManyMessage } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/secure-access";

export const dynamic = "force-dynamic";

/** Per account, per hour. Every POST here is a generate — it spends the
 *  deployment's shared paid AI quota — so it carries the same kind of fence
 *  app/api/account/smart-import/route.ts already keeps on its own model call. */
const AI_LIMIT = { limit: 20, windowSeconds: 3600 };

const MAX_LANGUAGE = 40;

/**
 * Multilingual itineraries — for anyone with a trip, not Business-gated,
 * the same reason /packing and /optimize aren't: a personal-travel feature,
 * not a client-facing one.
 */
async function ownerEmail() {
  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountData(cookie);
  const email = account?.email || readSessionEmail(cookie);
  return email ? resolveBusinessOwner(email) : null;
}

export async function GET(request: NextRequest) {
  const email = await ownerEmail();
  if (!email) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const wantedTrip = request.nextUrl.searchParams.get("trip");
  const language = request.nextUrl.searchParams.get("language")?.trim();
  const trip = await getTripItinerary(email, !wantedTrip || wantedTrip === "current" ? undefined : wantedTrip);
  if (!trip) return NextResponse.json({ error: "No trip to translate yet." }, { status: 404 });
  if (!language) return NextResponse.json({ tripId: trip.tripId, tripName: trip.tripName || trip.itinerary.title || "", translation: null, stale: false });

  const translation = await getTranslation(email, trip.tripId, language);
  const stale = translation ? isStale(translation, itinerarySignature(trip.itinerary)) : false;
  return NextResponse.json({ tripId: trip.tripId, tripName: trip.tripName || trip.itinerary.title || "", translation, stale });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  }
  const email = await ownerEmail();
  if (!email) return NextResponse.json({ error: "Please log in first." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { tripId?: string; language?: string } | null;
  const language = body?.language?.trim();
  if (!body?.tripId) return NextResponse.json({ error: "Which trip?" }, { status: 400 });
  if (!language || language.length > MAX_LANGUAGE) return NextResponse.json({ error: "Name a language." }, { status: 400 });

  const flood = await rateLimit(`translate-generate:${email}`, AI_LIMIT);
  if (!flood.ok) return NextResponse.json({ error: tooManyMessage(flood.retryAfter) }, { status: 429 });

  const trip = await getTripItinerary(email, body.tripId);
  if (!trip) return NextResponse.json({ error: "Trip not found." }, { status: 404 });

  const translation = await generateTranslation(email, trip.tripId, language);
  if (!translation) return NextResponse.json({ error: "Could not translate this itinerary right now. Try again shortly." }, { status: 503 });
  return NextResponse.json({ ok: true, translation });
}
