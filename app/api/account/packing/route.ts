import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  accountCookieName,
  currentPackingSignature,
  generatePackingList,
  getCurrentAccountData,
  getPackingList,
  getTripItinerary,
  readSessionEmail,
  resolveBusinessOwner,
  togglePackingItem,
} from "@/lib/account-store";
import { isStale } from "@/data/packing-list";
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
 * A trip's packing list — for anyone with a trip, not Business-gated: this
 * is a personal-travel feature the same way the itinerary and route are, not
 * a client-facing one. A staff login still reads the business's own trip
 * (resolveBusinessOwner), same as every other per-trip route.
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
  if (!trip) return NextResponse.json({ error: "No trip to pack for yet." }, { status: 404 });

  const list = await getPackingList(email, trip.tripId);
  const stale = list ? isStale(list, currentPackingSignature(trip.itinerary)) : false;
  return NextResponse.json({ tripId: trip.tripId, tripName: trip.tripName || trip.itinerary.title || "", list, stale });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  }
  const email = await ownerEmail();
  if (!email) return NextResponse.json({ error: "Please log in first." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { action?: string; tripId?: string; itemId?: string; checked?: boolean }
    | null;
  if (!body?.tripId) return NextResponse.json({ error: "Which trip?" }, { status: 400 });
  const trip = await getTripItinerary(email, body.tripId);
  if (!trip) return NextResponse.json({ error: "Trip not found." }, { status: 404 });

  if (body.action === "toggle") {
    if (!body.itemId || typeof body.checked !== "boolean") {
      return NextResponse.json({ error: "Say which item, and whether it's checked." }, { status: 400 });
    }
    const ok = await togglePackingItem(email, trip.tripId, body.itemId, body.checked);
    if (!ok) return NextResponse.json({ error: "Could not save that." }, { status: 503 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "generate") {
    const flood = await rateLimit(`packing-generate:${email}`, AI_LIMIT);
    if (!flood.ok) return NextResponse.json({ error: tooManyMessage(flood.retryAfter) }, { status: 429 });
    const list = await generatePackingList(email, trip.tripId);
    if (!list) return NextResponse.json({ error: "Could not generate a packing list right now. Try again shortly." }, { status: 503 });
    return NextResponse.json({ ok: true, list });
  }

  return NextResponse.json({ error: "Say what to do with the packing list." }, { status: 400 });
}
