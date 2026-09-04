import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { addressedToMailbox, senderAddress, tokenFromRecipients, type MatchedBy, type PendingImport } from "@/data/inbound-import";
import { readImportDataUrl } from "@/data/smart-import-files";
import { isAccountVerified } from "@/lib/account-store";
import { accountForToken, addPending, inboundStoreAvailable } from "@/lib/inbound-import-store";
import { extractSmartImport } from "@/lib/smart-import";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A FORWARDED CONFIRMATION, ARRIVING BY EMAIL.
 *
 * The mail provider parses the message and posts it here. What happens next is
 * exactly what happens when somebody pastes a confirmation into the planner —
 * the same extractor, the same rules, the same review screen — except that it
 * lands on a queue instead of on the screen, because nobody was looking when
 * it arrived.
 *
 * NOTHING IS EVER WRITTEN TO A TRIP HERE. This route cannot add a row: it
 * reads, and it queues. That is the owner's standing rule — never save an
 * imported detail without review — and it matters most on this path, since a
 * forged or mistaken message would otherwise edit somebody's itinerary while
 * they slept.
 *
 * IT TRUSTS THE ADDRESS, NEVER THE SENDER. Routing on From would let anybody
 * who knows an email address put rows on that account's trip; From is not a
 * credential and is trivial to forge. The unguessable token in the recipient
 * address is the credential, and the owner can rotate it.
 *
 * THERE IS A SENDER FALLBACK, AND IT IS NOT A SECOND CREDENTIAL. A message
 * sent to the plain mailbox with no token in it gets its From line looked up
 * against the account list, because people forward from whatever mail app is
 * open — a work address, a phone alias, an old account — and dropping those
 * silently is its own failure. What comes of it is marked "sender": queued
 * against a tighter cap of its own so forged mail cannot crowd out real
 * confirmations, shown on screen as unconfirmed, and still added to nothing
 * until somebody reads it. The address remains the only thing that proves
 * anything; the fallback only decides which queue an unproven message waits in.
 *
 * AND THE FALLBACK ONLY APPLIES TO MAIL ACTUALLY SENT HERE. Without a token,
 * something has to say the message was meant for this site at all, and the
 * only thing that can is the mailbox it was addressed to — otherwise a bounce
 * or a misdirected reply would get its From line resolved to somebody's
 * account. An unverified account is never matched: a stranger must not be
 * able to open a queue by registering an address and never confirming it.
 *
 * AND IT VERIFIES THE PROVIDER'S SIGNATURE FIRST, in the provider's own scheme
 * — see signatureOk. Without that, this URL is an open door: anybody who
 * learns a token could post to it directly. An unsigned deployment refuses
 * everything rather than accepting anything, so a missing secret fails closed.
 */

const MAX_BODY_BYTES = 2 * 1024 * 1024;
/** A confirmation, not a photo album. Extra attachments are ignored, not read. */
const MAX_ATTACHMENTS = 3;

/**
 * Whether the provider really sent this, in the scheme the provider uses.
 *
 * THE FIRST VERSION OF THIS WOULD HAVE REJECTED EVERY REAL DELIVERY. It hashed
 * the raw body alone and compared hex against a `webhook-signature` header.
 * Resend signs with Svix, which is a different scheme in four ways at once: the
 * signed content is `id.timestamp.body`, the key is the BASE64-DECODED part of
 * the secret after `whsec_`, the digest is base64 rather than hex, and the
 * header holds a SPACE-separated list of `v1,<sig>` versions. Any one of those
 * on its own is a silent, permanent rejection — the route fails closed, which
 * is right, so nothing would ever have arrived and nothing would have said why.
 *
 * THE TIMESTAMP IS CHECKED TOO. A signature stays valid for ever on its own, so
 * without this anybody who captured one delivery could replay it indefinitely.
 * Five minutes is Svix's own tolerance.
 *
 * The plain-HMAC scheme is still accepted when there are no Svix headers, so a
 * different provider — or a hand-rolled test post — keeps working.
 */
const REPLAY_TOLERANCE_SECONDS = 5 * 60;

function timingEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function svixOk(raw: string, headers: Headers, secret: string): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signature = headers.get("svix-signature");
  if (!id || !timestamp || !signature) return false;

  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return false;
  if (Math.abs(Date.now() / 1000 - sent) > REPLAY_TOLERANCE_SECONDS) {
    console.warn("[inbound] a message arrived with a timestamp outside the replay window.");
    return false;
  }

  // The key is the base64 payload of the secret, not the secret's characters.
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${raw}`).digest("base64");

  // Space-separated versions; only v1 is this scheme. An unknown version is
  // skipped rather than guessed at.
  return signature
    .split(" ")
    .filter((part) => part.startsWith("v1,"))
    .some((part) => timingEqual(part.slice("v1,".length), expected));
}

function signatureOk(raw: string, headers: Headers, secret: string): boolean {
  if (!secret) return false;
  if (headers.get("svix-signature")) return svixOk(raw, headers, secret);

  // Anything that is not Svix: a plain HMAC of the body, hex, in a header that
  // may carry more than one signature during a secret rotation.
  const header = headers.get("webhook-signature") ?? headers.get("x-signature");
  if (!header) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  return header
    .split(",")
    .map((part) => part.split("=").pop()?.trim() ?? "")
    .some((candidate) => timingEqual(candidate, expected));
}

type InboundMessage = {
  to?: unknown;
  subject?: unknown;
  from?: unknown;
  text?: unknown;
  attachments?: unknown;
};

export async function POST(request: NextRequest) {
  const secret = process.env.INBOUND_EMAIL_SECRET?.trim();
  if (!secret) {
    // Not configured is not the same as forged, and it is the owner's problem
    // rather than the sender's — so it is loud in the log and closed to the world.
    console.error("[inbound] a message arrived but INBOUND_EMAIL_SECRET is not set.");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  if (!inboundStoreAvailable()) {
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "That message is too large." }, { status: 413 });
  }
  if (!signatureOk(raw, request.headers, secret)) {
    return NextResponse.json({ error: "Bad signature." }, { status: 400 });
  }

  let message: InboundMessage;
  try {
    message = JSON.parse(raw) as InboundMessage;
  } catch {
    return NextResponse.json({ error: "Unreadable message." }, { status: 400 });
  }

  const recipients = Array.isArray(message.to) ? message.to.map(String) : [String(message.to ?? "")];
  const from = typeof message.from === "string" ? message.from : "";

  // The address first, and only then the sender — a token that resolves is
  // proof, and nothing about the From line may override it.
  const token = tokenFromRecipients(recipients);
  let account = token ? await accountForToken(token) : "";
  let matchedBy: MatchedBy = "address";

  if (!account && !token && addressedToMailbox(recipients)) {
    const sender = senderAddress(from);
    // A verified account only. Somebody who registered an address and never
    // confirmed it does not get a queue, and so cannot be used to open one.
    if (sender && (await isAccountVerified(sender).catch(() => false))) {
      // Resolved the same way the account screen resolves it — see who() in
      // app/api/account/inbound/route.ts. No staff logins on this deployment,
      // so an account is its own queue.
      account = sender;
      matchedBy = "sender";
    }
  }

  if (!account) {
    // Answered 200 on purpose: a provider retries anything else for days, and
    // a message to an address nobody owns is not a failure to retry.
    console.warn("[inbound] a message arrived that matched no account, by address or sender.");
    return NextResponse.json({ received: true });
  }

  const text = typeof message.text === "string" ? message.text.slice(0, 12_000) : "";
  const attachments = Array.isArray(message.attachments) ? message.attachments.slice(0, MAX_ATTACHMENTS) : [];

  // The attachment first when there is one — a forwarded confirmation's PDF is
  // the document itself, and the email body around it is usually "FYI".
  let file;
  for (const item of attachments) {
    const dataUrl = (item as { dataUrl?: unknown })?.dataUrl;
    if (typeof dataUrl !== "string") continue;
    const read = readImportDataUrl(dataUrl);
    if ("file" in read) {
      file = read.file;
      break;
    }
  }

  if (!text && !file) return NextResponse.json({ received: true });

  const result = await extractSmartImport({ text: text || undefined, file });
  if (result.items.length === 0 && result.warnings.length === 0) {
    // Nothing readable in it. Queuing an empty row would only be something for
    // the planner to dismiss.
    return NextResponse.json({ received: true });
  }

  const entry: PendingImport = {
    id: randomBytes(9).toString("base64url"),
    at: new Date().toISOString(),
    subject: typeof message.subject === "string" ? message.subject.slice(0, 200) : "",
    from: from.slice(0, 200),
    items: result.items,
    warnings: result.warnings,
    matchedBy,
  };
  await addPending(account, entry);
  return NextResponse.json({ received: true });
}
