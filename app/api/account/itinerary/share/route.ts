import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/secure-access";
import {
  accountCookieName,
  ensureItineraryShare,
  getCurrentAccountData,
  getItineraryShareState,
  stopItineraryShare,
} from "@/lib/account-store";

export const dynamic = "force-dynamic";

function shareUrl(request: NextRequest, shareId: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || request.nextUrl.origin;
  return `${base}/i/${shareId}`;
}

async function requireAccount() {
  const cookieStore = await cookies();
  return getCurrentAccountData(cookieStore.get(accountCookieName())?.value);
}

// Current share state (link + collaborators) for the signed-in traveler's trip.
export async function GET(request: NextRequest) {
  const account = await requireAccount();
  if (!account) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const state = await getItineraryShareState(account.email);
  return NextResponse.json({
    shareId: state.shareId ?? null,
    url: state.shareId ? shareUrl(request, state.shareId) : null,
    collaborators: state.collaborators,
  });
}

// Create (or return) the public share link for the traveler's trip.
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  const account = await requireAccount();
  if (!account) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const shareId = await ensureItineraryShare(account.email);
  if (!shareId) return NextResponse.json({ error: "Could not create the share link." }, { status: 503 });
  return NextResponse.json({ shareId, url: shareUrl(request, shareId) });
}

// Stop sharing: remove the public link and all collaborator access.
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  const account = await requireAccount();
  if (!account) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  await stopItineraryShare(account.email);
  return NextResponse.json({ ok: true });
}
