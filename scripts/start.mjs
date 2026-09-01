/**
 * Starting the server so that a normal shutdown is a normal shutdown.
 *
 * THE PROBLEM THIS SOLVES. Railway replaces a deployment by starting the new
 * container and then sending SIGTERM to the old one. `next start` installs no
 * SIGTERM handler, so the process was killed BY the signal: it died in about
 * 20ms with exit code 143. A signal death is a non-zero exit, and a non-zero
 * exit is how Railway recognises a crash — so every ordinary deploy ended with
 * "Deploy Crashed!" in the owner's inbox, on both services, several times a
 * day. The site was never down; the emails were the previous container's
 * ordinary end, misread as a fault.
 *
 * WHAT WAS RULED OUT FIRST, so nobody re-treads it:
 *   - Not memory or CPU. Peak 1.18GB against an 8GB limit, CPU near idle.
 *   - Not a crash loop. Each container logged one start and ran for as long as
 *     it was the live one — 86 minutes, in the case checked.
 *   - Not the npm wrapper, which was the obvious suspect because the log says
 *     `npm error signal SIGTERM`. Measured both ways: `npm start` and the next
 *     binary directly BOTH exited 143. Moving the start command would have
 *     changed the log and not the outcome.
 *   - Not solvable from instrumentation.ts: `next start` runs the server in a
 *     child process, so a handler registered there is in the wrong process —
 *     the signal goes to the CLI parent. Tried, measured, removed.
 *
 * WHAT THIS DOES. It is the parent process, so it is what Railway signals. It
 * passes the signal down to Next, gives it a moment to finish what it is
 * answering, and exits 0 — a deliberate stop rather than a killed process.
 *
 * A REAL CRASH IS STILL A REAL CRASH. If Next exits on its own, its exit code
 * is passed through untouched, so a genuine failure still exits non-zero and
 * Railway still raises it. This makes the false alarm quiet without muting the
 * true one — which is the whole reason for doing it here rather than turning
 * off the notification.
 */

import { spawn } from "node:child_process";

/**
 * How long Next gets after the signal before this gives up waiting.
 *
 * railway.json sets drainingSeconds to 30, which is the point at which the
 * platform stops asking and sends SIGKILL. Staying well inside that keeps a
 * deploy quick: the old container should be gone in about a second, not
 * holding the deploy open for half a minute.
 */
const GRACE_MS = 5_000;

const next = spawn("./node_modules/.bin/next", ["start"], { stdio: "inherit" });

/** Set once a signal has been passed on, so the child's exit is read as ours. */
let stopping = false;

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    // A second signal means the platform is done waiting; so are we.
    if (stopping) process.exit(0);
    stopping = true;
    next.kill(signal);
    // If Next has not gone by the time the grace runs out, leave anyway: a
    // container that will not exit is worse than one that exits early.
    setTimeout(() => process.exit(0), GRACE_MS).unref();
  });
}

next.on("exit", (code, signal) => {
  // Asked to stop, and it stopped: that is a success, however it went.
  if (stopping) process.exit(0);
  // Otherwise Next fell over on its own. Pass the failure on so the platform
  // reports it — this is the alarm worth keeping.
  if (signal) {
    console.error(`[start] next exited on ${signal} without being asked to.`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});

next.on("error", (error) => {
  console.error("[start] could not start next:", error);
  process.exit(1);
});
