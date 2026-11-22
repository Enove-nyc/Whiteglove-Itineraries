import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { accountCookieName, ensureTravelerShare, getCurrentAccountData, publishTravelerItinerary, revokeTravelerShare } from "@/lib/account-store";
import { getPlan } from "@/lib/account-plan-store";
import { PLAN_LABELS } from "@/lib/account-plans";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { currentBrand } from "@/lib/site-brand";
import { sameOrigin } from "@/lib/secure-access";

export const dynamic = "force-dynamic";

/**
 * A traveler's own door into the trip app — for a family or group trip where
 * one person (or one family, sharing a `family` label — data/itinerary.ts)
 * gets a link scoped to just them, rather than the one trip-wide link every
 * traveler would otherwise be handed alike. Advisor Starter and up, same door
 * as handing the whole trip to a client at all.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  }
  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountData(cookie);
  if (!account?.email) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const privateInvite = (await currentBrand()) === "itineraries";
  if (!privateInvite && !mayServeCompanionClients(await getPlan(account.email))) {
    return NextResponse.json({ error: `Handing a trip to a client is part of ${PLAN_LABELS.starter} and up.` }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { tripId?: string; travelerId?: string; action?: string } | null;
  const tripId = typeof body?.tripId === "string" ? body.tripId.trim() : "";
  const travelerId = typeof body?.travelerId === "string" ? body.travelerId.trim() : "";
  if (body?.action === "publish" && privateInvite && tripId) {
    const published = await publishTravelerItinerary(account.email, tripId);
    return NextResponse.json({ ok: published, ...(published ? {} : { error: "Create a traveler invite and save trip dates before publishing changes." }) }, { status: published ? 200 : 400 });
  }
  if (!tripId || !travelerId) return NextResponse.json({ error: "Which trip, and which traveler?" }, { status: 400 });

  if (body?.action === "revoke") {
    const revoked = await revokeTravelerShare(account.email, tripId, travelerId);
    return NextResponse.json({ ok: revoked }, { status: revoked ? 200 : 503 });
  }
  const shareId = await ensureTravelerShare(account.email, tripId, travelerId, privateInvite);
  if (!shareId) return NextResponse.json({ error: "Could not create the invite. Save the trip dates and the traveler’s sign-in email first." }, { status: 503 });
  return NextResponse.json({ shareId });
}
