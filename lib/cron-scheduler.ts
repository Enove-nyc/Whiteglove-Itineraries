import { runFlightStatusSweep, runTripReminders } from "@/lib/cron-tasks";

// The scheduler, for a persistent server.
//
// On Railway the app is one long-running container, not Vercel's per-request
// functions — so the honest scheduler is a timer inside that running server,
// started once at boot from instrumentation.ts. (The vercel.json cron that used
// to drive this does not run on Railway, which is why the daily reminders had
// quietly stopped firing after the move.)
//
// The /api/cron/* routes still exist and call the same task functions, for a
// manual or external kick; this is just the thing that fires them on time
// without anyone asking.

const EVERY_MS = 30 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 60 * 1000;
let started = false;

async function tick(): Promise<void> {
  try {
    await runFlightStatusSweep();
  } catch (error) {
    console.error("[cron] flight-status sweep failed:", error);
  }
  try {
    // Safe to attempt every tick — each reminder is one-shot per trip and only
    // fires on the day it comes due.
    await runTripReminders(new Date().toISOString().slice(0, 10));
  } catch (error) {
    console.error("[cron] trip reminders failed:", error);
  }
}

/**
 * Start the in-process scheduler. Idempotent — a second call is a no-op, so it
 * is safe if register() ever runs more than once. Does nothing off the Node
 * server or outside production, so `next dev` never fires real pushes or spends
 * a flight lookup from a laptop.
 */
export function startTripSchedulers(): void {
  if (started) return;
  if (process.env.NODE_ENV !== "production") return;
  started = true;

  // A moment after boot rather than during it, so startup is not racing a
  // sweep, then every half hour.
  setTimeout(() => void tick(), FIRST_RUN_DELAY_MS);
  const timer = setInterval(() => void tick(), EVERY_MS);
  // The HTTP server keeps the process alive; the timer must not hold it open
  // through a shutdown.
  if (typeof timer.unref === "function") timer.unref();
}
