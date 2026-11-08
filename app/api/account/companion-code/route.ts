import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { accountCookieName, ensureTripShare, getCurrentAccountSummary, getTripItinerary, getTrips } from "@/lib/account-store";
import { sameOrigin } from "@/lib/secure-access";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
  if (!sameOrigin(request)) return reply({ error: "Please open your trip again." }, 403);
  const account = await getCurrentAccountSummary((await cookies()).get(accountCookieName())?.value);
  if (!account) return reply({ error: "Log in to open your own trips." }, 401);
  const body = await request.json().catch(() => null) as { tripId?: unknown } | null;
  const id = typeof body?.tripId === "string" ? body.tripId : "";
  const trips = await getTrips(account.email);
  // getTripItinerary falls back to the first trip for an unknown id. Validate
  // ownership BEFORE calling it, so a mistyped id can never open another trip.
  if (!id || !trips.some((trip) => trip.id === id)) return reply({ error: "That trip was not found." }, 404);
  const allowed = await rateLimit(`companion-code:${account.email}`, { limit: 30, windowSeconds: 60 });
  if (!allowed.ok) return reply({ error: "Please wait a moment before trying again." }, 429);
  const trip = await getTripItinerary(account.email, id);
  if (!trip?.itinerary.startDate || !trip.itinerary.endDate) return reply({ error: "Set this trip’s dates in the website’s itinerary planner first." }, 400);
  const code = await ensureTripShare(account.email, id, "self");
  if (!code) return reply({ error: "The trip code could not be saved. Please try again." }, 503);
  return reply({ code });
}
