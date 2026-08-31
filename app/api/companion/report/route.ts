import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { accountCookieName, getCurrentAccountData, resolveCompanionShare } from "@/lib/account-store";
import { appendReport, isKnownChannel, normalizeChannelId } from "@/lib/companion-chat-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { getPlan } from "@/lib/account-plan-store";
import { identityKey } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/secure-access";

export const dynamic = "force-dynamic";

/**
 * Flag a message on a shared trip's thread.
 *
 * THE OTHER HALF OF LETTING PEOPLE SEND PICTURES. A concierge and a traveller
 * can send each other a photograph; either of them must be able to say one of
 * those should not have been sent. The report is recorded against the trip
 * (lib/companion-chat-store.ts) for the operator to act on. It does not delete
 * anything on its own — one tap is a flag, not a verdict — and the reporter is
 * simply told it was received.
 *
 * Who is reporting is read from the link and the session, the same way the chat
 * route decides who may post: the signed-in owner of the share is the advisor,
 * anyone else holding the link is the client. So only a real participant in a
 * thread can raise a report on it.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { share?: string; at?: string; channel?: string } | null;
  const shareId = body?.share?.trim();
  const at = body?.at?.trim();
  if (!shareId || !at) return NextResponse.json({ error: "Nothing to report." }, { status: 400 });
  const channel = normalizeChannelId(body?.channel);

  // Accepts either a whole-trip token or a traveler-scoped one, resolved to
  // the same underlying thread — see resolveCompanionShare and the note on
  // it in lib/account-store.ts. The resolved chatKey is server-side only.
  const resolved = await resolveCompanionShare(shareId);
  if (!resolved) return NextResponse.json({ error: "That link is not active." }, { status: 404 });
  const { ownerEmail: owner, chatKey } = resolved;
  // Business-only, the same gate as the chat it reports on — a non-Business
  // share link has no thread to report against.
  if (!mayServeCompanionClients(await getPlan(owner))) {
    return NextResponse.json({ error: "That link is not active." }, { status: 404 });
  }
  if (!(await isKnownChannel(chatKey, channel))) {
    return NextResponse.json({ error: "That channel doesn't exist on this trip." }, { status: 404 });
  }

  const limited = await rateLimit(`companion-report:${chatKey}`, { limit: 30, windowSeconds: 3600 });
  if (!limited.ok) {
    return NextResponse.json({ error: "That is a lot of reports at once — try again shortly." }, { status: 429 });
  }

  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountData(cookie);
  const by = account?.email && identityKey(account.email) === identityKey(owner) ? "advisor" : "client";

  const ok = await appendReport(chatKey, { by, messageAt: at, at: new Date().toISOString() }, channel);
  if (!ok) return NextResponse.json({ error: "Reporting needs the private store connected." }, { status: 503 });
  return NextResponse.json({ ok: true });
}
