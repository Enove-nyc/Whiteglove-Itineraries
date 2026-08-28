import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { accountCookieName, getCurrentAccountData, getTrips } from "@/lib/account-store";
import { deleteConversation, readChat, readMarkers } from "@/lib/companion-chat-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { PLAN_LABELS } from "@/lib/account-plans";
import { getPlan } from "@/lib/account-plan-store";
import { sameOrigin } from "@/lib/secure-access";

export const dynamic = "force-dynamic";

/**
 * The advisor's inbox: one entry per trip they have shared, newest talk first.
 *
 * Signed-in and owner-only — this is the list of an agency's own client
 * conversations, so it is read from who the request is, never from anything
 * passed in. Each shared trip is one conversation, keyed by that trip's share
 * token; the client on the other end reaches the same thread from their link.
 *
 * ADVISOR STARTER AND UP, like the client links it lists. One Trip has the
 * app for its own one trip and no clients to keep an inbox of, so the gate is
 * mayServeCompanionClients — the same door the share link and the client chat
 * pass through.
 */
export async function GET() {
  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountData(cookie);
  if (!account?.email) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  if (!mayServeCompanionClients(await getPlan(account.email))) {
    return NextResponse.json({ error: `The client inbox is part of ${PLAN_LABELS.starter} and up.` }, { status: 403 });
  }

  const shared = (await getTrips(account.email).catch(() => [])).filter((t) => t.shareId);
  const conversations = await Promise.all(
    shared.map(async (t) => {
      const [messages, markers] = await Promise.all([readChat(t.shareId!), readMarkers(t.shareId!)]);
      const last = messages[messages.length - 1];
      // The badge is UNREAD, not the whole history: the client's messages that
      // arrived after the advisor last opened this thread. Nobody wants to be
      // told a chat holds 214 messages — they want to know 2 are new.
      const advisorRead = markers.advisor ?? "";
      const unread = messages.filter((m) => m.from === "client" && !m.deletedAt && m.at > advisorRead).length;
      return {
        shareId: t.shareId!,
        name: t.name,
        client: t.client,
        count: unread,
        hasMessages: messages.length > 0,
        lastText: last?.text ?? "",
        // The kind of the last message, so the list can read "Photo" / "Voice
        // message" / "Location" when it has no text of its own — the way a
        // messenger's list does, instead of a blank that looks like "nothing".
        lastKind: last ? (last.kind ?? "text") : null,
        lastFrom: last?.from ?? null,
        lastAt: last?.at ?? "",
      };
    }),
  );
  // Trips with talk on them first, then by name — a quiet trip should not sit
  // above one the client just wrote on.
  conversations.sort((a, b) => (b.lastAt || "").localeCompare(a.lastAt || "") || a.name.localeCompare(b.name));

  return NextResponse.json({ conversations });
}

/**
 * Clear one client conversation — every message in it, back to empty.
 *
 * WHAT THIS DOES NOT DO: touch the trip, or the share link the client holds.
 * Deleting a conversation is deleting what was said, not the door the client
 * walks through to say the next thing — that stays open, same as before.
 *
 * Ownership is checked the same way the list above is built: the shareId has
 * to belong to one of THIS account's own trips, read from the account, never
 * trusted from the body — otherwise any advisor could clear any other
 * advisor's conversation by guessing a share id.
 */
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  }
  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountData(cookie);
  if (!account?.email) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  if (!mayServeCompanionClients(await getPlan(account.email))) {
    return NextResponse.json({ error: `The client inbox is part of ${PLAN_LABELS.starter} and up.` }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { share?: string } | null;
  const shareId = body?.share?.trim();
  if (!shareId) return NextResponse.json({ error: "Which conversation?" }, { status: 400 });

  const owns = (await getTrips(account.email).catch(() => [])).some((t) => t.shareId === shareId);
  if (!owns) return NextResponse.json({ error: "That conversation isn't yours." }, { status: 404 });

  await deleteConversation(shareId);
  return NextResponse.json({ ok: true });
}
