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
  assert.match(panel, /if \(!state\.address\) return null;/);
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
  // once `confirmingRotate` is true, and the visible one only sets it. Renamed
  // from `confirming` when a second, unrelated "busy" state (adding a trusted
  // sender) arrived and needed a name that would not collide with it.
  assert.match(panel, /onClick=\{\(\) => setConfirmingRotate\(true\)\}/);
  assert.match(panel, /\{confirmingRotate \? \(/);
  assert.match(panel, /stops working straight away/);
});

test("the shared address is what draws the panel, and it is labelled first", () => {
  assert.match(panel, /setState\(\{ \.\.\.EMPTY, \.\.\.data \}\)/);
  // `state.address` — the field the GET route names plainly `address` — is
  // the shared one; see inbound-sender-fallback.test.ts for that ordering.
  assert.match(panel, /state\.address/);
});

test("the private address is folded away, not gone", () => {
  assert.match(panel, /Prefer a private address instead\?/);
  assert.match(panel, /state\.privateAddress/);
  assert.match(panel, /showPrivate/);
});

test("adding and removing a trusted sender both round-trip through the same endpoint the address does", () => {
  assert.match(panel, /action: "addSender"/);
  assert.match(panel, /action: "removeSender"/);
  // Every write here is a POST to /api/account/inbound, same as rotate and
  // clear — one endpoint, so sameOrigin() and the login check guard all of it.
  assert.equal((panel.match(/fetch\("\/api\/account\/inbound"/g) ?? []).length, 5);
});

test("the trusted-sender list is capped, and the panel says so instead of just hiding the form", () => {
  assert.match(panel, /state\.trustedSenders\.length < state\.maxTrustedSenders/);
  assert.match(panel, /remove one above to add another/);
});
