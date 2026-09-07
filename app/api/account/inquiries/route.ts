import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { accountCookieName, createTrip, getCurrentAccountData, setTripClient } from "@/lib/account-store";
import { getPlan } from "@/lib/account-plan-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { sameOrigin } from "@/lib/secure-access";
import { cleanInquiry, summariseInquiry, tripSeedFromInquiry, type Inquiry } from "@/data/inquiries";
import { readInquiries, writeInquiries } from "@/lib/inquiries-store";

export const dynamic = "force-dynamic";

/**
 * An advisor's enquiries — the phone calls that have not become trips yet.
 *
 * ADVISOR STARTER AND UP, the same door as the pipeline they sit on: an
 * enquiry is somebody planning for other people. Everything about what an
 * enquiry IS lives in data/inquiries.ts and is pure; this route only reads,
 * writes and, once, turns one into a trip.
 *
 * STARTING A TRIP COPIES NOTHING TWICE. The trip is created with the
 * enquiry's own summary as its name and the contact as its client — the two
 * things a trip can hold — and the enquiry records which trip it became. Its
 * notes stay on the enquiry, still readable, rather than being pushed into a
 * field on the trip that a client could later see.
 */

async function signedInEmail() {
  const cookieStore = await cookies();
  const account = await getCurrentAccountData(cookieStore.get(accountCookieName())?.value);
  return account?.email ?? null;
}

const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `inq-${Math.random().toString(36).slice(2)}`);

export async function GET() {
  const email = await signedInEmail();
  if (!email) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  if (!mayServeCompanionClients(await getPlan(email))) {
    return NextResponse.json({ error: "Enquiries are part of Advisor Starter and up." }, { status: 403 });
  }
  const inquiries = await readInquiries(email);
  return NextResponse.json({ inquiries, today: new Date().toISOString().slice(0, 10) });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  }
  const email = await signedInEmail();
  if (!email) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  if (!mayServeCompanionClients(await getPlan(email))) {
    return NextResponse.json({ ok: false, error: "Enquiries are part of Advisor Starter and up." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { action?: string; id?: string; inquiry?: unknown } | null;
  const existing = await readInquiries(email);
  const now = new Date().toISOString();

  switch (body?.action) {
    case "save": {
      // An id that is not ours is simply a new record: nothing can be
      // overwritten by guessing, because the list is this account's alone.
      const current = body.id ? existing.find((row) => row.id === body.id) : undefined;
      const id = current?.id ?? newId();
      const cleaned = cleanInquiry(
        { ...(current ?? {}), ...((body.inquiry ?? {}) as object), createdAt: current?.createdAt ?? now },
        id,
        now,
      );
      if (!cleaned) return NextResponse.json({ ok: false, error: "Say who asked." }, { status: 400 });
      // What a trip already decided is not editable from here.
      if (current?.tripId) cleaned.tripId = current.tripId;
      if (current?.status === "converted") cleaned.status = "converted";
      const next = current ? existing.map((row) => (row.id === id ? cleaned : row)) : [...existing, cleaned];
      const saved = await writeInquiries(email, next);
      if (!saved) return NextResponse.json({ ok: false, error: "Could not save the enquiry." }, { status: 500 });
      return NextResponse.json({ ok: true, inquiry: cleaned, inquiries: next });
    }
    case "delete": {
      if (!body.id) return NextResponse.json({ ok: false, error: "Say which enquiry." }, { status: 400 });
      const next = existing.filter((row) => row.id !== body.id);
      const saved = await writeInquiries(email, next);
      if (!saved) return NextResponse.json({ ok: false, error: "Could not delete the enquiry." }, { status: 500 });
      return NextResponse.json({ ok: true, inquiries: next });
    }
    case "start_trip": {
      const inquiry = existing.find((row) => row.id === body.id);
      if (!inquiry) return NextResponse.json({ ok: false, error: "That enquiry is not here." }, { status: 404 });
      if (inquiry.tripId) return NextResponse.json({ ok: true, tripId: inquiry.tripId, inquiries: existing });
      const seed = tripSeedFromInquiry(inquiry);
      const name = summariseInquiry(inquiry) || `${seed.client}'s trip`;
      const created = await createTrip(email, name);
      if (!created.ok) return NextResponse.json({ ok: false, error: created.error }, { status: 400 });
      await setTripClient(email, created.activeId, seed.client);
      const converted: Inquiry = { ...inquiry, status: "converted", tripId: created.activeId, updatedAt: now };
      const next = existing.map((row) => (row.id === inquiry.id ? converted : row));
      await writeInquiries(email, next);
      return NextResponse.json({ ok: true, tripId: created.activeId, inquiries: next });
    }
    default:
      return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  }
}
