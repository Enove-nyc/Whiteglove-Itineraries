import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { accountCookieName, getAccountData, getCurrentAccountData, readShareOpens, savePipelineStage, withTrips } from "@/lib/account-store";
import { openStatus, type OpenStatus } from "@/lib/share-opens";
import { tripTimeZone } from "@/lib/trip-timezone";
import { getPlan } from "@/lib/account-plan-store";
import { mayServeCompanionClients, mayViewPipelineAnalytics } from "@/lib/account-limits";
import { readChat, readMarkers } from "@/lib/companion-chat-store";
import { needsAttention, tripStage, type ManualTripStage, type TripStage } from "@/data/trip-pipeline";
import { hasBalance, outstandingCents } from "@/data/trip-payments";
import { sameOrigin } from "@/lib/secure-access";
import { allCrossings } from "@/lib/border-store";
import { borderCostForLegs } from "@/lib/border-legs";
import { readAssumptions } from "@/lib/planner-settings-store";
import { travelDaysFor, type TravelDay } from "@/lib/trip-travel-days";

export const dynamic = "force-dynamic";

export type PipelineRow = {
  id: string;
  name: string;
  client: string;
  advisor: string;
  startDate: string;
  endDate: string;
  stage: TripStage;
  needsAttention: boolean;
  shareId?: string;
  /** True when the client's last word in the thread hasn't been read yet. */
  unread: boolean;
  /** Whether the client has opened the trip link, and when. Only when shared. */
  openStatus?: OpenStatus;
  updatedAt: string;
  /** What this trip still owes, when a balance has actually been set up. */
  outstandingCents?: number;
  currency?: string;
  /**
   * Only present for a trip in the "traveling" stage — the day-by-day shape
   * needed to say where this client is right now, on the advisor's own
   * screen. Left off every other row: computing it costs a driving-time
   * pass over the whole itinerary, and a trip that has not started yet has
   * nothing to say about "now".
   */
  travelDays?: TravelDay[];
  /**
   * What the advisor recorded earning on this trip — Advisor Pro only, the
   * same door as the business-at-a-glance strip itself. Left off the
   * response entirely for Starter rather than merely hidden client-side.
   */
  commissionCents?: number;
  commissionCurrency?: string;
};

/**
 * The planner's whole business, one row per trip/client — the Planner CRM /
 * Trip Pipeline. Reads three things that already exist rather than keeping a
 * fourth in sync with them: each trip's own proposal status, its own dates,
 * and its chat thread's read marker (lib/companion-chat-store.ts, the same
 * one the advisor inbox already reads). ADVISOR STARTER AND UP, same door as
 * the client inbox and the proposal/library/form pages — One Trip has the
 * app for its own one trip and no clients to run a pipeline of.
 */
export async function GET() {
  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountData(cookie);
  if (!account?.email) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const plan = await getPlan(account.email);
  if (!mayServeCompanionClients(plan)) {
    return NextResponse.json({ error: "The trip pipeline is part of Advisor Starter and up." }, { status: 403 });
  }
  // The business-at-a-glance numbers strip is Advisor Pro only — everything
  // else on this response (the rows themselves) is the same for Starter.
  const showAnalytics = mayViewPipelineAnalytics(plan);

  const data = await getAccountData(account.email);
  const { trips } = withTrips(data);
  const today = new Date().toISOString().slice(0, 10);

  // Read once, not once per traveling trip — border settings are the
  // business's own, not one trip's. See app/i/[shareId]/page.tsx, which
  // reads the same two things for the same reason.
  const [crossings, assume] = await Promise.all([allCrossings(), readAssumptions()]);
  const borderCost = borderCostForLegs(crossings, today, assume.borderAllowanceMins);

  const rows: PipelineRow[] = await Promise.all(
    trips.map(async (t) => {
      let unread = false;
      // Whether the client has opened the trip link at all — a different
      // question from whether they have written, and the one an advisor asks
      // first. Read on the same pass, and only for a trip that has a link.
      let opened: OpenStatus | undefined;
      if (t.shareId) {
        const [messages, markers, opens] = await Promise.all([
          readChat(t.shareId),
          readMarkers(t.shareId),
          readShareOpens(t.shareId).catch(() => ({})),
        ]);
        const last = messages[messages.length - 1];
        unread = Boolean(last && last.from === "client" && (!markers.advisor || last.at > markers.advisor));
        opened = openStatus(opens, new Date().toISOString(), tripTimeZone(t.itinerary));
      }
      const stage = tripStage(
        { pipelineStage: t.pipelineStage, proposal: t.proposal, startDate: t.itinerary?.startDate, endDate: t.itinerary?.endDate },
        today,
      );
      return {
        id: t.id,
        name: t.name,
        client: t.client?.trim() ?? "",
        advisor: t.advisor?.trim() ?? "",
        startDate: t.itinerary?.startDate ?? "",
        endDate: t.itinerary?.endDate ?? "",
        stage,
        needsAttention: needsAttention(t.proposal),
        shareId: t.shareId,
        unread,
        ...(opened ? { openStatus: opened } : {}),
        updatedAt: t.updatedAt,
        ...(t.balance && hasBalance(t.balance) ? { outstandingCents: outstandingCents(t.balance), currency: t.balance.currency } : {}),
        ...(stage === "traveling" && t.itinerary ? { travelDays: travelDaysFor(t.itinerary, borderCost, assume) } : {}),
        ...(showAnalytics && t.commissionCents !== undefined
          ? { commissionCents: t.commissionCents, commissionCurrency: t.commissionCurrency ?? "USD" }
          : {}),
      };
    }),
  );

  return NextResponse.json({ rows, today, showAnalytics });
}

/** Move a trip between "Inquiry" and "Planning" — the only stage a planner sets by hand. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  }
  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountData(cookie);
  if (!account?.email) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  if (!mayServeCompanionClients(await getPlan(account.email))) {
    return NextResponse.json({ error: "The trip pipeline is part of Advisor Starter and up." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { tripId?: string; stage?: string } | null;
  const tripId = body?.tripId?.trim();
  const stage = body?.stage;
  if (!tripId || (stage !== "inquiry" && stage !== "planning")) {
    return NextResponse.json({ error: "Provide a trip and either inquiry or planning." }, { status: 400 });
  }
  const ok = await savePipelineStage(account.email, tripId, stage as ManualTripStage);
  if (!ok) return NextResponse.json({ error: "Could not save that." }, { status: 503 });
  return NextResponse.json({ ok: true });
}
