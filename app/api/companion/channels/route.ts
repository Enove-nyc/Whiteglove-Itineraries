import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { accountCookieName, getCurrentAccountData, resolveCompanionShare } from "@/lib/account-store";
import {
  chatStoreAvailable,
  createChannel,
  deleteChannel,
  normalizeChannelId,
  readChannels,
  type CompanionChatSide,
} from "@/lib/companion-chat-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { getPlan } from "@/lib/account-plan-store";
import { identityKey } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/secure-access";

export const dynamic = "force-dynamic";

/**
 * The channels on a trip's conversation — "Hotel", "Flights", the General one
 * every trip carries — that split one thread into topics.
 *
 * WHO SEES THEM AND WHO MAKES THEM. Both sides SEE every channel: the client on
 * the app link and the advisor read the same list, the same way they read the
 * same messages. Only the advisor MAKES or removes them — creating a channel is
 * organising the client's trip, which is the advisor's job — so GET is open to
 * anyone holding the link while POST and DELETE are advisor-only, decided here
 * from who the request is, never from the body.
 *
 * The link is the credential, resolved the same way the chat and report routes
 * resolve it (a whole-trip token or a traveler-scoped one, to the same
 * underlying thread), and gated to Advisor Starter and up like the client app
 * it belongs to.
 */
async function whoFor(shareId: string): Promise<{ owner: string; side: CompanionChatSide; chatKey: string } | null> {
  const resolved = await resolveCompanionShare(shareId);
  if (!resolved) return null;
  const { ownerEmail: owner, chatKey } = resolved;
  if (!mayServeCompanionClients(await getPlan(owner))) return null;
  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountData(cookie);
  const side: CompanionChatSide =
    account?.email && identityKey(account.email) === identityKey(owner) ? "advisor" : "client";
  return { owner, side, chatKey };
}

/** The channel list — General first, then the advisor's own. Anyone on the
 *  link may read it. */
export async function GET(request: NextRequest) {
  const shareId = request.nextUrl.searchParams.get("share")?.trim();
  if (!shareId) return NextResponse.json({ error: "Which trip?" }, { status: 400 });
  const who = await whoFor(shareId);
  if (!who) return NextResponse.json({ error: "That link is not active." }, { status: 404 });
  return NextResponse.json({ channels: await readChannels(who.chatKey), side: who.side });
}

/** Make a new channel — advisor only. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  }
  if (!chatStoreAvailable()) {
    return NextResponse.json({ error: "Channels need the private store connected." }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as { share?: string; name?: string } | null;
  const shareId = body?.share?.trim();
  const name = typeof body?.name === "string" ? body.name : "";
  if (!shareId || !name.trim()) return NextResponse.json({ error: "Give the channel a name." }, { status: 400 });
  const who = await whoFor(shareId);
  if (!who) return NextResponse.json({ error: "That link is not active." }, { status: 404 });
  if (who.side !== "advisor") return NextResponse.json({ error: "Only the advisor can add channels." }, { status: 403 });

  const limited = await rateLimit(`companion-channel:${who.chatKey}`, { limit: 30, windowSeconds: 3600 });
  if (!limited.ok) {
    return NextResponse.json({ error: "That is a lot of channels at once — try again shortly." }, { status: 429 });
  }

  const result = await createChannel(who.chatKey, name);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ channels: result.channels, created: result.created });
}

/** Remove a channel and everything in it — advisor only. General can't go. */
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { share?: string; channel?: string } | null;
  const shareId = body?.share?.trim();
  const channel = normalizeChannelId(body?.channel);
  if (!shareId) return NextResponse.json({ error: "Which trip?" }, { status: 400 });
  if (channel === "general") return NextResponse.json({ error: "The General channel can't be removed." }, { status: 400 });
  const who = await whoFor(shareId);
  if (!who) return NextResponse.json({ error: "That link is not active." }, { status: 404 });
  if (who.side !== "advisor") return NextResponse.json({ error: "Only the advisor can remove channels." }, { status: 403 });

  const channels = await deleteChannel(who.chatKey, channel);
  return NextResponse.json({ channels });
}
