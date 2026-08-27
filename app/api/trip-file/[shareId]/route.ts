import { NextRequest, NextResponse } from "next/server";
import { getAttachmentFor } from "@/lib/attachment-store";
import { getSharedItineraryByShareId } from "@/lib/account-store";
import { sharedAttachmentIds } from "@/lib/attachments";
import { rateLimit, requesterKey, tooManyMessage } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * A boarding pass, for the person actually boarding.
 *
 * WHY THIS EXISTS AT ALL. Attachments are served only to the account that
 * uploaded them, which is right for somebody planning their own trip and wrong
 * for every trip an adviser plans: the adviser attaches the pass, and the
 * client — the one standing at the gate — could not open it. This is the one
 * door out of that account, and it is a narrow one.
 *
 * THREE THINGS ARE CHECKED, AND ALL THREE HAVE TO HOLD. The code must be a
 * real share token; the file must be referenced by THAT trip's own itinerary;
 * and the adviser must have marked that file shared. A token opens the trip it
 * belongs to and nothing else, so a file on somebody else's trip is not
 * reachable even with a valid code, and a file the adviser kept internal is
 * not reachable even on the right trip.
 *
 * THE OWNER IS WHO THE STORE IS ASKED AS. The file belongs to the adviser's
 * account, and getAttachmentFor checks that owner — so this route hands it the
 * owner it just resolved from the token rather than trusting anything in the
 * request. Nothing here can be pointed at another account's files.
 *
 * THE SAME ANSWER FOR "NOT THERE" AND "NOT YOURS", so asking tells nobody
 * whether a document exists.
 */

const LIMIT = { limit: 30, windowSeconds: 60 };

export async function GET(request: NextRequest, { params }: { params: Promise<{ shareId: string }> }) {
  const flood = await rateLimit(`trip-file:${requesterKey(request.headers)}`, LIMIT);
  if (!flood.ok) return NextResponse.json({ error: tooManyMessage(flood.retryAfter) }, { status: 429 });

  const { shareId } = await params;
  const id = request.nextUrl.searchParams.get("id");
  if (!shareId || !id) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const shared = await getSharedItineraryByShareId(shareId);
  if (!shared) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // The itinerary this hands back has already had everything unshared removed,
  // so this set is exactly the files the traveler was given.
  if (!sharedAttachmentIds(shared.itinerary).has(id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const file = await getAttachmentFor(id, shared.ownerEmail);
  if (!file) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const buffer = Buffer.from(file.data, "base64");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": file.contentType || "application/octet-stream",
      // Never cached by anything in between, and never left on a shared
      // phone's disk — the same handling the account's own route gives it.
      "cache-control": "private, no-store, max-age=0",
      "content-disposition": `inline; filename="${file.name.replace(/["\\\r\n]/g, "")}"`,
      "x-content-type-options": "nosniff",
      // A PDF that could run script would run it on this origin. Nothing in a
      // boarding pass needs to.
      "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      "referrer-policy": "no-referrer",
      // A trip link is not a search result and neither is a pass behind it.
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
