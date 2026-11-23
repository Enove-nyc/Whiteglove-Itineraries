import { createAccountInvitation, revokeAccountInvitation } from "@/lib/account-invitations";
import { sendFamilyTripInvitation } from "@/lib/email";
import { normalizeIdentity } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import { BRAND_ORIGIN } from "@/lib/site-brand-core";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { accountCookieName, ensureTravelerShare, getCurrentAccountData, getAccountRecord, getSharedTraveler, publishTravelerItinerary, revokeTravelerShare } from "@/lib/account-store";
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
  if (body?.action === "email" && privateInvite) {
    const organizer = await rateLimit(`family-invite:sender:${account.email}`, { limit: 20, windowSeconds: 86400 });
    if (!organizer.ok) return NextResponse.json({ error: "You’ve reached today’s invitation limit. Try again tomorrow." }, { status: 429 });
  }
  const shareId = await ensureTravelerShare(account.email, tripId, travelerId, privateInvite);
  if (!shareId) return NextResponse.json({ error: "Could not create the invite. Save the trip dates and the traveler’s sign-in email first." }, { status: 503 });
  if (body?.action === "email" && privateInvite) {
    const shared = await getSharedTraveler(shareId, account.email);
    const recipient = normalizeIdentity(shared?.traveler.email ?? "");
    if (!shared?.privateInvite || recipient?.kind !== "email") return NextResponse.json({ error: "Save a valid email address for this traveler." }, { status: 400 });
    const limited = await rateLimit(`family-invite:recipient:${recipient.value}`, { limit: 3, windowSeconds: 3600 });
    if (!limited.ok) return NextResponse.json({ error: "This traveler has received several invitations. Try again in an hour." }, { status: 429 });
    let invitationId: string | undefined;
    try {
      const record = await getAccountRecord(recipient.value);
      const origin = BRAND_ORIGIN.itineraries;
      let url = `${origin}/t/${encodeURIComponent(shareId)}/app`;
      if (!record) {
        const issued = await createAccountInvitation(recipient.value, account.email, Date.now(), shareId);
        invitationId = issued.invitation.id;
        url = `${origin}/join#invite=${issued.token}`;
      }
      if (await sendFamilyTripInvitation(recipient.value, url, shared.ownerName ?? "", !record)) {
        return NextResponse.json({ shareId, emailed: true });
      }
    } catch {
      // A failed delivery is reported without disclosing the recipient or token.
    }
    if (invitationId) await revokeAccountInvitation(invitationId).catch(() => false);
    return NextResponse.json({ error: "The invitation email could not be sent. Try again later." }, { status: 503 });
  }
  return NextResponse.json({ shareId });
}
