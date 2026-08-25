import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/secure-access";
import type { Itinerary } from "@/data/itinerary";
import {
  accountCookieName,
  getAccountData,
  getShareOwnerEmail,
  readSessionEmail,
  saveAccountItinerary,
  tripAccessFor,
} from "@/lib/account-store";
import { withoutAttachments } from "@/lib/attachments";

/**
 * Reading and changing a trip that belongs to somebody else.
 *
 * The owner's own trip goes through /api/account/itinerary. This is the door
 * for everybody he has shared it with, and it is a separate door on purpose:
 * the other one answers "is this your account", and this one has to answer
 * "what did its owner say you could do".
 *
 * EVERY ANSWER COMES FROM THE OWNER'S RECORD, READ NOW. Nothing is taken from
 * the request but the share token and the trip itself — no role, no claim about
 * who is asking beyond the signed session cookie. The browser is exactly where
 * somebody would say they were an editor.
 *
 * "NOT YOURS" AND "NOT THERE" GET THE SAME ANSWER. A share token that does not
 * exist and one belonging to a trip nobody shared with you both return 404, so
 * the endpoint cannot be used to find out whose links are real.
 */

async function whoAndWhat(request: NextRequest) {
  const shareId = request.nextUrl.searchParams.get("share")?.trim();
  if (!shareId) return { error: NextResponse.json({ error: "Name the trip." }, { status: 400 }) };

  const cookieStore = await cookies();
  const asker = readSessionEmail(cookieStore.get(accountCookieName())?.value);
  if (!asker) return { error: NextResponse.json({ error: "Please sign in first." }, { status: 401 }) };

  const owner = await getShareOwnerEmail(shareId);
  // The same 404 for a token that does not exist and one that is not yours.
  if (!owner) return { error: NextResponse.json({ error: "That trip is not here." }, { status: 404 }) };

  const access = await tripAccessFor(owner, asker);
  if (!access.canView) return { error: NextResponse.json({ error: "That trip is not here." }, { status: 404 }) };
  return { owner, asker, access };
}

export async function GET(request: NextRequest) {
  const found = await whoAndWhat(request);
  if ("error" in found) return found.error;
  const data = await getAccountData(found.owner);
  return NextResponse.json(
    {
      // Boarding passes and tickets never leave the account they were uploaded
      // to, whatever the role — an editor is somebody helping plan the trip,
      // not somebody who should hold a stranger's booking reference.
      itinerary: data.itinerary ? withoutAttachments(data.itinerary) : null,
      role: found.access.role,
      canComment: found.access.canComment,
      canEdit: found.access.canEdit,
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  const found = await whoAndWhat(request);
  if ("error" in found) return found.error;
  if (!found.access.canEdit) {
    // Said plainly rather than as a 404: they can see the trip, so pretending
    // it is not there would be a lie they can disprove by looking at it.
    return NextResponse.json({ error: "You can look at this trip but not change it." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { itinerary?: Itinerary } | null;
  if (!body?.itinerary) return NextResponse.json({ error: "Provide an itinerary." }, { status: 400 });

  // Saved WITHOUT attachments, because the copy an editor was given had none.
  // Writing back what they hold would strip the owner's own boarding passes
  // off his trip — the one way this feature could destroy something.
  const kept = await getAccountData(found.owner);
  const merged = mergeKeepingAttachments(kept.itinerary, body.itinerary);
  const saved = await saveAccountItinerary(found.owner, merged);
  if (!saved) return NextResponse.json({ error: "Could not save the trip." }, { status: 503 });
  return NextResponse.json({ ok: true });
}

/**
 * The editor's version, with the owner's attachments put back.
 *
 * An editor is served the trip with every boarding pass and ticket stripped
 * out, which is right — and it means what they send back has none either. Save
 * that as-is and the owner's own documents are gone, deleted by somebody who
 * never saw them and did not mean to touch them.
 *
 * So each flight, stay and stop keeps whatever attachments its own record had.
 * An item the editor deleted takes its attachments with it, which is correct:
 * an editor may remove a hotel, and its confirmation goes with the hotel.
 */
function mergeKeepingAttachments(before: Itinerary | undefined, after: Itinerary): Itinerary {
  if (!before) return after;
  const attachmentsById = new Map<string, unknown>();
  for (const list of [before.flights, before.lodging, before.activities]) {
    for (const item of list ?? []) {
      const held = (item as { attachments?: unknown }).attachments;
      if (held) attachmentsById.set(item.id, held);
    }
  }
  const restore = <T extends { id: string }>(items: T[] | undefined): T[] =>
    (items ?? []).map((item) =>
      attachmentsById.has(item.id) ? ({ ...item, attachments: attachmentsById.get(item.id) } as T) : item,
    );
  return {
    ...after,
    flights: restore(after.flights),
    lodging: restore(after.lodging),
    activities: restore(after.activities),
  };
}
