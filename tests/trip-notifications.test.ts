import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { flightRecheckMs } from "@/data/trip-alerts";

// The notification basics: a flight is re-read more often as it nears
// departure, the background cron is locked to Vercel, and a hand-sent advisor
// alert is the signed-in owner's alone.

describe("flightRecheckMs", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");
  const IMMINENT = 20 * 60 * 1000;
  const RELAXED = 3 * 60 * 60 * 1000;

  it("checks a flight leaving today every twenty minutes", () => {
    assert.equal(flightRecheckMs("2026-10-05", now), IMMINENT);
  });

  it("still counts a flight within a day as imminent", () => {
    assert.equal(flightRecheckMs("2026-10-06", now), IMMINENT);
  });

  it("leaves a flight days out on the relaxed cadence", () => {
    assert.equal(flightRecheckMs("2026-10-08", now), RELAXED);
  });

  it("falls back to the relaxed cadence for an unparseable date", () => {
    assert.equal(flightRecheckMs("whenever", now), RELAXED);
  });
});

describe("the notification wiring keeps the same fences everything else does", () => {
  const CRON = readFileSync("app/api/cron/flight-status/route.ts", "utf8");
  const SEND = readFileSync("app/api/account/alerts/send/route.ts", "utf8");

  it("the background flight check is locked to Vercel's own cron secret", () => {
    assert.match(CRON, /CRON_SECRET/);
    assert.match(CRON, /Not authorized/);
    // Refuses when the secret is not configured, rather than running open.
    assert.match(CRON, /Not configured/);
  });

  it("only checks trips someone is actually following", () => {
    assert.match(CRON, /pushSubscriptions\?\.length/);
  });

  it("a hand-sent advisor alert is same-origin, signed-in, and Advisor-plan only", () => {
    assert.match(SEND, /sameOrigin/);
    assert.match(SEND, /Please log in first/);
    assert.match(SEND, /mayServeCompanionClients/);
    assert.ok(SEND.indexOf("sameOrigin") < SEND.indexOf("Please log in first"));
  });
});
