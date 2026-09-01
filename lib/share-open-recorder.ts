import { cookies } from "next/headers";
import { accountCookieName, readSessionEmail, recordShareOpen, resolveBusinessOwner } from "@/lib/account-store";
import { identityKey } from "@/lib/identity";

/**
 * THE ADVISOR'S OWN PREVIEW IS NOT THE CLIENT OPENING IT.
 *
 * This is the whole reason the recorder is a module rather than one line in
 * each page. A status that says "opened" because the advisor checked their own
 * work is worse than no status: it is a signal pointing the wrong way, and the
 * advisor would stop trusting it after the first time. The existing proposal
 * `viewedAt` has exactly that bug — an advisor's "Preview as client" flips a
 * sent proposal to "viewed" — and this deliberately does not repeat it.
 *
 * The session cookie is `path: "/"`, so it already reaches /i and /t; those
 * pages simply never read it. Reading it here costs one cookie parse and, only
 * for a signed-in visitor, one account read.
 *
 * A STAFF LOGIN IS THE SAME SIDE OF THE DESK. resolveBusinessOwner maps a team
 * member to the business whose trips they work on, so a colleague checking the
 * link is not the client either.
 *
 * NOTHING HERE THROWS AND NOTHING HERE BLOCKS. A traveller opening their
 * itinerary on a train must never see an error because a status write failed,
 * so every path swallows its own failure and the page renders regardless.
 */
export async function noteShareOpened(shareId: string, ownerEmail: string): Promise<void> {
  if (!shareId || !ownerEmail) return;
  try {
    const jar = await cookies();
    const viewer = readSessionEmail(jar.get(accountCookieName())?.value);
    if (viewer) {
      if (identityKey(viewer) === identityKey(ownerEmail)) return;
      const worksFor = await resolveBusinessOwner(viewer).catch(() => "");
      if (worksFor && identityKey(worksFor) === identityKey(ownerEmail)) return;
    }
    await recordShareOpen(shareId);
  } catch {
    // Deliberately silent — see the note above.
  }
}
