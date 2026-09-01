import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { codeOf } from "./helpers/source";

const START = codeOf("scripts/start.mjs");
const RAILWAY = JSON.parse(readFileSync("railway.json", "utf8"));
const PACKAGE = JSON.parse(readFileSync("package.json", "utf8"));

/**
 * A deploy is not a crash.
 *
 * Railway replaces a deployment by starting the new container and sending
 * SIGTERM to the old one. `next start` installs no handler, so the process was
 * killed BY the signal — exit 143, which Railway reads as a crash and emails
 * about. Several "Deploy Crashed!" emails a day, on both services, with
 * nothing wrong.
 */

describe("the server stops on purpose", () => {
  it("the container's entry is the wrapper, not npm and not next", () => {
    // Measured: the process Railway signals is the one whose exit code counts.
    // npm dies from SIGTERM (143) and so does next; only the wrapper exits 0.
    assert.equal(RAILWAY.deploy.startCommand, "node scripts/start.mjs");
    assert.equal(PACKAGE.scripts.start, "node scripts/start.mjs");
  });

  it("the start command lives in the repo, not in the dashboard", () => {
    // The whole point of putting it in railway.json: package.json and the
    // deploy config are reviewed together, so they cannot drift apart.
    assert.ok(RAILWAY.deploy.startCommand, "railway.json must own the start command");
  });

  it("it takes the signal, passes it on, and exits cleanly", () => {
    assert.match(START, /process\.on\(signal/);
    assert.match(START, /next\.kill\(signal\)/);
    assert.match(START, /if \(stopping\) process\.exit\(0\)/);
  });

  it("a real failure is still reported as one", () => {
    // Verified by running it against an occupied port: exit 1, not 0. If this
    // ever returns 0 for an unasked-for exit, the crash alarm is gone and
    // nobody will notice until something is actually broken.
    assert.match(START, /if \(signal\) \{/);
    assert.match(START, /process\.exit\(1\)/);
    assert.match(START, /process\.exit\(code \?\? 0\)/);
  });

  it("it cannot hold a deploy open past the platform's patience", () => {
    // railway.json allows 30s before SIGKILL; the grace must stay inside it.
    const grace = Number(/const GRACE_MS = ([\d_]+)/.exec(START)?.[1].replace(/_/g, ""));
    assert.ok(grace > 0 && grace < RAILWAY.deploy.drainingSeconds * 1000, `grace ${grace}ms vs drain ${RAILWAY.deploy.drainingSeconds}s`);
  });

  it("the shutdown is not attempted from instrumentation, which is the wrong process", () => {
    // instrumentation.ts is real here and stays — it starts the in-process trip
    // schedulers. But `next start` runs it in the SERVER CHILD, and the signal
    // goes to the parent, so a handler registered there would never fire. It
    // was tried in the sibling repository, measured, and removed.
    const instrumentation = readFileSync("instrumentation.ts", "utf8");
    assert.doesNotMatch(instrumentation, /SIGTERM|SIGINT/, "shutdown belongs in scripts/start.mjs, not here");
  });
});
