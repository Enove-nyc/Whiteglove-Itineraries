import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { accountCookieName, getClientProfile, getClientTrips, getCurrentAccountData, resolveBusinessOwner, saveClientProfile } from "@/lib/account-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { getPlan } from "@/lib/account-plan-store";
import { sameOrigin } from "@/lib/secure-access";

export const dynamic = "force-dynamic";

const MAX_FIELD = 2000;

async function ownerFor(): Promise<{ email: string } | { error: string; status: number }> {
  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountData(cookie);
  if (!account?.email) return { error: "Please log in first.", status: 401 };
  const owner = await resolveBusinessOwner(account.email);
  if (!mayServeCompanionClients(await getPlan(owner))) {
    return { error: "Clients are part of a Business account.", status: 403 };
  }
  return { email: owner };
}

/**
 * One client: their trips (upcoming and previous — see data/clients.ts) and
 * whatever notes or preferences have been kept about them.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const who = await ownerFor();
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const { key } = await params;

  const [trips, profile] = await Promise.all([getClientTrips(who.email, key), getClientProfile(who.email, key)]);
  if (trips.length === 0) return NextResponse.json({ error: "No client by that name." }, { status: 404 });
  return NextResponse.json({ trips, profile });
}

/** Save what's been noted about this client — never anything about a trip
 *  itself, which is changed through the planner or the pipeline instead. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  }
  const who = await ownerFor();
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const { key } = await params;

  const body = (await request.json().catch(() => null)) as { notes?: string; preferences?: string } | null;
  if (!body) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  if ((body.notes?.length ?? 0) > MAX_FIELD || (body.preferences?.length ?? 0) > MAX_FIELD) {
    return NextResponse.json({ error: `Keep each field under ${MAX_FIELD} characters.` }, { status: 400 });
  }

  const ok = await saveClientProfile(who.email, key, { notes: body.notes?.trim(), preferences: body.preferences?.trim() });
  if (!ok) return NextResponse.json({ error: "Could not save that." }, { status: 503 });
  return NextResponse.json({ ok: true });
}
