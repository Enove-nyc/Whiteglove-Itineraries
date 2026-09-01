import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  accountCookieName,
  getCurrentAccountData,
  removeAccountPushSubscription,
  resolveBusinessOwner,
  saveAccountPushSubscription,
} from "@/lib/account-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { getPlan } from "@/lib/account-plan-store";
import { isValidPushSubscription } from "@/lib/push-notify";
import { rateLimit } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/secure-access";
import type { PushSubscriptionRecord } from "@/data/push-subscriptions";

export const dynamic = "force-dynamic";

/**
 * The advisor's OWN opt-in to be pushed on their phone when a client writes
 * back — one control in the advisor app, covering every client's trip, so the
 * device lives on the account rather than a trip (the other side of the client
 * subscribing on their own trip, /api/companion/push).
 *
 * Signed in, same-origin, and gated to advisors (Advisor Starter and up) like
 * the inbox the notifications are about. The endpoint fence
 * (isValidPushSubscription) is the shared one — a stored endpoint is a URL the
 * server later POSTs to, so it must be a real browser push host, never an
 * internal address.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "That request did not come from this site." }, { status: 403 });
  }
  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountData(cookie);
  if (!account?.email) return NextResponse.json({ ok: false, error: "Please log in first." }, { status: 401 });
  // The notifications are the business's — an agency's staff login is judged by
  // its owner's plan and its device lands on the owner's account, so the whole
  // business's devices are reached together.
  const owner = await resolveBusinessOwner(account.email);
  if (!mayServeCompanionClients(await getPlan(owner))) {
    return NextResponse.json({ ok: false, error: "Notifications are part of Advisor Starter and up." }, { status: 403 });
  }

  const limited = await rateLimit(`account-push:${owner}`, { limit: 30, windowSeconds: 3600 });
  if (!limited.ok) {
    return NextResponse.json({ ok: false, error: "Too many changes at once — try again shortly." }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as
    | { action?: string; subscription?: unknown; endpoint?: string }
    | null;

  if (body?.action === "unsubscribe") {
    const endpoint = body.endpoint?.trim();
    if (!endpoint) return NextResponse.json({ ok: false, error: "Missing the subscription." }, { status: 400 });
    const ok = await removeAccountPushSubscription(owner, endpoint);
    return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
  }

  const subscription = body?.subscription;
  if (!isValidPushSubscription(subscription)) {
    return NextResponse.json({ ok: false, error: "That does not look like a push subscription." }, { status: 400 });
  }
  const record: PushSubscriptionRecord = {
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    addedAt: new Date().toISOString(),
  };
  const ok = await saveAccountPushSubscription(owner, record);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
