import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  accountCookieName,
  createTrip,
  deleteTrip,
  duplicateTrip,
  ensureTripShare,
  getCurrentAccountData,
  getTrips,
  withLinkOpens,
  importTrip,
  renameTrip,
  setTripAdvisor,
  setTripAutoReminders,
  setTripClient,
  setTripCommission,
  stopTripShare,
  switchTrip,
} from "@/lib/account-store";
import { mayServeCompanionClients, mayViewPipelineAnalytics } from "@/lib/account-limits";
import { PLAN_LABELS } from "@/lib/account-plans";
import { getPlan } from "@/lib/account-plan-store";
import { sameOrigin } from "@/lib/secure-access";
import type { Itinerary } from "@/data/itinerary";

export const dynamic = "force-dynamic";

async function signedInEmail() {
  const cookieStore = await cookies();
  const account = await getCurrentAccountData(cookieStore.get(accountCookieName())?.value);
  return account?.email ?? null;
}

export async function GET() {
  const email = await signedInEmail();
  if (!email) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  // withLinkOpens rather than getTrips: this is the read the sharing panel and
  // the trip list draw their "opened / not opened yet" line from, and the
  // status has to be worked out on the server (the trip's own timezone comes
  // from coordinates that never leave it).
  const trips = await withLinkOpens(email);
  return NextResponse.json({ trips, activeId: trips.find((t) => t.active)?.id ?? null });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  }
  const email = await signedInEmail();
  if (!email) return NextResponse.json({ error: "Please log in first." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | {
        action?: string;
        id?: string;
        name?: string;
        client?: string;
        advisor?: string;
        itinerary?: Itinerary;
        commissionCents?: number | null;
        commissionCurrency?: string;
        autoReminders?: boolean;
      }
    | null;

  switch (body?.action) {
    case "create": {
      const result = await createTrip(email, body.name);
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    case "import": {
      // Adding a shared trip. It becomes a trip of its own; nothing already in
      // the account is touched.
      if (!body.itinerary) return NextResponse.json({ ok: false, error: "Nothing to add." }, { status: 400 });
      const result = await importTrip(email, body.itinerary, body.name);
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    case "rename": {
      if (!body.id) return NextResponse.json({ ok: false, error: "Name the trip." }, { status: 400 });
      const result = await renameTrip(email, body.id, body.name ?? "");
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    case "switch": {
      if (!body.id) return NextResponse.json({ ok: false, error: "Name the trip." }, { status: 400 });
      const result = await switchTrip(email, body.id);
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    case "client": {
      // Naming who a trip is for is part of handing a trip to a client at
      // all — Advisor Starter and up, the same door as the client-serving
      // capability itself (AGENTS.md: "naming a client, sending it, and
      // creating a client code all need Advisor Starter or Advisor Pro").
      // Checked here rather than only in the panel, because a hidden field
      // is not a closed door.
      if (!body.id) return NextResponse.json({ ok: false, error: "Name the trip." }, { status: 400 });
      if (!mayServeCompanionClients(await getPlan(email))) {
        return NextResponse.json(
          { ok: false, error: `Planning trips for named clients is part of ${PLAN_LABELS.starter} and up.` },
          { status: 403 },
        );
      }
      const result = await setTripClient(email, body.id, body.client ?? "");
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    case "advisor": {
      // The agent the client is dealing with — the name the trip carries, shown
      // in the app. Same door as naming the client, above.
      if (!body.id) return NextResponse.json({ ok: false, error: "Name the trip." }, { status: 400 });
      if (!mayServeCompanionClients(await getPlan(email))) {
        return NextResponse.json(
          { ok: false, error: `Putting an advisor on a trip is part of ${PLAN_LABELS.starter} and up.` },
          { status: 403 },
        );
      }
      const result = await setTripAdvisor(email, body.id, body.advisor ?? "");
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    case "auto-reminders": {
      // Automatic "you're leaving soon" / "a balance is still due" messages
      // to the CLIENT — same door as naming one, above: this only exists on
      // a trip that can be handed to a client at all.
      if (!body.id) return NextResponse.json({ ok: false, error: "Name the trip." }, { status: 400 });
      if (!mayServeCompanionClients(await getPlan(email))) {
        return NextResponse.json(
          { ok: false, error: `Automatic reminders are part of ${PLAN_LABELS.starter} and up.` },
          { status: 403 },
        );
      }
      const result = await setTripAutoReminders(email, body.id, Boolean(body.autoReminders));
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    case "commission": {
      // The advisor's own record of what a trip earned them — the same
      // Pro-only door as the pipeline's business-at-a-glance numbers, since
      // this is business bookkeeping rather than something a traveler
      // planning their own trip has any reason to see.
      if (!body.id) return NextResponse.json({ ok: false, error: "Name the trip." }, { status: 400 });
      if (!mayViewPipelineAnalytics(await getPlan(email))) {
        return NextResponse.json(
          { ok: false, error: `Recording commission is part of ${PLAN_LABELS.pro}.` },
          { status: 403 },
        );
      }
      // Both undefined (the field left off entirely) and null clear the
      // amount — only an actual number is validated as one.
      const cents = body.commissionCents ?? null;
      if (cents !== null && (!Number.isFinite(cents) || cents < 0)) {
        return NextResponse.json({ ok: false, error: "That doesn't look like an amount." }, { status: 400 });
      }
      const result = await setTripCommission(email, body.id, cents, body.commissionCurrency ?? "USD");
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    case "share":
    case "unshare": {
      // The client's per-trip code, locked to this one trip. Advisor Starter
      // and up: handing a trip to a client is the client-serving capability
      // (mayServeCompanionClients), even though the app it opens is now every
      // paid plan (companionApp). One Trip uses the app for its own trip;
      // only Starter and up creates a code to send a client.
      if (!body.id) return NextResponse.json({ ok: false, error: "Name the trip." }, { status: 400 });
      if (!mayServeCompanionClients(await getPlan(email))) {
        return NextResponse.json(
          { ok: false, error: `Handing a trip to a client is part of ${PLAN_LABELS.starter} and up.` },
          { status: 403 },
        );
      }
      if (body.action === "unshare") {
        const ok = await stopTripShare(email, body.id);
        if (!ok) return NextResponse.json({ ok: false, error: "Could not stop that." }, { status: 400 });
      } else if (!(await ensureTripShare(email, body.id))) {
        return NextResponse.json({ ok: false, error: "Could not create the link." }, { status: 503 });
      }
      const trips = await getTrips(email);
      return NextResponse.json({ ok: true, trips });
    }
    case "duplicate": {
      if (!body.id) return NextResponse.json({ ok: false, error: "Name the trip." }, { status: 400 });
      const result = await duplicateTrip(email, body.id);
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    case "delete": {
      if (!body.id) return NextResponse.json({ ok: false, error: "Name the trip." }, { status: 400 });
      const result = await deleteTrip(email, body.id);
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    default:
      return NextResponse.json({ ok: false, error: "Say what to do with the trip." }, { status: 400 });
  }
}
