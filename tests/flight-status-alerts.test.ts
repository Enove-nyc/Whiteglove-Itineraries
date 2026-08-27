import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { alertsFromStatusChange, type FlightStatusSnapshot } from "@/data/trip-alerts";

let seq = 0;
const idFor = () => `alert-${++seq}`;

function snapshot(overrides: Partial<FlightStatusSnapshot> = {}): FlightStatusSnapshot {
  return { flightId: "f1", status: "on-time", checkedAt: "2026-06-01T10:00:00.000Z", ...overrides };
}

describe("do not flood Changes with insignificant updates", () => {
  it("a first-ever on-time reading is not an alert — nothing changed from anything", () => {
    assert.deepEqual(alertsFromStatusChange("LY1", undefined, snapshot(), idFor), []);
  });

  it("a delay under the significant threshold is not an alert", () => {
    const next = snapshot({ status: "delayed", delayMinutes: 15 });
    assert.deepEqual(alertsFromStatusChange("LY1", undefined, next, idFor), []);
  });

  it("re-reading the exact same delay again is not a second alert", () => {
    const previous = snapshot({ status: "delayed", delayMinutes: 45 });
    const next = snapshot({ status: "delayed", delayMinutes: 45, checkedAt: "2026-06-01T13:00:00.000Z" });
    assert.deepEqual(alertsFromStatusChange("LY1", previous, next, idFor), []);
  });

  it("a same-status recheck with no real change produces nothing", () => {
    const previous = snapshot();
    const next = snapshot({ checkedAt: "2026-06-01T11:00:00.000Z" });
    assert.deepEqual(alertsFromStatusChange("LY1", previous, next, idFor), []);
  });
});

describe("what does count as worth telling somebody about", () => {
  it("a delay at or past the threshold is an alert", () => {
    const next = snapshot({ status: "delayed", delayMinutes: 30 });
    const alerts = alertsFromStatusChange("LY1", undefined, next, idFor);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].kind, "flight_delay");
    assert.match(alerts[0].note, /30 minutes/);
  });

  it("a delay that grows past the threshold again is a new alert", () => {
    const previous = snapshot({ status: "delayed", delayMinutes: 40 });
    const next = snapshot({ status: "delayed", delayMinutes: 90, checkedAt: "2026-06-01T12:00:00.000Z" });
    const alerts = alertsFromStatusChange("LY1", previous, next, idFor);
    assert.equal(alerts.length, 1);
    assert.match(alerts[0].note, /90 minutes/);
  });

  it("cancellation is always an alert, no matter the delay", () => {
    const next = snapshot({ status: "cancelled" });
    const alerts = alertsFromStatusChange("LY1", undefined, next, idFor);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].kind, "flight_cancelled");
  });

  it("a cancellation already known is not repeated", () => {
    const previous = snapshot({ status: "cancelled" });
    const next = snapshot({ status: "cancelled", checkedAt: "2026-06-01T11:00:00.000Z" });
    assert.deepEqual(alertsFromStatusChange("LY1", previous, next, idFor), []);
  });

  it("diversion is always an alert", () => {
    const next = snapshot({ status: "diverted" });
    assert.equal(alertsFromStatusChange("LY1", undefined, next, idFor)[0].kind, "flight_diverted");
  });

  it("a real gate change, once the gate was already known, is an alert", () => {
    const previous = snapshot({ departureGate: "12" });
    const next = snapshot({ departureGate: "22", checkedAt: "2026-06-01T11:00:00.000Z" });
    const alerts = alertsFromStatusChange("LY1", previous, next, idFor);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].kind, "gate_change");
  });

  it("a gate appearing for the first time is not a 'change' — there was nothing to change from", () => {
    const previous = snapshot({});
    const next = snapshot({ departureGate: "22", checkedAt: "2026-06-01T11:00:00.000Z" });
    assert.deepEqual(alertsFromStatusChange("LY1", previous, next, idFor), []);
  });

  it("a real terminal change is its own alert", () => {
    const previous = snapshot({ departureTerminal: "1" });
    const next = snapshot({ departureTerminal: "3", checkedAt: "2026-06-01T11:00:00.000Z" });
    assert.equal(alertsFromStatusChange("LY1", previous, next, idFor)[0].kind, "terminal_change");
  });

  it("every new alert starts unacknowledged", () => {
    const next = snapshot({ status: "cancelled" });
    assert.equal(alertsFromStatusChange("LY1", undefined, next, idFor)[0].acknowledged, false);
  });
});

