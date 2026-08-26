import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { accountCookieName, acknowledgeAlert, acknowledgeAllAlerts, getCurrentAccountData } from "@/lib/account-store";
import { sameOrigin } from "@/lib/secure-access";

export const dynamic = "force-dynamic";

/**
 * Marking a Changes-screen alert read — the trip owner's own side only (an
 * account cookie). One alert with `alertId`, or every alert on the trip at
 * once with `all: true`, which is what opening the Changes screen does.
 *
 * A client viewing the trip on a per-trip code has no account and so never
 * reaches here; their read state is their own, kept in their browser (see
 * CompanionApp.tsx). The client app still only ever shows information — it
 * asks the server to manage nothing.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  }
  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountData(cookie);
  if (!account?.email) return NextResponse.json({ error: "Please log in first." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { tripId?: string; alertId?: string; all?: boolean } | null;
  const tripId = body?.tripId?.trim();
  if (!tripId) return NextResponse.json({ error: "Which trip?" }, { status: 400 });

  if (body?.all) {
    const ok = await acknowledgeAllAlerts(account.email, tripId);
    if (!ok) return NextResponse.json({ error: "Could not update those." }, { status: 503 });
    return NextResponse.json({ ok: true });
  }

  const alertId = body?.alertId?.trim();
  if (!alertId) return NextResponse.json({ error: "Which alert?" }, { status: 400 });

  const ok = await acknowledgeAlert(account.email, tripId, alertId);
  if (!ok) return NextResponse.json({ error: "Could not dismiss that." }, { status: 503 });
  return NextResponse.json({ ok: true });
}
