import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { accountCookieName, getCurrentAccountData, getTripActivity } from "@/lib/account-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { PLAN_LABELS } from "@/lib/account-plans";
import { getPlan } from "@/lib/account-plan-store";

export const dynamic = "force-dynamic";

/**
 * A trip's own history — proposal sent, form returned, payment settled — read
 * back for the advisor who did the work. ADVISOR STARTER AND UP, the same gate
 * as a proposal or a client form; the feed itself is written where each of
 * those actions happens (see lib/account-store.ts).
 */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const account = await getCurrentAccountData(cookieStore.get(accountCookieName())?.value);
  if (!account) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  if (!mayServeCompanionClients(await getPlan(account.email))) {
    return NextResponse.json({ error: `A trip's history is part of ${PLAN_LABELS.starter} and up.` }, { status: 403 });
  }
  const wanted = request.nextUrl.searchParams.get("trip") ?? undefined;
  const result = await getTripActivity(account.email, wanted);
  if (!result) return NextResponse.json({ error: "No trip to show a history for yet." }, { status: 404 });
  return NextResponse.json(result);
}
