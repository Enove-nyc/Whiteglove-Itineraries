// Runs once when the server starts (see the fork's instrumentation docs). The
// one job here is to start the in-process trip scheduler — the thing that,
// on a persistent Railway container, re-checks flights and sends the daily
// reminders on a timer. Guarded to the Node runtime; the scheduler itself is a
// no-op outside production and if called twice.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startTripSchedulers } = await import("@/lib/cron-scheduler");
  startTripSchedulers();
}
