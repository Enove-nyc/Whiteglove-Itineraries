import { NextRequest, NextResponse } from "next/server";
import { rateLimit, requesterKey, tooManyMessage } from "@/lib/rate-limit";
import { createAccount } from "@/lib/account-store";
import { inspectAccountInvitation, invitationId } from "@/lib/account-invitations";
import { normalizeIdentity } from "@/lib/identity";
import { smsConfigured } from "@/lib/sms";
import { verificationCodeTo } from "@/lib/verification-delivery";
import { brandFromRequestHeaders } from "@/lib/site-brand-core";
import { sameOrigin } from "@/lib/secure-access";

const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "That request did not come from this site." }, { status: 403, headers });
  const body = await request.json().catch(() => null) as { email?: unknown; password?: unknown; name?: unknown; phone?: unknown; invitationToken?: unknown } | null;
  if (typeof body?.invitationToken !== "string" || !invitationId(body.invitationToken)) {
    return NextResponse.json({ error: "New accounts require an invitation link from White Glove." }, { status: 403, headers });
  }
  if (typeof body.email !== "string" || typeof body.password !== "string" || !body.email || !body.password) {
    return NextResponse.json({ error: "Enter your email address or phone number, and a password." }, { status: 400, headers });
  }
  const identity = normalizeIdentity(body.email);
  if (!identity) return NextResponse.json({ error: "Enter a valid email address or phone number." }, { status: 400, headers });
  for (const key of [`register-ip:${requesterKey(request.headers)}`, `register:${identity.value}`]) {
    const gate = await rateLimit(key, { limit: 5, windowSeconds: 15 * 60 });
    if (!gate.ok) return NextResponse.json({ error: tooManyMessage(gate.retryAfter) }, { status: 429, headers: { ...headers, "Retry-After": String(gate.retryAfter) } });
  }
  try {
    const invitation = await inspectAccountInvitation(body.invitationToken);
    if (!invitation || invitation.identity !== identity.value) return NextResponse.json({ error: "This invitation is not available for those details." }, { status: 403, headers });
  } catch {
    return NextResponse.json({ error: "Account registration is temporarily unavailable. Please try again." }, { status: 503, headers });
  }
  if (identity.kind === "phone" && !smsConfigured()) return NextResponse.json({ error: "Text verification is not configured. Please ask for an email invitation." }, { status: 400, headers });
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : undefined;
  const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 40) || undefined : undefined;
  const result = await createAccount(identity.value, body.password, name, phone, body.invitationToken);
  if (!result.ok) {
    const reason = "code" in result ? result.code : undefined;
    return NextResponse.json({ error: result.error }, { status: reason === "unavailable" ? 503 : reason === "invitation" ? 403 : reason === "exists" ? 409 : 400, headers });
  }
  const delivery = await verificationCodeTo(result.email, result.verificationCode, brandFromRequestHeaders(request.headers));
  return NextResponse.json({ ok: true, email: result.email, verificationRequired: true, sentVia: delivery.via, sentTo: delivery.to, delivered: delivery.ok, deliveryError: delivery.error }, { headers });
}
