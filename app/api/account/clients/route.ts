import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { accountCookieName, getCurrentAccountData, listClients, resolveBusinessOwner } from "@/lib/account-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { getPlan } from "@/lib/account-plan-store";

export const dynamic = "force-dynamic";

/**
 * Every distinct client on the business's trips — see data/clients.ts. A
 * client is never its own record; this is derived fresh from SavedTrip.client
 * every time, the same way a library pack resolves its items fresh.
 * BUSINESS ONLY, the same gate as the pipeline it's built from.
 */
export async function GET() {
  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountData(cookie);
  if (!account?.email) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const owner = await resolveBusinessOwner(account.email);
  if (!mayServeCompanionClients(await getPlan(owner))) {
    return NextResponse.json({ error: "Clients are part of a Business account." }, { status: 403 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const clients = await listClients(owner, today);
  return NextResponse.json({ clients });
}
