import { NextRequest, NextResponse } from "next/server";
import { runTripReminders } from "@/lib/cron-tasks";

export const dynamic = "force-dynamic";

/**
 * A manual or external kick for the daily client reminders — the same work the
 * in-process scheduler (lib/cron-scheduler.ts) runs on a timer, exposed as an
 * endpoint for a one-off run or an outside scheduler.
 *
 * Authenticated by `CRON_SECRET`: this endpoint sends a message to a real
 * person, so an open door here is spam with the site's name on it. Not
 * configured means refused, the same fail-closed rule the billing webhook
 * follows. The scheduler does NOT come through here — it calls runTripReminders
 * directly — so a missing secret only disables this manual door.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] trip-reminders endpoint hit but CRON_SECRET is not set.");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const result = await runTripReminders(today);
  return NextResponse.json({ ok: true, ...result });
}
