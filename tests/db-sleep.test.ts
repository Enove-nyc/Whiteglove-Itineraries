// The database is on Neon's free plan, which only stops counting compute after
// five idle minutes. These pin the pieces that let it sleep: long cache windows
// that every write clears, and a cache round trip that does not lose dates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DB_CACHE_SECONDS, DB_CONTENT_TAG, cachedRead } from "../lib/cache-tags";
import { __bundleCodec } from "../lib/content";

test("database reads are kept for a day, not an hour", () => {
  assert.equal(DB_CACHE_SECONDS, 86_400);
  assert.equal(DB_CONTENT_TAG, "db-content");
});

test("outside Next.js a cached read still runs, and a failing read still throws", async () => {
  assert.equal(await cachedRead(async () => 7, ["t"], ["t"]), 7);
  await assert.rejects(cachedRead(async () => { throw new Error("boom"); }, ["t2"], ["t2"]), /boom/);
});

test("the content bundle keeps its dates through the cache", () => {
  const when = new Date("2026-10-27T12:00:00.000Z");
  const bundle = {
    slugs: { rome: "d1" },
    contacts: [],
    places: [{ id: "p1", destinationId: "d1", createdAt: when, lastVerified: null, name: "A" }],
    photos: [],
    links: [],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const back = __bundleCodec.decode(__bundleCodec.encode(bundle as any)) as any;
  assert.ok(back.places[0].createdAt instanceof Date);
  assert.equal(back.places[0].createdAt.toISOString(), when.toISOString());
  assert.equal(back.places[0].lastVerified, null);
});

test("every write through Prisma clears the database caches", () => {
  const source = readFileSync(new URL("../lib/prisma.ts", import.meta.url), "utf8");
  assert.match(source, /bustTag\(DB_CONTENT_TAG\)/);
  for (const op of ["create", "update", "upsert", "delete", "deleteMany", "updateMany", "createMany"]) {
    assert.match(source, new RegExp(`"${op}"`));
  }
});

test("pages and town content are read once and shared, not once per page", () => {
  const pages = readFileSync(new URL("../lib/pages.ts", import.meta.url), "utf8");
  const content = readFileSync(new URL("../lib/content.ts", import.meta.url), "utf8");
  assert.doesNotMatch(pages, /prisma\.page\.findUnique\(\{ where: \{ slug \} \}\);\s*if \(!row \|\| row\.status !== "PUBLISHED"\) return fromDef/);
  assert.match(pages, /\["published-pages"\]/);
  assert.match(content, /\["published-content-bundle"\]/);
});
