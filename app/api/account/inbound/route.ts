import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { inboundAddress, pendingToShow } from "@/data/inbound-import";
import { accountCookieName, getCurrentAccountData } from "@/lib/account-store";
import {
  clearPending,
  ensureInboundToken,
  inboundDomain,
  inboundMailReady,
  inboundStoreAvailable,
  readPending,
  rotateInboundToken,
} from "@/lib/inbound-import-store";
import { sameOrigin } from "@/lib/secure-access";
import { currentBrand } from "@/lib/site-brand";
import { BRAND_DOMAIN } from "@/lib/site-brand-core";

export const dynamic = "force-dynamic";

/**
 * The planner's side of forwarding: the address to send to, and what is
 * waiting on it.
 *
 * The address is made on first read rather than at sign-up, so an account that
 * never forwards anything never has a mailbox for anybody to guess at.
 *
 * THIS ROUTE NEVER WRITES TO A TRIP EITHER. Clearing an entry only takes it
 * off the queue; the rows themselves are added by the planner through the
 * ordinary review screen, which is the whole point of the queue existing.
 */
async function who(): Promise<string> {
  const account = await getCurrentAccountData((await cookies()).get(accountCookieName())?.value);
  if (!account) return "";
  // No staff logins on this deployment — an account forwards into its own
  // queue. The kosher copy resolves a business owner here; if team logins ever
  // arrive on this side, that resolution has to arrive with them, or a team
  // member's forwarded booking lands in a queue nobody opens.
  return account.email;
}

export async function GET() {
  const email = await who();
  if (!email) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  // No address until mail can actually reach it — see inboundMailReady.
  // Anything already queued is still handed back, because a message that got
  // in before the provider was reconfigured is still somebody's booking.
  if (!inboundStoreAvailable()) return NextResponse.json({ address: "", pending: [] });
  if (!inboundMailReady()) {
    const waiting = await readPending(email).catch(() => []);
    return NextResponse.json({ address: "", pending: pendingToShow(waiting, new Date().toISOString()) });
  }
  const [token, pending] = await Promise.all([ensureInboundToken(email), readPending(email)]);
  return NextResponse.json({
    address: inboundAddress(token, inboundDomain(BRAND_DOMAIN[await currentBrand()])),
    pending: pendingToShow(pending, new Date().toISOString()),
  });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  }
  const email = await who();
  if (!email) return NextResponse.json({ error: "Please log in first." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { action?: unknown; id?: unknown } | null;

  if (body?.action === "rotate") {
    const token = await rotateInboundToken(email);
    return NextResponse.json({ ok: true, address: inboundAddress(token, inboundDomain(BRAND_DOMAIN[await currentBrand()])) });
  }
  if (body?.action === "clear" && typeof body.id === "string") {
    const ok = await clearPending(email, body.id);
    return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
  }
  return NextResponse.json({ error: "Say what to do." }, { status: 400 });
}
