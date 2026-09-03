import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { codeOf } from "./helpers/source";

/**
 * A trip taken off the device when the session ends.
 *
 * The companion app keeps a trip on the phone so it opens at a gate with no
 * signal: the itinerary lands in the service worker's navigation cache, and the
 * wallet's boarding passes — full name, booking reference — land in IndexedDB.
 * All of that is right while it is somebody's own phone and they are signed in.
 * Left behind after a sign-out on a borrowed laptop or a hotel business centre,
 * it is the one way the feature hurts somebody.
 *
 * These tests are about the clearing, because the saving failing is an
 * inconvenience and the clearing failing is somebody's boarding pass left on a
 * shared machine.
 */

const SW = readFileSync("public/sw.js", "utf8");
const HELPER = readFileSync("lib/offline-forget.ts", "utf8");
const STORE = codeOf("lib/offline-trip-store.ts");

describe("the on-device store is emptied outright", () => {
  it("signing out drops the whole offline database, not one key", () => {
    // Every store at once — trips, wallet documents, cached chat — without a
    // list of keys the session would have to know in advance.
    assert.match(STORE, /export async function forgetAllOffline/);
    assert.match(STORE, /indexedDB\.deleteDatabase\(DB_NAME\)/);
  });

  it("never turns signing out into an error", () => {
    const fn = STORE.slice(STORE.indexOf("export async function forgetAllOffline"));
    assert.match(fn, /onblocked = \(\) => resolve\(\)/);
    assert.match(fn, /catch/);
  });

  it("the sign-out helper deletes the database before anything else", () => {
    // The database holds the boarding-pass bytes and does not depend on a
    // worker being awake, so it goes first.
    assert.match(HELPER, /await forgetAllOffline\(\)/);
  });
});

describe("the private pages go too", () => {
  it("the helper both tells the worker and sweeps the caches itself", () => {
    // The message is the tidy path. The direct sweep is the one that still
    // works when the worker is asleep, unregistered or mid-update.
    assert.match(HELPER, /postMessage\(\{ type: "wg-offline-forget" \}\)/);
    assert.match(HELPER, /async function sweepPrivatePages/);
  });

  it("sweeps every app-shell cache, not one pinned version", () => {
    // The worker bumps its cache name on deploy; a page that opened one fixed
    // name would sweep an empty cache the morning after a release while the
    // rendered itinerary sat in the new one.
    assert.match(HELPER, /await caches\.keys\(\)/);
    assert.doesNotMatch(HELPER, /caches\.open\("wg-cache-v\d"\)/);
  });

  it("the worker sweeps them on the forget message", () => {
    assert.match(SW, /async function forgetPrivate/);
    const handler = SW.slice(SW.indexOf('self.addEventListener("message"'), SW.indexOf('self.addEventListener("fetch"'));
    assert.match(handler, /wg-offline-forget/);
    assert.match(handler, /forgetPrivate\(\)/);
  });

  it("both lists of private paths agree, exactly", () => {
    // Two copies on purpose — the worker may be asleep at the moment somebody
    // signs out, and a page definitely is not. Compared rather than trusted, so
    // one cannot drift into keeping a path the other clears.
    const listFrom = (src: string) => {
      const start = src.indexOf("PRIVATE_PREFIXES = [");
      const body = src.slice(start, src.indexOf("]", start));
      return (body.match(/"([^"]+)"/g) ?? []).map((entry) => entry.replace(/"/g, "")).sort();
    };
    const fromWorker = listFrom(SW);
    const fromPage = listFrom(HELPER);
    assert.ok(fromWorker.length >= 10, `expected the worker's list, found ${fromWorker.length}`);
    assert.deepEqual(fromPage, fromWorker, "the two private-path lists have drifted apart");
  });

  it("covers the trip, the account and every share link", () => {
    const listed = (SW.match(/"(\/[^"]*)"/g) ?? []).join(" ");
    for (const p of ["/itinerary", "/account", "/advisor", "/app", "/i/", "/t/"]) {
      assert.ok(listed.includes(`"${p}"`), `${p} should be swept on sign-out`);
    }
  });

  it("leaves the public site and the offline shell cached", () => {
    const start = SW.indexOf("PRIVATE_PREFIXES = [");
    const body = SW.slice(start, SW.indexOf("]", start));
    for (const publicPath of ["/destinations", "/kosher", "/offline", "/pricing"]) {
      assert.ok(!body.includes(`"${publicPath}"`), `${publicPath} is public and should stay cached`);
    }
  });
});

describe("EVERY sign-out clears it", () => {
  // The rule this file exists for. A sign-out added later that forgets this
  // leaves somebody's boarding pass on a borrowed computer, and nothing else in
  // the codebase would notice.
  it("no sign-out path signs somebody out without clearing the device", () => {
    const offenders: string[] = [];
    const found: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry)) continue;
        const src = readFileSync(full, "utf8");
        // A component that actually POSTs a logout endpoint from the browser.
        if (!/fetch\(\s*[^)]*\/(account|admin)\/logout/.test(src)) continue;
        found.push(full);
        if (!src.includes("forgetOfflineData")) offenders.push(full);
      }
    };
    walk("components");

    assert.ok(found.length >= 3, `expected the sign-out paths, found ${found.length}`);
    assert.deepEqual(
      offenders,
      [],
      `these sign out without clearing the on-device trip: ${offenders.join(", ")}`,
    );
  });

  it("clears when a session times out on its own", () => {
    // The hotel-business-centre case: walked away from, signing itself out on
    // its own with the passes still on the machine.
    const idle = readFileSync("components/IdleLogout.tsx", "utf8");
    assert.match(idle, /forgetOfflineData\(\)/);
  });
});
