import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { accountCookieName, getCurrentAccountData, resolveCompanionShare } from "@/lib/account-store";
import {
  MAX_CHAT_LABEL,
  MAX_CHAT_TEXT,
  appendChat,
  chatStoreAvailable,
  deleteMessage,
  editMessageText,
  isTyping,
  markRead,
  quoteFor,
  readChat,
  readMarkers,
  setTyping,
  type CompanionChatSide,
} from "@/lib/companion-chat-store";
import {
  audioUploadsAvailable,
  docUploadLimit,
  effectiveMediaLimit,
  MAX_CHAT_AUDIO_BYTES,
  MAX_CHAT_VIDEO_BYTES,
  mediaStoreAvailable,
  putMedia,
  videoUploadsAvailable,
} from "@/lib/media";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { getPlan } from "@/lib/account-plan-store";
import { parseChatDataUrl } from "@/lib/chat-media";
import { identityKey } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/secure-access";

export const dynamic = "force-dynamic";

// A picture in a chat is a photograph — the three the phone's camera and
// gallery produce.
const CHAT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// A video is a short clip, not any container a phone might produce.
const CHAT_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
// A voice note, recorded in the browser — the two containers MediaRecorder
// actually produces across Safari and everywhere else.
const CHAT_AUDIO_TYPES = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg"]);
// A document, so an advisor can hand a client the one file the wallet cannot
// reach them with — a booking confirmation, a ticket. PDF only: it is the one
// format that opens the same on every phone, and the media store already
// accepts it (lib/media.ts ALLOWED_TYPES).
const CHAT_DOC_TYPES = new Set(["application/pdf"]);

type ChatMediaKind = "image" | "video" | "audio" | "file";

/** What a content type is, its limit, its rate key, and whether the store can
 * take it — one table instead of three parallel if/else ladders. */
function mediaKindFor(contentType: string): { kind: ChatMediaKind; limit: number; available: () => boolean } | null {
  if (CHAT_IMAGE_TYPES.has(contentType)) return { kind: "image", limit: effectiveMediaLimit(), available: mediaStoreAvailable };
  if (CHAT_VIDEO_TYPES.has(contentType)) return { kind: "video", limit: MAX_CHAT_VIDEO_BYTES, available: videoUploadsAvailable };
  if (CHAT_AUDIO_TYPES.has(contentType)) return { kind: "audio", limit: MAX_CHAT_AUDIO_BYTES, available: audioUploadsAvailable };
  // A PDF stores like a picture — base64 in the same store — but a document is
  // not a portrait: it gets its own, roomier cap (docUploadLimit), honoured
  // where the disk is and falling back to the small Redis ceiling where it is
  // not. This is what lets a real booking confirmation through.
  if (CHAT_DOC_TYPES.has(contentType)) return { kind: "file", limit: docUploadLimit(), available: mediaStoreAvailable };
  return null;
}

const RATE_LIMIT_FOR: Record<ChatMediaKind, number> = { image: 20, video: 8, audio: 15, file: 20 };
const NOUN_FOR: Record<ChatMediaKind, string> = { image: "picture", video: "video", audio: "voice note", file: "document" };

/**
 * The chat on one trip, between the client on the app link and the advisor.
 *
 * WHICH SIDE YOU ARE is decided here, from who you are, never from what the
 * browser claims: the signed-in owner of the trip's share is the advisor;
 * anybody else holding the link is the client. So a client cannot post as the
 * advisor by asking to, and the owner's replies are always theirs.
 *
 * ACCEPTS EITHER A WHOLE-TRIP TOKEN OR A TRAVELER-SCOPED ONE
 * (resolveCompanionShare) so a family's own /t/ link reaches the same thread
 * as everyone else's. `chatKey` is the real storage key — always the trip's
 * whole-trip token internally — and is used for every read/write below; the
 * `shareId` the caller sent stays exactly what it was, never upgraded or
 * echoed back as something more powerful than it is.
 */
async function sideFor(shareId: string): Promise<{ owner: string; side: CompanionChatSide; chatKey: string } | null> {
  const resolved = await resolveCompanionShare(shareId);
  if (!resolved) return null;
  const { ownerEmail: owner, chatKey } = resolved;
  // The thread is the client-facing app, so it is Business-only — the SAME gate
  // as the client app page (app/i/[shareId]/app) and the inbox. A share link
  // from a Gold or Traveler account is a real read-only itinerary, never a
  // message or image channel; without this check the plan boundary would be UI
  // only, and any share token a link-holder could POST pictures into the store.
  if (!mayServeCompanionClients(await getPlan(owner))) return null;
  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountData(cookie);
  const side: CompanionChatSide =
    account?.email && identityKey(account.email) === identityKey(owner) ? "advisor" : "client";
  return { owner, side, chatKey };
}

