import { NextRequest, NextResponse } from "next/server";
import { applyAddonClientAction, getSharedAddons } from "@/lib/account-store";
import { sendTripNoteEmail } from "@/lib/email";
import { isPhoneIdentity } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/secure-access";
import { siteOrigin } from "@/lib/seo";

export const dynamic = "force-dynamic";

/**
 * A client's own side of a trip's add-ons — no account, no sign-in, just the
 * link the planner sent. GET reads the list; POST is the only door a client
 * has to answer one (accept or decline) — never more, and refused
 * server-side (lib/account-store.ts) for one already answered or one not on
 * the list.
 *
 * ACCEPTING OR DECLINING NOTIFIES THE PLANNER BY EMAIL, the same
 * fire-and-forget note a proposal action already sends
 * (app/api/proposal/[shareId]/route.ts) — never awaited into the client's
 * response, and never a reason their answer could fail.
 */

export async function GET(_request: NextRequest, { params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const shared = await getSharedAddons(shareId);
  if (!shared) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(shared);
}

async function notifyOwner(ownerEmail: string, tripName: string, name: string, accepted: boolean, request: NextRequest) {
  try {
    if (isPhoneIdentity(ownerEmail)) return; // Nowhere to send it.
    await sendTripNoteEmail(ownerEmail, {
      fromName: "Your client",
      tripTitle: tripName || "the trip",
      note: `${accepted ? "Accepted" : "Declined"} the add-on: ${name}.`,
      // siteOrigin() first, never the request's own Host alone: sameOrigin()
      // lets through a request with no Origin header, so a non-browser client
      // holding the share id could otherwise put its own host into mail the
      // advisor reads as first-party.
      url: new URL("/pipeline", siteOrigin()?.origin || request.nextUrl.origin).toString(),
    });
  } catch {
    // The client's answer is saved. That is the part that mattered.
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ shareId: string }> }) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  }
  const { shareId } = await params;

  const limited = await rateLimit(`addon-action:${shareId}`, { limit: 60, windowSeconds: 3600 });
  if (!limited.ok) return NextResponse.json({ error: "That is a lot at once — try again shortly." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { id?: string; accepted?: boolean } | null;
  if (!body?.id || typeof body.accepted !== "boolean") {
    return NextResponse.json({ error: "Say which add-on, and whether to accept it." }, { status: 400 });
  }

  const result = await applyAddonClientAction(shareId, body.id, body.accepted);
  if (!result) return NextResponse.json({ error: "That didn't go through." }, { status: 400 });
  void notifyOwner(result.ownerEmail, result.tripName, result.addon.name, body.accepted, request);
  return NextResponse.json({ ok: true, items: result.items });
}
