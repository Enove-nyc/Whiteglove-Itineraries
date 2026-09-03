import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { accountCookieName, getActivity, getCurrentAccountData, getTripItinerary, resolveBusinessOwner } from "@/lib/account-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { getPlan } from "@/lib/account-plan-store";

export const dynamic = "force-dynamic";

/**
 * One trip's own activity feed — read-only, there is nothing here for a
 * planner to write by hand. BUSINESS ONLY, the same gate as the pipeline
 * this sits alongside — a personal trip has nobody else's actions to log.
 */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const account = await getCurrentAccountData(cookieStore.get(accountCookieName())?.value);
  if (!account?.email) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const email = await resolveBusinessOwner(account.email);
  if (!mayServeCompanionClients(await getPlan(email))) {
    return NextResponse.json({ error: "A trip's activity feed is part of a Business account." }, { status: 403 });
  }

  const wanted = request.nextUrl.searchParams.get("trip");
  const trip = await getTripItinerary(email, !wanted || wanted === "current" ? undefined : wanted);
  if (!trip) return NextResponse.json({ error: "No trip to show activity for yet." }, { status: 404 });
  const entries = await getActivity(email, trip.tripId);
  return NextResponse.json({ tripId: trip.tripId, tripName: trip.tripName || trip.itinerary.title || "", entries });
}
