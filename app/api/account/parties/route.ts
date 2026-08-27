import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  accountCookieName,
  getBalance,
  getCurrentAccountData,
  getFormResponses,
  getFormTemplate,
  getTripItinerary,
} from "@/lib/account-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { getPlan } from "@/lib/account-plan-store";
import { emptyItinerary } from "@/data/itinerary";
import { formatCents } from "@/data/trip-payments";
import { partiesOf, sortForAdviser } from "@/data/trip-parties";

export const dynamic = "force-dynamic";

/**
 * One trip's families, and what each of them still needs.
 *
 * READ ONLY, AND IT HANDS BACK NO ANSWERS. The form responses are read here to
 * work out WHETHER a party has answered, and not one of them leaves this
 * route: what a traveler wrote is read back through the planner's own form
 * route, one place, rather than through anything that also renders a list. See
 * the note at the top of data/trip-parties.ts.
 *
 * ADVISOR STARTER AND UP, the same gate as Payments and the rest of the
 * client-facing work — a group trip is by definition somebody else's trip.
 */
export async function GET(request: NextRequest) {
  const account = await getCurrentAccountData((await cookies()).get(accountCookieName())?.value);
  if (!account?.email) return NextResponse.json({ error: "Please log in first." }, { status: 401 });

  // One login per adviser on this platform — there is no staff account to
  // resolve through, unlike the guide's admin. See app/api/account/payments.
  const email = account.email;
  if (!mayServeCompanionClients(await getPlan(email))) {
    return NextResponse.json({ error: "Group trips are part of Advisor Starter and up." }, { status: 403 });
  }

  const wanted = request.nextUrl.searchParams.get("trip") ?? undefined;
  const trip = await getTripItinerary(email, wanted);
  if (!trip) return NextResponse.json({ tripId: null, tripName: "", parties: [], totals: null, currency: "USD" });

  const [balance, template, responses] = await Promise.all([
    getBalance(email, trip.tripId),
    getFormTemplate(email, trip.tripId),
    getFormResponses(email, trip.tripId),
  ]);

  const currency = balance?.currency ?? "USD";
  const { parties, totals } = partiesOf({ ...emptyItinerary(), ...trip.itinerary }, balance, {
    today: new Date().toISOString().slice(0, 10),
    template,
    responses,
    formatAmount: (cents) => formatCents(cents, currency),
  });

  return NextResponse.json({
    tripId: trip.tripId,
    tripName: trip.tripName || trip.itinerary.title || "",
    currency,
    // Split by party or not — the panel says which, rather than showing zeroes.
    splitByParty: parties.some((party) => party.share !== null),
    parties: sortForAdviser(parties),
    totals,
  });
}
