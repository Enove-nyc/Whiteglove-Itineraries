import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  accountCookieName,
  deleteCommissionRecord,
  getBalance,
  getCommissions,
  getCurrentAccountData,
  getTripItinerary,
  listCommissionSummaries,
  resolveBusinessOwner,
  saveCommissionRecord,
} from "@/lib/account-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { getPlan } from "@/lib/account-plan-store";
import { sameOrigin } from "@/lib/secure-access";
import type { CommissionRecord } from "@/data/trip-commission";

export const dynamic = "force-dynamic";

const MAX_FIELD = 300;

async function ownerFor(): Promise<{ email: string } | { error: string; status: number }> {
  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountData(cookie);
  if (!account?.email) return { error: "Please log in first.", status: 401 };
  const owner = await resolveBusinessOwner(account.email);
  if (!mayServeCompanionClients(await getPlan(owner))) {
    return { error: "Commission tracking is part of a Business account.", status: 403 };
  }
  return { email: owner };
}

/**
 * Without a ?trip=, the agency-wide rollup (every trip with at least one
 * commission record — see listCommissionSummaries). With one, that trip's
 * own ledger, the same "current trip unless one is named" pattern the
 * payments route uses.
 */
export async function GET(request: NextRequest) {
  const who = await ownerFor();
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });

  const hasTripParam = request.nextUrl.searchParams.has("trip");
  if (!hasTripParam) {
    const summaries = await listCommissionSummaries(who.email);
    return NextResponse.json({ summaries });
  }

  const wanted = request.nextUrl.searchParams.get("trip");
  const trip = await getTripItinerary(who.email, wanted === "current" ? undefined : wanted || undefined);
  if (!trip) return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  const [records, balance] = await Promise.all([getCommissions(who.email, trip.tripId), getBalance(who.email, trip.tripId)]);
  return NextResponse.json({
    tripId: trip.tripId,
    tripName: trip.tripName || trip.itinerary.title || "",
    records,
    // What a NEW commission record will be priced in — the same currency
    // the POST handler below defaults to. Lets the form's own labels say
    // so up front, rather than always showing a "$" that may not match.
    currency: balance?.currency || "USD",
  });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  }
  const who = await ownerFor();
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });

  const body = (await request.json().catch(() => null)) as
    | {
        action?: string;
        tripId?: string;
        id?: string;
        supplier?: string;
        description?: string;
        revenueCents?: number;
        costCents?: number;
        expectedCommissionCents?: number;
        receivedCommissionCents?: number;
        receivedAt?: string;
        notes?: string;
      }
    | null;

  if (!body?.tripId) return NextResponse.json({ error: "Which trip?" }, { status: 400 });
  const trip = await getTripItinerary(who.email, body.tripId);
  if (!trip) return NextResponse.json({ error: "Trip not found." }, { status: 404 });

  if (body.action === "delete") {
    if (!body.id) return NextResponse.json({ error: "Which record?" }, { status: 400 });
    const ok = await deleteCommissionRecord(who.email, trip.tripId, body.id);
    if (!ok) return NextResponse.json({ error: "Could not remove that record." }, { status: 503 });
    return NextResponse.json({ ok: true });
  }

  if (!body.supplier?.trim()) return NextResponse.json({ error: "Which supplier?" }, { status: 400 });
  if ((body.supplier?.length ?? 0) > MAX_FIELD || (body.description?.length ?? 0) > MAX_FIELD || (body.notes?.length ?? 0) > 2000) {
    return NextResponse.json({ error: "One of those fields is too long." }, { status: 400 });
  }
  const toCents = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : 0);

  // Editing an existing record keeps its own currency and creation date —
  // only a new one picks up the trip's current balance currency, the same
  // "preserve what an edit shouldn't touch" rule app/api/account/addons/route.ts
  // already follows for a re-edited add-on.
  const existing = body.id ? (await getCommissions(who.email, trip.tripId)).find((r) => r.id === body.id) : undefined;
  const balance = existing ? null : await getBalance(who.email, trip.tripId);

  const record: CommissionRecord = {
    id: body.id || "",
    supplier: body.supplier.trim(),
    description: body.description?.trim() || undefined,
    revenueCents: toCents(body.revenueCents),
    costCents: toCents(body.costCents),
    expectedCommissionCents: toCents(body.expectedCommissionCents),
    receivedCommissionCents: toCents(body.receivedCommissionCents),
    receivedAt: body.receivedAt?.trim() || undefined,
    currency: existing?.currency ?? balance?.currency ?? "USD",
    notes: body.notes?.trim() || undefined,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const ok = await saveCommissionRecord(who.email, trip.tripId, record);
  if (!ok) return NextResponse.json({ error: "Could not save that record." }, { status: 503 });
  const records = await getCommissions(who.email, trip.tripId);
  return NextResponse.json({ ok: true, records });
}
