// Write the database into the repository.
//
//   DATABASE_URL=... npx tsx scripts/write-snapshot.ts
//
// BY HAND HERE. The nightly run belongs to White Glove Kosher Travel, whose
// repository holds the workflow: both sites read one Postgres and one Redis,
// and what is in them is the guide, whose pages answer 410 on this domain. See
// lib/content-snapshot.ts for why the snapshot exists at all — briefly: the
// content is in two places, git only holds one of them, and anybody reading a
// checkout gets half the truth and does not know it.
//
// REFUSES RATHER THAN OVERWRITES. A run that reaches an empty or wrong database
// produces an empty snapshot, and committing that would replace a true file
// with a false one that looks just as authoritative. It exits non-zero instead,
// leaving the last good copy where it is, and the scheduled run goes red so
// somebody finds out.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { buildContentSnapshot, snapshotProblem, type ContentSnapshot } from "../lib/content-snapshot";

const OUT = "data/snapshot/content.json";

/**
 * Everything except when it was taken.
 *
 * The timestamp moves on every run whether or not a word changed, so comparing
 * whole files would commit a new snapshot every night and bury the one diff
 * that matters — a phone number that moved — in a stream of noise.
 */
function meaningfulPart(snapshot: ContentSnapshot): string {
  return JSON.stringify({ ...snapshot, takenAt: "" });
}

/**
 * Something a person can read out of whatever was thrown.
 *
 * The Neon driver rejects with a WebSocket ErrorEvent rather than an Error, and
 * String() on one of those is the literal text "[object ErrorEvent]" — which
 * says less than nothing. The real reason is on its `error` property, one level
 * down.
 */
function reasonFrom(thrown: unknown): string {
  if (thrown instanceof Error) return thrown.message;
  if (thrown && typeof thrown === "object") {
    const held = thrown as { error?: unknown; message?: unknown; type?: unknown };
    if (held.error instanceof Error) return held.error.message;
    if (typeof held.message === "string" && held.message) return held.message;
    if (typeof held.type === "string" && held.type) return `websocket ${held.type} — the host could not be reached`;
  }
  return String(thrown);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Nothing to snapshot — the whole point is the database half.");
    process.exit(1);
  }

  // THROUGH THE SAME ADAPTER THE SITE USES. Prisma 7 takes its connection from
  // a driver adapter rather than from the schema, so `new PrismaClient()` on
  // its own has no database to talk to and fails at the first query — see
  // lib/prisma.ts, which is doing exactly this for the website. The two must
  // agree, or this file would be a snapshot of a different database than the
  // one the pages read.
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });
  let snapshot: ContentSnapshot;
  try {
    snapshot = await buildContentSnapshot(prisma, new Date().toISOString());
  } catch (error) {
    // A connection failure here throws a WebSocket ErrorEvent, which Node
    // prints as forty lines of internals with the actual problem nowhere in
    // them. The person reading this is looking at a red scheduled run and
    // wants one sentence: it could not reach the database, and the secret is
    // the thing to check.
    console.error("Could not read the database, so no snapshot was written.");
    console.error("Check the DATABASE_URL repository secret — it should be the same string the site uses.");
    console.error(`\nUnderlying error: ${reasonFrom(error)}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }

  const problem = snapshotProblem(snapshot);
  if (problem) {
    console.error(`Refusing to write: ${problem}`);
    process.exit(1);
  }

  if (existsSync(OUT)) {
    try {
      const previous = JSON.parse(readFileSync(OUT, "utf8")) as ContentSnapshot;
      if (meaningfulPart(previous) === meaningfulPart(snapshot)) {
        console.log("No content changed since the last snapshot.");
        for (const [what, n] of Object.entries(snapshot.counts)) console.log(`  ${what}: ${n}`);
        return;
      }
    } catch {
      // An unreadable previous file is a reason to write a good one, not to stop.
    }
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`Wrote ${OUT}`);
  for (const [what, n] of Object.entries(snapshot.counts)) console.log(`  ${what}: ${n}`);
}

void main();
