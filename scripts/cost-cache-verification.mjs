import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

if (process.env.AUDIT_ISOLATED !== '1' || new URL(process.env.DATABASE_URL || 'https://invalid').hostname !== '127.0.0.1' || new URL(process.env.UPSTASH_REDIS_REST_URL || 'https://invalid').hostname !== '127.0.0.1') throw Error('Cost checks require disposable loopback stores.');
const origins = ['http://127.0.0.1:3002', 'http://127.0.0.1:3003'];
assert.equal(process.env.CONTENT_CACHE_FIXTURE_ORIGINS, origins.join(','));
const report = { checks: [], sql: {}, errors: [] };
const endpoint = '/api/internal/content-cache';
function fixture(action) {
  const result = JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', 'scripts/cost-cache-fixture.ts', action], { encoding: 'utf8', timeout: 90000 }).trim());
  assert.equal(result.ok, true);
}
async function page(origin, path, word, status = 200) {
  const response = await fetch(origin + path);
  assert.equal(response.status, status, origin + path);
  const body = await response.text();
  if (word) assert(body.includes(word), `${origin}${path} missing ${word}`);
  assert(!body.includes('DRAFT_MUST_NOT_ESCAPE'));
  assert(!body.includes('COST_UNCOMMITTED_MUST_NOT_ESCAPE'));
  return body;
}
function counts() {
  assert(process.env.COST_PG_CONTAINER, 'The disposable Postgres container id is required for actual SQL counts.');
  const result = spawnSync('docker', ['logs', process.env.COST_PG_CONTAINER], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.status, 0);
  const lines = (result.stdout + result.stderr).split('\n');
  return { ...Object.fromEntries(['Page', 'PlaceReview'].map(table => [table, lines.filter(line => line.includes('SELECT') && line.includes(`"${table}"`)).length])), PlaceReviewText: lines.filter(line => line.includes('SELECT') && line.includes('"PlaceReview"."text"')).length };
}
async function reviews(origin, ref = 'cost-fixture-place') {
  const r = await fetch(origin + '/api/reviews?placeKind=listing&placeRef=' + ref);
  assert.equal(r.status, 200);
  const result = await r.json();
  assert(!JSON.stringify(result).includes('@cost-fixture.audit.local'), 'Public review serialization must keep account emails private.');
  return result.reviews;
}
async function check(name, fn) {
  try { await fn(); report.checks.push({ name, status: 'passed' }); }
  catch (error) { report.checks.push({ name, status: 'failed', error: String(error) }); }
  console.log('COST_CHECK', name, report.checks.at(-1).status);
}
fixture('seed');
await check('forty info pages share one bounded query per instance', async () => {
  const before = counts();
  for (const origin of origins) for (let i = 0; i < 40; i++) await page(origin, '/info/cost-fixture-' + String(i).padStart(2, '0'), 'COST_ORIGINAL_PUBLIC_BODY');
  const after = counts(), reads = after.Page - before.Page;
  report.sql.infoPageColdReads = reads; report.sql.infoPageRequests = 80;
  assert(reads > 0 && reads <= 4, `Expected 1–4 actual Page SELECTs for 80 requests, got ${reads}`);
  const warm = counts();
  for (const origin of origins) for (let i = 0; i < 6; i++) await page(origin, '/info/cost-fixture-00', 'COST_ORIGINAL_PUBLIC_BODY');
  assert.equal(counts().Page, warm.Page, 'Warm public reads must not wake Postgres.');
});
await check('private draft is not served', async () => { for (const origin of origins) await page(origin, '/info/cost-private-draft', '', 404); });
await check('unsigned, forged, malformed and oversized cache notices cannot invalidate', async () => {
  const before = counts();
  for (const origin of origins) {
    assert.equal((await fetch(origin + endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
    assert.equal((await fetch(origin + endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-white-glove-cache-signature': '0'.repeat(64) }, body: JSON.stringify({ at: Date.now(), nonce: 'a'.repeat(32) }) })).status, 401);
    assert.equal((await fetch(origin + endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-white-glove-cache-signature': '0'.repeat(64) }, body: '{bad' })).status, 400);
    assert.equal((await fetch(origin + endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-white-glove-cache-signature': '0'.repeat(64) }, body: 'x'.repeat(2048) })).status, 413);
    await page(origin, '/info/cost-fixture-00', 'COST_ORIGINAL_PUBLIC_BODY');
  }
  assert.equal(counts().Page, before.Page);
});
await check('same signed notice refreshes independent caches and expired notices are rejected', async () => {
  const redis = await fetch('http://127.0.0.1:6380', { method: 'POST', body: JSON.stringify(['GET', 'white-glove:content-cache-invalidation-key']) });
  const key = (await redis.json()).result; assert.match(key, /^[a-f0-9]{64}$/);
  const notice = { at: Date.now(), nonce: randomBytes(16).toString('hex') };
  const sign = n => createHmac('sha256', key).update(JSON.stringify([n.at, n.nonce])).digest('hex');
  const before = counts();
  for (const origin of origins) {
    const expired = { ...notice, at: Date.now() - 6 * 60 * 1000 };
    assert.equal((await fetch(origin + endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-white-glove-cache-signature': sign(expired) }, body: JSON.stringify(expired) })).status, 401);
    assert.equal((await fetch(origin + endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-white-glove-cache-signature': sign(notice) }, body: JSON.stringify(notice) })).status, 200);
    await page(origin, '/info/cost-fixture-00', 'COST_ORIGINAL_PUBLIC_BODY');
  }
  const reads = counts().Page - before.Page;
  assert(reads >= 2 && reads <= 4, `Both cache directories must refresh independently, got ${reads} SELECTs`);
});
await check('a committed edit reaches both deployments without waiting for TTL', async () => {
  fixture('edit');
  for (const origin of origins) await page(origin, '/info/cost-fixture-00', 'COST_COMMITTED_EDIT');
});
await check('interactive transactions invalidate only after the final database outcome', async () => {
  for (const origin of origins) await page(origin, '/terms', 'COST_TERMS_ORIGINAL');
  fixture('transaction');
  for (const origin of origins) { await page(origin, '/info/cost-fixture-00', 'COST_INTERACTIVE_TRANSACTION'); await page(origin, '/terms', 'COST_TERMS_COMMITTED'); }
});
await check('array transactions retain PrismaPromise behavior and refresh both pages', async () => {
  fixture('batch');
  for (const origin of origins) { await page(origin, '/info/cost-fixture-00', 'COST_BATCH_TRANSACTION'); await page(origin, '/info/cost-fixture-01', 'COST_BATCH_SECOND_PAGE'); }
});
await check('rolled-back content never becomes public', async () => {
  fixture('rollback');
  for (const origin of origins) await page(origin, '/info/cost-fixture-00', 'COST_BATCH_TRANSACTION');
});
await check('unpublishing removes a previously cached page from both sites', async () => {
  fixture('draft');
  for (const origin of origins) await page(origin, '/info/cost-fixture-00', '', 404);
});
await check('review caches preserve per-place filtering, newest 200 bound and privacy', async () => {
  for (const origin of origins) { assert.equal((await reviews(origin)).length, 200); const other = await reviews(origin, 'cost-other-place'); assert.equal(other.length, 1); assert.equal(other[0].text, 'OTHER_PLACE_ONLY'); }
  const before = counts();
  for (const origin of origins) for (let i = 0; i < 4; i++) await reviews(origin);
  assert.equal(counts().PlaceReview, before.PlaceReview);
});
await check('empty review sections share the small index without per-place SQL', async () => {
  const before = counts();
  for (const origin of origins) for (let i = 0; i < 30; i++) assert.equal((await reviews(origin, 'empty-fixture-'+i)).length, 0);
  assert.equal(counts().PlaceReview, before.PlaceReview);
});
await check('a failed read executes once and is not cached as a permanent empty result', async () => {
  fixture('hide-review-column');
  const before = counts();
  for (const origin of origins) assert.equal((await reviews(origin)).length, 0);
  const reads = counts().PlaceReviewText - before.PlaceReviewText;
  report.sql.failedReviewReads = reads;
  assert.equal(reads, 2, 'Exactly one failed query per request, no duplicate fallback retry.');
  fixture('restore-review-column');
  for (const origin of origins) assert.equal((await reviews(origin)).length, 200);
});
mkdirSync('cost-results', { recursive: true });
writeFileSync('cost-results/report.json', JSON.stringify(report, null, 2));
console.log('COST_SUMMARY', JSON.stringify(report));
if (report.checks.some(check => check.status !== 'passed')) process.exitCode = 1;
