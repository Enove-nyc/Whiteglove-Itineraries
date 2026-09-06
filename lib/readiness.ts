import { readdirSync } from "fs";

/**
 * IS THIS CONTAINER FIT TO SERVE, OR ONLY ALIVE?
 *
 * Railway's healthcheck pointed at /version on both deployments, and /version
 * renders a sentence. It returns 200 with the database unreachable and with
 * the schema years behind the code, so Railway would call a deploy healthy and
 * move traffic onto a container that cannot answer a single account request.
 * A liveness check answered "the process started"; nothing asked "and can it
 * do its job".
 *
 * THE ONE FAILURE THIS EXISTS TO CATCH is new code starting against an old
 * schema. The two deployments share one database and only one of them runs
 * migrations, so the other can ship code needing a column that is not there
 * yet — and the symptom is not a crash at boot, it is a query failing later
 * for one customer on one screen. Comparing the migrations this BUILD ships
 * against the ones the database says are applied catches it before any traffic
 * arrives.
 *
 * PURE: the rules only. lib/readiness-data.ts does the reading, so what
 * decides whether a container may take traffic can be tested without a
 * database, a cache or a server runtime.
 *
 * WHAT IS DELIBERATELY NOT FATAL. A missing Redis, or a slow one, is reported
 * and does not fail the check. The public site is built to serve without it
 * (see lib/db-optional.ts and hasAccountStorage), so failing readiness on it
 * would block every deploy during a cache blip while the site was still
 * perfectly able to serve. Reported, not fatal, is the honest line: the check
 * says what is wrong without pretending a degraded dependency is an outage.
 */

export type DependencyState = { name: string; ok: boolean; detail?: string };

export type Readiness = {
  ready: boolean;
  /** Why not, in one line, when it is not. */
  because?: string;
  checks: DependencyState[];
};

/** The newest migration this build carries, or "" when none ship. */
export function shippedMigration(dir: string): string {
  try {
    return (
      readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
        .pop() ?? ""
    );
  } catch {
    return "";
  }
}

/**
 * Whether the applied schema is new enough for this build.
 *
 * Migration folders are timestamp-prefixed, so a plain string comparison
 * orders them. AHEAD IS FINE and behind is not: the deployment that owns
 * migrations runs them first and the other one catches up on its next deploy,
 * so a database newer than this build is the normal steady state, while a
 * database older than this build is the failure.
 */
export function schemaIsCurrent(shipped: string, applied: string): boolean {
  if (!shipped) return true;
  if (!applied) return false;
  return applied >= shipped;
}
