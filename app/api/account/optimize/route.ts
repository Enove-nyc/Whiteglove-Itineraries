import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  accountCookieName,
  currentOptimizationSignature,
  generateOptimization,
  getCurrentAccountData,
  getOptimization,
  getTripItinerary,
  readSessionEmail,
  resolveBusinessOwner,
  setOptimizationDismissed,
} from "@/lib/account-store";
import { isStale } from "@/data/itinerary-optimization";
import { rateLimit, tooManyMessage } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/secure-access";

export const dynamic = "force-dynamic";

/** Per account, per hour. A generate call spends the deployment's shared
 *  paid AI quota, so it carries the same kind of fence
 *  app/api/account/smart-import/route.ts already keeps on its own model call —
 *  without one, ordinary signed-in accounts can drain the quota the assistant
 *  and Smart Import also draw on. Generous: a planner regenerating a list a
 *  few times while tweaking a trip is nowhere near this. */
const AI_LIMIT = { limit: 20, windowSeconds: 3600 };

/**
 * AI pacing/flow suggestions for a trip's itinerary — for anyone with a
 * trip, not Business-gated, the same reason app/api/account/packing/route.ts
 * isn't: this is a personal-travel feature, not a client-facing one.
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
  const wanted = request.nextUrl.searchParams.get("trip");
  const trip = await getTripItinerary(email, !wanted || wanted === "current" ? undefined : wanted);
  if (!trip) return NextResponse.json({ error: "No trip to review yet." }, { status: 404 });

  const result = await getOptimization(email, trip.tripId);
  const stale = result ? isStale(result, currentOptimizationSignature(trip.itinerary)) : false;
  return NextResponse.json({ tripId: trip.tripId, tripName: trip.tripName || trip.itinerary.title || "", result, stale });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  }
  const email = await ownerEmail();
  if (!email) return NextResponse.json({ error: "Please log in first." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { action?: string; tripId?: string; suggestionId?: string; dismissed?: boolean }
    | null;
  if (!body?.tripId) return NextResponse.json({ error: "Which trip?" }, { status: 400 });
  const trip = await getTripItinerary(email, body.tripId);
  if (!trip) return NextResponse.json({ error: "Trip not found." }, { status: 404 });

  if (body.action === "dismiss") {
    if (!body.suggestionId || typeof body.dismissed !== "boolean") {
      return NextResponse.json({ error: "Say which suggestion, and whether to dismiss it." }, { status: 400 });
    }
    const ok = await setOptimizationDismissed(email, trip.tripId, body.suggestionId, body.dismissed);
    if (!ok) return NextResponse.json({ error: "Could not save that." }, { status: 503 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "generate") {
    const flood = await rateLimit(`optimize-generate:${email}`, AI_LIMIT);
    if (!flood.ok) return NextResponse.json({ error: tooManyMessage(flood.retryAfter) }, { status: 429 });
    const result = await generateOptimization(email, trip.tripId);
    if (!result) return NextResponse.json({ error: "Could not review this itinerary right now. Try again shortly." }, { status: 503 });
    return NextResponse.json({ ok: true, result });
  }

  return NextResponse.json({ error: "Say what to do." }, { status: 400 });
}
