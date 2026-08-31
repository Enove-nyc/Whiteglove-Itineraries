import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Opening a trip in the advisor app stays IN the advisor app.
 *
 * The bug: the advisor app's Trips and Wallet tabs linked out to /app — the
 * client app, its own page with the client's bottom bar — so an advisor who
 * opened a trip was stranded there with no way back to their dashboard. The fix
 * renders the trip embedded in the advisor shell: the advisor's own four-tab
 * bar stays below it, and the trip's own back leaves it.
 */

const ADVISOR_APP = readFileSync("components/companion/AdvisorApp.tsx", "utf8");
const COMPANION = readFileSync("components/companion/CompanionApp.tsx", "utf8");
const PAGE = readFileSync("app/advisor/page.tsx", "utf8");

describe("the advisor app opens a trip into itself, not the client app", () => {
  it("the Trips and Wallet rows point at /advisor, never /app", () => {
    assert.match(ADVISOR_APP, /hrefFor=\{\(t\) => `\/advisor\?trip=\$\{encodeURIComponent\(t\.id\)\}`\}/);
    assert.match(ADVISOR_APP, /hrefFor=\{\(t\) => `\/advisor\?trip=\$\{encodeURIComponent\(t\.id\)\}&screen=wallet`\}/);
    // The old client-app handoff is gone.
    assert.doesNotMatch(ADVISOR_APP, /`\/app\?trip=/);
  });

  it("renders the trip embedded, with this app's own bottom bar still below it", () => {
    assert.match(ADVISOR_APP, /viewingTrip && openTrip && \(/);
    assert.match(ADVISOR_APP, /<CompanionApp\s+trip=\{openTrip\}\s+embedded/);
    assert.match(ADVISOR_APP, /onExit=\{exitTrip\}/);
    // Its own navy header is hidden while a trip is open — the trip brings one.
    assert.match(ADVISOR_APP, /\{!viewingTrip && \(/);
  });

  it("tapping any bottom tab leaves the open trip", () => {
    assert.match(ADVISOR_APP, /function selectTab\(id: Tab\)\s*\{\s*setViewingTrip\(false\);\s*setTab\(id\);/);
    assert.match(ADVISOR_APP, /onClick=\{\(\) => selectTab\(t\.id\)\}/);
  });

  it("backing out clears the trip and drops ?trip from the address", () => {
    assert.match(ADVISOR_APP, /function exitTrip\(\)\s*\{\s*setViewingTrip\(false\);\s*router\.replace\("\/advisor"\);/);
  });
});

describe("the page builds the trip server-side, the same way the client app does", () => {
  it("only a started trip this account owns can open", () => {
    assert.match(PAGE, /const wantedTripId = firstParam\(params\.trip\)/);
    assert.match(PAGE, /const selected = trips\.find\(\(t\) => t\.id === wantedTripId\)/);
    assert.match(PAGE, /buildCompanionFromItinerary\(/);
    assert.match(PAGE, /openTrip=\{openTrip\} openScreen=\{openScreen\} openShareId=\{openShareId\}/);
  });
});

describe("embedded mode: the trip fills the advisor shell without a second app frame", () => {
  it("CompanionApp takes an embedded flag and an onExit", () => {
    assert.match(COMPANION, /embedded = false,/);
    assert.match(COMPANION, /onExit\?: \(\) => void/);
  });

  it("embedded drops the desktop showcase frame and renders just the phone", () => {
    assert.match(COMPANION, /if \(embedded\) \{[\s\S]*?\{phone\}[\s\S]*?\}/);
  });

  it("embedded hides this app's own bottom bar, so the advisor bar is the only one", () => {
    assert.match(COMPANION, /\{!embedded && !\(composerUp && st\.screen === "messages"\) && \(/);
  });

  it("embedded, the home-screen back leaves the trip instead of going nowhere", () => {
    assert.match(COMPANION, /if \(embedded && st\.screen === "home"\) \{\s*onExit\?\.\(\);\s*return;/);
    assert.match(COMPANION, /const canBack = embedded \? true :/);
  });
});

describe("the advisor comments, the traveller asks", () => {
  it("the itinerary button reads 'Comment on this' for the advisor, 'Ask about this' for the traveller", () => {
    assert.match(COMPANION, /advisorInbox \|\| embedded \? "Comment on this" : "Ask about this"/);
  });
});
