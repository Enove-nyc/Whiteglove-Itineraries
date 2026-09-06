import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * How this site is deployed, and the setting that took two attempts to find.
 *
 * Every single deployment sends a "Deploy Crashed!" email while the site never
 * goes down.
 *
 * THE FIRST EXPLANATION WAS WRONG, and it is left here because it was
 * plausible and somebody will think of it again. The service mounts a volume —
 * lib/media.ts keeps uploaded adverts and portraits on it — and a volume can
 * only be mounted by one container, so a new container reaching for a volume
 * the old one still held would fail and be reported as crashed.
 * overlapSeconds: 0 stops the old container first and made no difference: the
 * next deployment emailed a crash exactly as before.
 *
 * WHAT IT ACTUALLY LOOKS LIKE. Railway's drainingSeconds is the time between
 * sending the previous deploy a SIGTERM and sending it a SIGKILL. A process
 * that is killed does not exit zero — it exits 137 — and a container exiting
 * 137 on every release is a crash as far as the platform is concerned, whether
 * or not the release worked. Nothing about the new deployment is wrong; it is
 * the old one's death being reported.
 *
 * Next's own self-hosting guide asks for this directly: on SIGTERM the server
 * finishes in-flight requests and runs pending after() callbacks before
 * exiting, and it says platforms should allow ten to thirty seconds to do it.
 * Nothing was allowing any. Thirty seconds is the top of their range, because
 * the cost of being generous is a slower release and the cost of being mean is
 * a killed process halfway through answering somebody.
 */
const config = JSON.parse(readFileSync("railway.json", "utf8")) as {
  deploy?: Record<string, unknown>;
};

describe("the deploy configuration", () => {
  it("GIVES THE OLD CONTAINER TIME TO DIE OF ITS OWN ACCORD", () => {
    // Killed, it exits 137 and the platform calls that a crash. Next asks for
    // ten to thirty seconds to finish in-flight requests and pending after()
    // callbacks.
    const draining = Number(config.deploy?.drainingSeconds);
    assert.ok(draining >= 10, `drainingSeconds is ${draining}; Next's guide asks for at least ten`);
  });

  it("does not overlap containers, because this service has a volume", () => {
    // A volume mounts to one container at a time. This did not stop the crash
    // notices — see the note above — but it is still the right setting for a
    // service that cannot run two copies of itself.
    assert.equal(config.deploy?.overlapSeconds, 0);
  });

  it("health-checks READINESS, not merely a page that renders", () => {
    // /version returns 200 with the database unreachable and the schema years
    // behind this build, so Railway called a deploy healthy and moved traffic
    // onto a container that could not answer an account request. /api/health
    // answers 503 when the schema is older than the migrations this build
    // ships — see lib/readiness.ts.
    assert.equal(config.deploy?.healthcheckPath, "/api/health");
  });

  it("and that path answers THROUGH the site lock, or every deploy fails", () => {
    // Railway calls the health path before it moves traffic. A locked site
    // that redirected it would fail every deploy while the site itself was
    // perfectly fine — which is why /version was allowed through, and why its
    // replacement has to be too.
    const middleware = readFileSync("middleware.ts", "utf8");
    assert.match(middleware, /pathname === "\/api\/health"/);
  });

  it("restarts a container that genuinely fails, a bounded number of times", () => {
    assert.equal(config.deploy?.restartPolicyType, "ON_FAILURE");
    assert.ok(Number(config.deploy?.restartPolicyMaxRetries) > 0);
  });

  it("keeps the volume's reason for existing findable from here", () => {
    // If media ever stops using the disk, the volume can go and this file's
    // whole justification with it.
    const media = readFileSync("lib/media.ts", "utf8");
    assert.match(media, /\/data\/media/);
  });
});
