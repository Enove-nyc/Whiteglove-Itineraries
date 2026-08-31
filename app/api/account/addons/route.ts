import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  accountCookieName,
  deleteAddonItem,
  ensureAddonsShare,
  getAddons,
  getBalance,
  getCurrentAccountData,
  getTripItinerary,
  resolveBusinessOwner,
  saveAddonItem,
} from "@/lib/account-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { getPlan } from "@/lib/account-plan-store";
import { sameOrigin } from "@/lib/secure-access";
import type { AddonItem } from "@/data/trip-addons";

export const dynamic = "force-dynamic";

const MAX_FIELD = 300;

/** The business a staff login is linked to, or the account itself. */
async function signedInEmail() {
  const cookieStore = await cookies();
  const account = await getCurrentAccountData(cookieStore.get(accountCookieName())?.value);
  return account?.email ? resolveBusinessOwner(account.email) : null;
}

/**
 * The planner's own side of trip add-ons: offering one, editing it, removing
 * it, and creating the public link a client answers from. BUSINESS ONLY, the
 * same gate as a proposal or a payment — an add-on exists to be offered to
 * somebody else. The public side a client actually answers from is a
 * separate route (app/api/addons/[shareId]/route.ts) and never reads
 * anything here beyond the one trip's add-ons list.
 */
export async function GET(request: NextRequest) {
  const email = await signedInEmail();
  if (!email) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  // No ?trip= means "whichever trip is open" — the same default every other
  // per-trip route already falls back to.
  const wanted = request.nextUrl.searchParams.get("trip") ?? undefined;
  const trip = await getTripItinerary(email, wanted);
  if (!trip) return NextResponse.json({ error: "No trip to offer add-ons on yet." }, { status: 404 });
  const [items, balance] = await Promise.all([getAddons(email, trip.tripId), getBalance(email, trip.tripId)]);
  return NextResponse.json({
    tripId: trip.tripId,
    tripName: trip.tripName || trip.itinerary.title || "",
    items,
    // What a NEW add-on will be priced in — the same currency saveAddonItem
    // below defaults to. Lets the form's own "Price" label say so up front,
    // rather than always showing a "$" that may not be what gets saved.
    currency: balance?.currency || "USD",
  });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  }
  const email = await signedInEmail();
  if (!email) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  if (!mayServeCompanionClients(await getPlan(email))) {
    return NextResponse.json({ ok: false, error: "Offering trip add-ons is part of a Business account." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        action?: string;
        tripId?: string;
        id?: string;
        name?: string;
        description?: string;
        priceCents?: number;
      }
    | null;
  if (!body?.tripId) return NextResponse.json({ error: "Which trip?" }, { status: 400 });
  const trip = await getTripItinerary(email, body.tripId);
  if (!trip) return NextResponse.json({ error: "Trip not found." }, { status: 404 });

  if (body.action === "delete") {
    if (!body.id) return NextResponse.json({ error: "Which add-on?" }, { status: 400 });
    const ok = await deleteAddonItem(email, trip.tripId, body.id);
    if (!ok) return NextResponse.json({ error: "Could not remove that add-on." }, { status: 503 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "share") {
    const shareId = await ensureAddonsShare(email, trip.tripId);
    if (!shareId) return NextResponse.json({ ok: false, error: "Could not create the link." }, { status: 503 });
    return NextResponse.json({ ok: true, shareId });
  }

  if (!body.name?.trim()) return NextResponse.json({ error: "What's the add-on called?" }, { status: 400 });
  if ((body.name?.length ?? 0) > MAX_FIELD || (body.description?.length ?? 0) > MAX_FIELD) {
    return NextResponse.json({ error: "One of those fields is too long." }, { status: 400 });
  }
  const priceCents = typeof body.priceCents === "number" && Number.isFinite(body.priceCents) && body.priceCents >= 0 ? Math.round(body.priceCents) : 0;
  // Editing an already-answered add-on's name or price doesn't reopen it —
  // only the client's own action changes status, so an edit keeps whatever
  // the client already decided.
  const existing = body.id ? (await getAddons(email, trip.tripId)).find((i) => i.id === body.id) : undefined;
  const balance = existing ? null : await getBalance(email, trip.tripId);

  const item: AddonItem = {
    id: body.id || "",
    name: body.name.trim(),
    description: body.description?.trim() || undefined,
    priceCents,
    currency: existing?.currency ?? balance?.currency ?? "USD",
    status: existing?.status ?? "offered",
    respondedAt: existing?.respondedAt,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const ok = await saveAddonItem(email, trip.tripId, item);
  if (!ok) return NextResponse.json({ error: "Could not save that add-on." }, { status: 503 });
  const items = await getAddons(email, trip.tripId);
  return NextResponse.json({ ok: true, items });
}