describe("the live-travel-information wiring keeps the same fences everything else does", () => {
  const STORE = readFileSync("lib/account-store.ts", "utf8");
  const STATUS = readFileSync("lib/flight-status.ts", "utf8");
  const ALERTS_ROUTE = readFileSync("app/api/account/alerts/route.ts", "utf8");
  const APP = readFileSync("components/companion/CompanionApp.tsx", "utf8");

  it("a flight check is throttled — it does not re-query a flight checked recently", () => {
    const fn = STORE.slice(STORE.indexOf("export async function checkTripFlightStatus"), STORE.indexOf("export async function getTripAlerts"));
    assert.match(fn, /flightRecheckMs/);
  });

  it("only checks flights departing soon, not the whole itinerary regardless of date", () => {
    const fn = STORE.slice(STORE.indexOf("export async function checkTripFlightStatus"), STORE.indexOf("export async function getTripAlerts"));
    assert.match(fn, /FLIGHT_CHECK_WINDOW_DAYS/);
  });

  it("never invents a status the provider did not actually report", () => {
    assert.match(STATUS, /return raw \? "unknown" : "unknown"|: "unknown"/);
    assert.doesNotMatch(STATUS, /status: "delayed"(?!.*mapStatus)/); // never hand-set a status outside mapStatus's own mapping
  });

  it("delay minutes are only ever a real difference between two real timestamps, never estimated", () => {
    assert.match(STATUS, /revised > scheduled \? revised - scheduled : undefined/);
  });

  it("dismissing an alert is gated to the signed-in owner, and checks same-origin first", () => {
    assert.match(ALERTS_ROUTE, /sameOrigin/);
    assert.match(ALERTS_ROUTE, /Please log in first/);
    assert.ok(ALERTS_ROUTE.indexOf("sameOrigin") < ALERTS_ROUTE.indexOf("Please log in first"));
  });

  it("a client's read state never touches the server — only their own browser does", () => {
    // Opening the Changes screen marks its alerts read. The owner (an account)
    // records that on the server; a client on a per-trip code keeps it in their
    // own browser, so the client app still asks the server to manage nothing.
    /**
     * READ AS TWO SEPARATE PIECES, because the mark-read work is now three:
     * the snapshot happens during render, the browser write and the server
     * post are their own effects. It used to be one effect and this read one
     * window of it. The property being kept is unchanged — the server hears
     * only from the owner, the client's read state stays in their browser.
     */
    const post = APP.indexOf('"/api/account/alerts"');
    assert.ok(post > 0, "expected the server-side mark-read post");
    const postGuard = APP.slice(post - 400, post);
    assert.match(postGuard, /isClientViewer/, "the client's app posts read state to the server");
    assert.match(postGuard, /trip\.tripId/);

    const store = APP.indexOf("localStorage.setItem(`wg-alerts-read:");
    assert.ok(store > 0, "expected the client's own read state in localStorage");
    const storeGuard = APP.slice(store - 400, store);
    assert.match(storeGuard, /!isClientViewer \|\| !alertKey/, "the owner's read state is being written to the client's browser");
  });

  it("still does not add a sixth tab for live alerts — they live on the existing Changes screen", () => {
    const tabsBlock = APP.slice(APP.indexOf("const tabs ="), APP.indexOf("const tabs =") + 600);
    assert.doesNotMatch(tabsBlock, /"alertsLive"|"liveAlerts"/);
  });
});
