import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/secure-access";
import {
  accountCookieName,
  addItineraryCollaborator,
  getCurrentAccountData,
  removeItineraryCollaborator,
} from "@/lib/account-store";
import { sendItineraryShareEmail } from "@/lib/email";
import { isPhoneIdentity, normalizeIdentity } from "@/lib/identity";
import { currentBrand } from "@/lib/site-brand";
import { type TripRole, shareProblem } from "@/lib/trip-roles";

export const dynamic = "force-dynamic";

function shareUrl(request: NextRequest, shareId: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || request.nextUrl.origin;
  return `${base}/i/${shareId}`;
}

async function requireAccount() {
  const cookieStore = await cookies();
  return getCurrentAccountData(cookieStore.get(accountCookieName())?.value);
}

// Add a person to the signed-in traveler's trip, and email them the link.
//
// Somebody who signed up with a phone number can be added too — they have no
// email to be added by. They simply do not get the "somebody shared a trip with
// you" message; the trip is waiting for them when they next sign in.
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  const account = await requireAccount();
  if (!account) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { email?: string; role?: string } | null;
  const typed = body?.email?.trim();

  // The role is checked here as well as in the browser, and there is no
  // default: whoever is sharing decides what this person can do, once, in
  // front of them. A missing role becoming "editor" through some later
  // refactor is the kind of accident this file exists to prevent.
  const problem = shareProblem({ owner: account.email, person: typed ?? "", role: body?.role });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const person0 = typed as string;
  const role = body?.role as TripRole;

  const result = await addItineraryCollaborator(account.email, person0, role);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const person = normalizeIdentity(person0)?.value ?? person0;
  const url = shareUrl(request, result.shareId);

  // Best-effort email; sharing still succeeds even if the email can't be sent.
  const emailed = isPhoneIdentity(person)
    ? false
    : await sendItineraryShareEmail(person, {
        fromName: account.record.name || account.email,
        url,
        title: account.data.itinerary?.title || "Shared trip",
        siteBrand: await currentBrand(),
      });

  return NextResponse.json({ ok: true, collaborators: result.collaborators, url, emailed });
}

// Remove a person from the trip.
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  const account = await requireAccount();
  if (!account) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const email = request.nextUrl.searchParams.get("email")?.trim();
  if (!email) return NextResponse.json({ error: "Name the person." }, { status: 400 });
  const result = await removeItineraryCollaborator(account.email, email);
  return NextResponse.json({ ok: true, collaborators: result.ok ? result.collaborators : [] });
}
