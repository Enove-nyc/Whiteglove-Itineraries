import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CONNECTIONS, DEPLOYMENT_SETTINGS, launchSummary, readConnectionsProperly, sortForReview } from "@/lib/connections";

/**
 * Every outside thing this site is connected to.
 *
 * The test that matters is at the bottom: it reads the source for every
 * `process.env.X` and fails on one this list does not describe. A connection
 * nobody can see is exactly how the site ends up live with flight lookup
 * quietly dead, and a hand-written list goes stale the first time somebody
 * adds an integration in a hurry.
 */

describe("reading what is set", () => {
  it("says a connection is ready when every variable it needs has a value", () => {
    const readings = readConnectionsProperly({ DATABASE_URL: "postgres://x" });
    assert.equal(readings.find((r) => r.connection.vars[0] === "DATABASE_URL")?.ready, true);
  });

  it("treats whitespace as not set", () => {
    // An empty string pasted into a dashboard field is the commonest way this
    // goes wrong, and it looks set to anybody scrolling past.
    const readings = readConnectionsProperly({ DATABASE_URL: "   " });
    assert.equal(readings.find((r) => r.connection.vars[0] === "DATABASE_URL")?.ready, false);
  });

  it("needs BOTH halves of a pair", () => {
    const readings = readConnectionsProperly({ UPSTASH_REDIS_REST_URL: "https://x" });
    const store = readings.find((r) => r.connection.vars[0] === "UPSTASH_REDIS_REST_URL");
    assert.equal(store?.ready, false);
    assert.deepEqual(store?.missing, ["UPSTASH_REDIS_REST_TOKEN"]);
  });

  it("accepts either one where either really is enough", () => {
    // Twilio takes a messaging service OR a from-number; the assistant takes
    // either model. Saying "not set" because the other is absent would send
    // somebody looking for a key they do not need.
    const twilio = readConnectionsProperly({
      TWILIO_ACCOUNT_SID: "AC1",
      TWILIO_AUTH_TOKEN: "t",
      TWILIO_FROM_NUMBER: "+15551234567",
    }).find((r) => r.connection.vars[0] === "TWILIO_ACCOUNT_SID");
    assert.equal(twilio?.ready, true, `still missing: ${twilio?.missing.join(", ")}`);

    const ai = readConnectionsProperly({ GEMINI_API_KEY: "g" }).find((r) => r.connection.vars[0] === "ANTHROPIC_API_KEY");
    assert.equal(ai?.ready, true);
  });

  it("never reads a value for anything but emptiness", () => {
    // Nothing in lib/connections.ts can leak a secret into a page, because
    // nothing in it ever holds one. This is the check that says so.
    const source = readFileSync("lib/connections.ts", "utf8");
    assert.ok(!/env\[[^\]]+\]\s*(?!\?\.trim)/.test(source.replace(/env\[[^\]]+\]\?\.trim\(\)/g, "")), "a value is read somewhere other than for emptiness");
  });
});

describe("what the owner is told", () => {
  it("counts only what would stop the site", () => {
    // A checklist that says "6 things are not set" when five are optional
    // teaches somebody to ignore it.
    const nothing = readConnectionsProperly({});
    assert.match(launchSummary(nothing), /the site cannot run without/);
  });

  it("says so when only features are missing", () => {
    const essentials = {
      UPSTASH_REDIS_REST_URL: "u",
      UPSTASH_REDIS_REST_TOKEN: "t",
      DATABASE_URL: "d",
      ADMIN_PASSWORD: "p",
    };
    assert.match(launchSummary(readConnectionsProperly(essentials)), /Everything essential is set/);
  });

  it("does not claim anything WORKS, only that it is set", () => {
    // The honest limit. All this can see is a string. Whether the key is
    // valid, the account is in credit or the service is up is a different
    // question, and saying "connected" from a string would be false comfort.
    const all: Record<string, string> = {};
    for (const c of CONNECTIONS) for (const v of c.vars) all[v] = "x";
    const said = launchSummary(readConnectionsProperly(all));
    assert.match(said, /separate question/);
    assert.ok(!/working|connected|healthy/i.test(said), said);
  });

  it("puts the worst first", () => {
    const order = sortForReview(readConnectionsProperly({})).map((r) => r.connection.weight);
    assert.deepEqual([...order].sort((a, b) => order.indexOf(a) - order.indexOf(b)), order, "not sorted");
    assert.equal(order[0], "essential");
    assert.equal(order.at(-1), "nicety");
  });
});

