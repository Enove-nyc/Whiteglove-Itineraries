import { NextRequest, NextResponse } from "next/server";
import { inspectAccountInvitation } from "@/lib/account-invitations";
import { rateLimit, requesterKey, tooManyMessage } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/secure-access";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "That request did not come from this site." }, { status: 403, headers });
  const gate = await rateLimit(`invitation-check:${requesterKey(request.headers)}`, { limit: 30, windowSeconds: 60 });
  if (!gate.ok) return NextResponse.json({ error: tooManyMessage(gate.retryAfter) }, { status: 429, headers: { ...headers, "Retry-After": String(gate.retryAfter) } });
  const body = await request.json().catch(() => null) as { invitationToken?: unknown } | null;
  try {
    const invitation = typeof body?.invitationToken === "string" ? await inspectAccountInvitation(body.invitationToken) : null;
    if (!invitation) return NextResponse.json({ error: "This invitation is not available. Contact White Glove for a new link." }, { status: 403, headers });
    return NextResponse.json({ identity: invitation.identity, expiresAt: invitation.expiresAt }, { headers });
  } catch { return NextResponse.json({ error: "The invitation could not be checked. Please try again." }, { status: 503, headers }); }
}