const otherSideOf = (side: CompanionChatSide): CompanionChatSide => (side === "advisor" ? "client" : "advisor");

export async function GET(request: NextRequest) {
  const shareId = request.nextUrl.searchParams.get("share")?.trim();
  if (!shareId) return NextResponse.json({ error: "Which trip?" }, { status: 400 });
  const who = await sideFor(shareId);
  if (!who) return NextResponse.json({ error: "That link is not active." }, { status: 404 });
  const messages = await readChat(who.chatKey);
  // Loading the thread IS reading it — there is no separate "mark as read"
  // action, the same as a phone's messaging app. The other side sees this as
  // soon as their own next poll picks the marker up. The one exception is a
  // "peek" (?peek=1) — used only to badge the Messages tab before the
  // thread is actually opened — which must not silently mark a message read
  // that nobody has looked at yet.
  const peek = request.nextUrl.searchParams.get("peek") === "1";
  if (!peek) {
    const latest = messages[messages.length - 1];
    if (latest) await markRead(who.chatKey, who.side, latest.at);
  }
  return NextResponse.json({
    messages,
    side: who.side,
    available: chatStoreAvailable(),
    readMarkers: await readMarkers(who.chatKey),
    // Whether the OTHER side has typed within the last few seconds — never
    // my own, which the composer already knows without asking the server.
    typing: await isTyping(who.chatKey, otherSideOf(who.side)),
    // The server's real, deploy-specific picture size limit — see
    // effectiveMediaLimit() in lib/media.ts. Read fresh so the composer's
    // own cap never drifts from what the server will actually accept.
    imageLimit: effectiveMediaLimit(),
    // And the document cap, which is roomier than a picture where the disk is.
    docLimit: docUploadLimit(),
  });
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { share?: string; at?: string; text?: string } | null;
  const shareId = body?.share?.trim();
  const at = body?.at?.trim();
  const text = body?.text?.trim();
  if (!shareId || !at || !text) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  if (!chatStoreAvailable()) {
    return NextResponse.json({ error: "Messaging needs the private store connected." }, { status: 503 });
  }
  const who = await sideFor(shareId);
  if (!who) return NextResponse.json({ error: "That link is not active." }, { status: 404 });

  const limited = await rateLimit(`companion-edit:${who.chatKey}`, { limit: 30, windowSeconds: 3600 });
  if (!limited.ok) {
    return NextResponse.json({ error: "That is a lot of edits at once — try again shortly." }, { status: 429 });
  }

  // editMessageText itself re-checks who sent the original — `by` here is
  // only ever this request's own verified side, never anything the body says.
  const messages = await editMessageText(who.chatKey, at, who.side, text.slice(0, MAX_CHAT_TEXT));
  if (!messages) return NextResponse.json({ error: "That message can't be changed." }, { status: 404 });
  return NextResponse.json({ messages, side: who.side });
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { share?: string; at?: string } | null;
  const shareId = body?.share?.trim();
  const at = body?.at?.trim();
  if (!shareId || !at) return NextResponse.json({ error: "Which message?" }, { status: 400 });
  if (!chatStoreAvailable()) {
    return NextResponse.json({ error: "Messaging needs the private store connected." }, { status: 503 });
  }
  const who = await sideFor(shareId);
  if (!who) return NextResponse.json({ error: "That link is not active." }, { status: 404 });

  const messages = await deleteMessage(who.chatKey, at, who.side);
  if (!messages) return NextResponse.json({ error: "That message can't be deleted." }, { status: 404 });
  return NextResponse.json({ messages, side: who.side });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as
    | {
        share?: string;
        text?: string;
        dataUrl?: string;
        lat?: number;
        lng?: number;
        address?: string;
        label?: string;
        replyToAt?: string;
        typing?: boolean;
        itineraryRef?: string;
      }
    | null;
  const shareId = body?.share?.trim();
  if (!shareId) return NextResponse.json({ error: "Which trip?" }, { status: 400 });
  if (!chatStoreAvailable()) {
    return NextResponse.json({ error: "Messaging needs the private store connected." }, { status: 503 });
  }
  // The link itself is the credential: who this is (advisor or client) is read
  // from it and the session, never from the body — so a picture or a place can
  // only be added to a thread by somebody who genuinely holds that trip's link.
  const who = await sideFor(shareId);
  if (!who) return NextResponse.json({ error: "That link is not active." }, { status: 404 });

  // "I am typing" — a courtesy signal, not a message. No rate limit: it is
  // one cheap Redis SET, the composer already throttles how often it sends
  // one, and the same-origin and plan checks above are the fence that matters.
  if (body?.typing === true) {
    await setTyping(who.chatKey, who.side);
    return NextResponse.json({ ok: true });
  }

  // A reply quotes a real message in THIS thread — looked up and re-built
  // server-side (quoteFor), never taken as whatever text the client sent
  // alongside replyToAt. A stale or made-up `at` just means the message goes
  // out as an ordinary one rather than failing the whole send over it.
  const replyTo = typeof body?.replyToAt === "string" && body.replyToAt ? await quoteFor(who.chatKey, body.replyToAt) : undefined;

  // "Ask about this day" / "Ask to move this" — a short label naming the
  // itinerary item the thread was opened from, carried on the one message it
  // rides in with rather than jammed into the words themselves.
  const itineraryRef =
    typeof body?.itineraryRef === "string" && body.itineraryRef.trim()
      ? body.itineraryRef.trim().slice(0, MAX_CHAT_LABEL)
      : undefined;

  // A picture, a video, or a voice note. Rate limited BEFORE the work, because
  // this is the one message a client with no account can push real bytes with
  // — the fence matters more than the feature. Which kind it is comes from the
  // data URL's own declared type, never from a separate field the caller
  // could mismatch.
  if (typeof body?.dataUrl === "string" && body.dataUrl) {
    // parseChatDataUrl tolerates a codec parameter (audio/webm;codecs=opus) and
    // returns the base content type — see lib/chat-media.ts, tested there.
    const parsed = parseChatDataUrl(body.dataUrl);
    if (!parsed) return NextResponse.json({ error: "Share a photo, a video, a voice note or a PDF." }, { status: 400 });
    const { contentType, base64 } = parsed;
    const media = mediaKindFor(contentType);
    if (!media) {
      return NextResponse.json(
        { error: "Use a JPG, PNG or WEBP picture, an MP4, MOV or WEBM video, a recorded voice note, or a PDF document." },
        { status: 400 },
      );
    }
    if (!media.available()) {
      return NextResponse.json({ error: `Sharing a ${NOUN_FOR[media.kind]} needs the private store connected.` }, { status: 503 });
    }

    const limited = await rateLimit(`companion-${media.kind}:${who.chatKey}`, {
      limit: RATE_LIMIT_FOR[media.kind],
      windowSeconds: 3600,
    });
    if (!limited.ok) {
      return NextResponse.json({ error: "That is a lot at once — try again shortly." }, { status: 429 });
    }

    const bytes = Math.floor((base64.length * 3) / 4);
    if (bytes > media.limit) {
      return NextResponse.json(
        { error: `That ${NOUN_FOR[media.kind]} is too large (max ${Math.round(media.limit / 1024 / 1024)} MB).` },
        { status: 413 },
      );
    }
    const id = await putMedia(contentType, base64);
    if (!id) return NextResponse.json({ error: `Could not save the ${NOUN_FOR[media.kind]}.` }, { status: 503 });
    const messages = await appendChat(who.chatKey, {
      from: who.side,
      kind: media.kind,
      text: (body.text ?? "").trim().slice(0, MAX_CHAT_LABEL),
      mediaId: id,
      at: new Date().toISOString(),
      replyTo,
      itineraryRef,
    });
    return NextResponse.json({ messages, side: who.side });
  }

  // A place — the sender's current spot, for "I am here, where do I go now".
  if (typeof body?.lat === "number" && typeof body?.lng === "number") {
    if (!Number.isFinite(body.lat) || !Number.isFinite(body.lng) || Math.abs(body.lat) > 90 || Math.abs(body.lng) > 180) {
      return NextResponse.json({ error: "That location did not look right." }, { status: 400 });
    }
    const messages = await appendChat(who.chatKey, {
      from: who.side,
      kind: "location",
      text: (body.label ?? "").trim().slice(0, MAX_CHAT_LABEL),
      lat: body.lat,
      lng: body.lng,
      at: new Date().toISOString(),
      replyTo,
      itineraryRef,
    });
    return NextResponse.json({ messages, side: who.side });
  }

  // A place from the itinerary itself — the hotel, the activity, the eatery
  // — shared by its own address rather than a device fix, so an advisor can
  // send where something IS instead of only where they happen to be standing.
  if (typeof body?.address === "string" && body.address.trim()) {
    const messages = await appendChat(who.chatKey, {
      from: who.side,
      kind: "location",
      text: (body.label ?? "").trim().slice(0, MAX_CHAT_LABEL),
      address: body.address.trim().slice(0, MAX_CHAT_LABEL),
      at: new Date().toISOString(),
      replyTo,
      itineraryRef,
    });
    return NextResponse.json({ messages, side: who.side });
  }

  // Words.
  const text = body?.text?.trim();
  if (!text) return NextResponse.json({ error: "Nothing to send." }, { status: 400 });
  const messages = await appendChat(who.chatKey, {
    from: who.side,
    kind: "text",
    text: text.slice(0, MAX_CHAT_TEXT),
    at: new Date().toISOString(),
    replyTo,
    itineraryRef,
  });
  return NextResponse.json({ messages, side: who.side });
}