describe("what each one says", () => {
  it("says what a PERSON loses, not which variable is absent", () => {
    // "AERODATABOX_API_KEY is not set" tells nobody anything.
    for (const connection of CONNECTIONS) {
      assert.ok(connection.without.trim().length > 20, `${connection.vars[0]}: "${connection.without}"`);
      assert.ok(
        !connection.without.includes("_"),
        `${connection.vars[0]} describes itself by variable name rather than by what stops: "${connection.without}"`,
      );
    }
  });

  it("says what each one is for", () => {
    for (const connection of CONNECTIONS) {
      assert.ok(connection.what.trim().length > 10, connection.vars[0]);
      assert.ok(connection.vars.length > 0, "a connection with no variables");
    }
  });

  it("names no variable twice", () => {
    const seen = new Set<string>();
    for (const connection of CONNECTIONS) {
      for (const name of connection.vars) {
        assert.ok(!seen.has(name), `${name} is in two connections, so the screen would contradict itself`);
        seen.add(name);
      }
    }
  });
});

/* ---- the one that keeps this honest ------------------------------------ */

/** Every `process.env.X` the site actually reads. */
function envNamesInSource(): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(path)) continue;
      // Comments stripped first. A variable NAMED in prose is not one the
      // code reads, and counting it would send somebody looking for a key
      // that nothing asks for.
      const code = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      for (const match of code.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) found.add(match[1]);
    }
  };
  for (const dir of ["app", "lib", "components"]) walk(dir);
  return found;
}

/**
 * Names that are the platform's, not a connection anybody sets up.
 *
 * Listed rather than pattern-matched, so adding one is a decision somebody
 * makes on purpose instead of a regex quietly swallowing a real integration.
 */
const NOT_A_CONNECTION = new Set([
  "NODE_ENV",
  "VERCEL_URL",
  "VERCEL_ENV",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_GIT_COMMIT_SHA",
  "VERCEL_GIT_COMMIT_REF",
  "VERCEL_GIT_COMMIT_MESSAGE",
  "BLOB_READ_WRITE_TOKEN",
  "LOCAL_PG",
  "PORT",
  // Stamped in at build time by the deployment, not set by anybody.
  "BUILD_TIME",
]);

describe("nothing is invisible", () => {
  it("describes every environment variable the code actually reads", () => {
    // THE ONE THAT MATTERS. A variable the site reads and this list does not
    // name is a connection nobody can see — which is how a site goes live with
    // flight lookup quietly dead. A hand-written list goes stale the first
    // time somebody adds an integration in a hurry; this reads the source.
    // DEPLOYMENT_SETTINGS counts as described: same shape, same screen,
    // separate only because a brand flag is not a connection to anything.
    const described = new Set([...CONNECTIONS, ...DEPLOYMENT_SETTINGS].flatMap((c) => c.vars));
    const unexplained = [...envNamesInSource()].filter((name) => !described.has(name) && !NOT_A_CONNECTION.has(name));
    assert.deepEqual(
      unexplained,
      [],
      `these are read by the code and described nowhere:\n  ${unexplained.join("\n  ")}\n` +
        "Add them to CONNECTIONS in lib/connections.ts, or to NOT_A_CONNECTION here if they are the platform's.",
    );
  });

  it("reads every described variable on the Connections screen itself", () => {
    // Next substitutes `process.env.X` by name at build time, so a variable
    // the screen forgets to name reads as empty forever — the screen says
    // "not set" about a key that IS set, which is worse than saying nothing.
    // Google sign-in sat like that: described here, never read there.
    const page = readFileSync("app/admin/settings/connections/page.tsx", "utf8");
    const unread = CONNECTIONS.flatMap((c) => c.vars).filter((name) => !page.includes(`process.env.${name}`));
    assert.deepEqual(unread, [], `described but never read by the screen, so they always show as not set: ${unread.join(", ")}`);
  });

  it("describes nothing the code does not read", () => {
    // The other direction. A connection listed but never read is a key
    // somebody would go and get for no reason.
    const inSource = envNamesInSource();
    const phantom = CONNECTIONS.flatMap((c) => c.vars).filter((name) => !inSource.has(name));
    assert.deepEqual(phantom, [], `described but never read: ${phantom.join(", ")}`);
  });
});
