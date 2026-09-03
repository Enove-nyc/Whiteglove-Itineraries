import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * An address that goes nowhere is worse than no address: somebody forwards a
 * booking to it and learns the feature is broken rather than unwired. These
 * pin the gate, and the two places the address is offered from.
 */

const store = readFileSync(new URL("../lib/inbound-import-store.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/account/inbound/route.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/ForwardingAddress.tsx", import.meta.url), "utf8");
const account = readFileSync(new URL("../app/account/page.tsx", import.meta.url), "utf8");

test("readiness needs the queue AND the secret the inbound route verifies with", () => {
  const fn = store.slice(store.indexOf("export function inboundMailReady"));
  assert.match(fn, /inboundStoreAvailable\(\)/);
  assert.match(fn, /INBOUND_EMAIL_SECRET/);
});

test("the account route hands back no address until mail can arrive", () => {
  assert.match(route, /inboundMailReady/);
  const guard = route.slice(route.indexOf("if (!inboundMailReady())"));
  // Still hands back anything already queued — a message that got in before
  // the provider was reconfigured is still somebody's booking.
  assert.match(guard.slice(0, 400), /address: ""/);
  assert.match(guard.slice(0, 400), /pendingToShow/);
});

test("the account panel draws nothing without an address", () => {
  assert.match(panel, /if \(!address\) return null;/);
});

test("the panel does not review anything itself — the planner does", () => {
  assert.match(panel, /href="\/itinerary"/);
  for (const forbidden of ["Add to trip", "/api/account/smart-import"]) {
    assert.ok(!panel.includes(forbidden), `ForwardingAddress should not contain ${forbidden}`);
  }
});

test("it is reachable from the account page", () => {
  assert.match(account, /import ForwardingAddress from "@\/components\/ForwardingAddress";/);
  assert.match(account, /<ForwardingAddress \/>/);
});

test("the forwarding panel sits with the trips, not buried under Details", () => {
  // Deliberately NOT the kosher copy's TripUpdates ordering check: that panel
  // has not been ported to this deployment yet, and indexOf returns -1 for
  // something absent — so the assertion would have passed by being vacuous,
  // which is worse than not having it.
  const forwarding = account.indexOf("<ForwardingAddress />");
  const details = account.indexOf('aria-labelledby="account-details"');
  assert.ok(forwarding > -1, "the forwarding panel is not on the account page");
  assert.ok(details > -1 && forwarding < details, "forwarding must come before Details");
});

test("the address can be changed, and never without being asked first", () => {
  assert.match(panel, /action: "rotate"/);
  // The confirm step gates the call — the button that rotates is only rendered
  // once `confirming` is true, and the visible one only sets it.
  assert.match(panel, /onClick=\{\(\) => setConfirming\(true\)\}/);
  assert.match(panel, /\{confirming \? \(/);
  assert.match(panel, /stops working straight away/);
});
