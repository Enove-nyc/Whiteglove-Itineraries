import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { accountCookieName, ADVISOR_ALERT_MAX, getCurrentAccountData, sendAdvisorAlert } from "@/lib/account-store";
import { getPlan } from "@/lib/account-plan-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { sameOrigin } from "@/lib/secure-access";

export const dynamic = "force-dynamic";

/**
 * The advisor sending the traveler a line by hand — "your driver is running
 * twenty minutes late" — which lands on the trip's Changes feed and is pushed
 * to any device following it. The signed-in owner only, same-origin only, and
 * only on a plan that actually serves clients: handing something to a client
 * is an Advisor plan's job (see the plan notes in lib/account-limits.ts), so a
 * plan that cannot have a client cannot send one an alert.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  }
  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountData(cookie);
  if (!account?.email) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  if (!mayServeCompanionClients(await getPlan(account.email))) {
    return NextResponse.json({ error: "Sending a traveler an alert needs an Advisor plan." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { tripId?: string; text?: string } | null;
  const tripId = body?.tripId?.trim();
  const text = body?.text?.trim();
  if (!tripId || !text) return NextResponse.json({ error: "Which trip, and what should it say?" }, { status: 400 });
  if (text.length > ADVISOR_ALERT_MAX) {
    return NextResponse.json({ error: `Keep it under ${ADVISOR_ALERT_MAX} characters.` }, { status: 400 });
  }

  const alert = await sendAdvisorAlert(account.email, tripId, text);
  if (!alert) return NextResponse.json({ error: "Could not send that." }, { status: 503 });
  return NextResponse.json({ ok: true });
}
