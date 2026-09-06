import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { schemaIsCurrent, shippedMigration } from "@/lib/readiness";

/**
 * READINESS, AND WHY THERE IS STILL NO MIGRATION RUNNER HERE.
 *
 * The two deployments share one database and one migration lineage — the same
 * 17 folders, byte for byte. Only the kosher deployment runs them, through a
 * wrapper that waits for Prisma's advisory lock rather than failing on it,
 * written after two overlapping deploys spent ninety minutes silently refusing
 * to go live on 24 August.
 *
 * Adding `preDeployCommand: npm run db:migrate` here — which is what "the other
 * service has no equivalent safeguard" looks like from outside — would put a
 * SECOND migrator on that one database, and this repository's db:migrate is
 * raw `prisma migrate deploy` with the ten-second lock timeout that caused the
 * incident. It would not add safety; it would reintroduce the failure.
 *
 * The real gap was the healthcheck. /version returns 200 with the database
 * unreachable and the schema years behind, so Railway called a deploy healthy
 * and moved traffic onto a container that could not answer an account request.
 */

test("a build is ready when the applied schema is at or ahead of what it ships", () => {
  assert.equal(schemaIsCurrent("20260823130000_x", "20260823130000_x"), true);
  // Ahead is the normal steady state: the deployment that owns migrations runs
  // them first and this one catches up on its next deploy.
  assert.equal(schemaIsCurrent("20260823130000_x", "20260901000000_later"), true);
});

test("A BUILD IS NOT READY AGAINST AN OLDER SCHEMA — the failure this exists for", () => {
  assert.equal(schemaIsCurrent("20260901000000_needs_column", "20260823130000_x"), false);
  assert.equal(schemaIsCurrent("20260823130000_x", ""), false, "no migrations applied at all");
});

test("a build shipping no migrations never blocks itself", () => {
  assert.equal(schemaIsCurrent("", "anything"), true);
  assert.equal(schemaIsCurrent("", ""), true);
});

test("the newest shipped migration is read off this build, and a missing folder is not fatal", () => {
  const newest = shippedMigration(new URL("../prisma/migrations", import.meta.url).pathname);
  assert.match(newest, /^\d{14}_/, `expected a timestamped migration, got ${JSON.stringify(newest)}`);
  assert.equal(shippedMigration("/no/such/directory"), "");
});

test("Railway waits on the readiness endpoint, not on a page that only renders", () => {
  const railway = JSON.parse(readFileSync(new URL("../railway.json", import.meta.url), "utf8"));
  assert.equal(railway.deploy.healthcheckPath, "/api/health");
});

test("THIS DEPLOYMENT MUST NOT RUN MIGRATIONS — one database, one owner", () => {
  const railway = JSON.parse(readFileSync(new URL("../railway.json", import.meta.url), "utf8"));
  assert.ok(
    !railway.deploy.preDeployCommand,
    "a second migrator on the shared database reintroduces the 24 August lock-timeout failure",
  );
});

test("a cold cache is reported but does not fail the check", () => {
  // The reading half is where readiness() lives — the pure half holds the
  // rules only. Only the schema check may set ready:false.
  const src = readFileSync(new URL("../lib/readiness-data.ts", import.meta.url), "utf8");
  assert.match(src, /if \(database\.behind\) \{/);
  assert.ok(!/redis[^\n]*ready: false/.test(src), "a Redis blip must not block a deploy");
  // And the pure half must stay free of anything that reads.
  const rules = readFileSync(new URL("../lib/readiness.ts", import.meta.url), "utf8");
  for (const word of ["fetch(", "prisma", "process.env"]) {
    assert.ok(!rules.includes(word), `lib/readiness.ts should not contain ${word}`);
  }
});

test("the endpoint answers 503 when it is not ready, and leaks nothing", () => {
  const route = readFileSync(new URL("../app/api/health/route.ts", import.meta.url), "utf8");
  assert.match(route, /status: state\.ready \? 200 : 503/);
  assert.match(route, /"cache-control": "no-store"/);
  assert.ok(!/DATABASE_URL|process\.env/.test(route), "the route must not echo configuration");
});
