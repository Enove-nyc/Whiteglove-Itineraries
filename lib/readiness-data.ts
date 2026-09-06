import "server-only";

import path from "path";
import { schemaIsCurrent, shippedMigration, type DependencyState, type Readiness } from "@/lib/readiness";

/**
 * The reading half of readiness: the database, the cache, and nothing else.
 *
 * Kept apart from lib/readiness.ts for the reason every other pair here is
 * split — the rules that decide whether a container may take traffic must be
 * testable without any of this being reachable.
 */

async function checkDatabase(): Promise<{ state: DependencyState; behind: boolean }> {
  if (!process.env.DATABASE_URL) {
    return { state: { name: "database", ok: false, detail: "DATABASE_URL is not set" }, behind: false };
  }
  try {
    const { prisma } = await import("@/lib/prisma");
    const rows = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
      `select migration_name from "_prisma_migrations" where finished_at is not null order by migration_name desc limit 1`,
    );
    const applied = rows[0]?.migration_name ?? "";
    const shipped = shippedMigration(path.join(process.cwd(), "prisma", "migrations"));
    if (!schemaIsCurrent(shipped, applied)) {
      return {
        state: { name: "database", ok: false, detail: `schema is at ${applied || "nothing"}, this build needs ${shipped}` },
        behind: true,
      };
    }
    return { state: { name: "database", ok: true, detail: applied || "no migrations applied" }, behind: false };
  } catch (error) {
    return {
      state: { name: "database", ok: false, detail: error instanceof Error ? error.message.slice(0, 120) : "unreachable" },
      behind: false,
    };
  }
}

async function checkRedis(): Promise<DependencyState> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return { name: "redis", ok: false, detail: "not configured" };
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    return { name: "redis", ok: res.ok, detail: res.ok ? undefined : `HTTP ${res.status}` };
  } catch {
    return { name: "redis", ok: false, detail: "unreachable" };
  }
}

/**
 * READY means: the process is serving AND the schema is new enough for it.
 * Everything else is reported and does not hold a deploy back.
 */
export async function readiness(): Promise<Readiness> {
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const checks = [database.state, redis];
  if (database.behind) {
    return { ready: false, because: database.state.detail, checks };
  }
  return { ready: true, checks };
}
