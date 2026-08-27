import { NextRequest, NextResponse } from "next/server";
import { runFlightStatusSweep } from "@/lib/cron-tasks";

export const dynamic = "force-dynamic";
// Fans out across every followed trip; give it room past the default budget.
export const maxDuration = 60;

/**
 * A manual or external kick for the background flight sweep — the same work the
 * in-process scheduler (lib/cron-scheduler.ts) runs on a timer, exposed as an
 * endpoint for a one-off run or an outside scheduler.
 *
 * Authenticated by `CRON_SECRET`, the same fail-closed rule the billing webhook
 * follows: not configured means refused. The scheduler itself does NOT come
 * through here — it calls runFlightStatusSweep directly — so a missing secret
 * only disables this manual door, never the timer.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] flight-status endpoint hit but CRON_SECRET is not set.");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const result = await runFlightStatusSweep();
  return NextResponse.json({ ok: true, ...result });
}
