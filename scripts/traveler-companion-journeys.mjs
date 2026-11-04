// Isolated fixtures only. This script refuses remote app or database targets.
import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.COMPANION_TEST_URL || 'http://127.0.0.1:3002';
const redis = process.env.COMPANION_TEST_REDIS_URL || 'http://127.0.0.1:6380';
for (const target of [base, redis]) assert.equal(new URL(target).hostname, '127.0.0.1', 'Tests must use disposable local services');
const secret = 'isolated-companion-test-secret';
const email = `traveler-companion-${randomBytes(8).toString('hex')}@example.test`;
const code = `CI${randomBytes(12).toString('base64url')}`;
const otherCode = `CI${randomBytes(12).toString('base64url')}`;
const pdfObjects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Length 44 >>\nstream\nBT /F1 20 Tf 30 350 Td (Boarding pass) Tj ET\nendstream',
];
let pdf = '%PDF-1.4\n'; const offsets = [0];
for (let i = 0; i < pdfObjects.length; i++) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${pdfObjects[i]}\nendobj\n`; }
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => String(offset).padStart(10, '0') + ' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
async function command(...args) {
  const response = await fetch(redis, { method: 'POST', body: JSON.stringify(args) });
  const result = await response.json();
  assert.ok(!result.error, result.error);
  return result.result;
}
await command('DEL', `white-glove:trip-group:${createHash('sha256').update(code).digest('hex')}`);
const itinerary = { title: 'Rome family trip', travelerName: 'Miriam', travelers: [], startDate: '2026-12-01', endDate: '2026-12-03', flights: [], lodging: [], activities: [], notes: '' };
const record = { email, name: 'Miriam', salt: 'fixture', passwordHash: 'fixture', verifiedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
await command('SET', `white-glove:account:${email}`, JSON.stringify(record));
await command('SET', `white-glove:account-data:${email}`, JSON.stringify({ route: [], favorites: [], activeTripId: 'fixture-trip', trips: [
  { id: 'fixture-trip', name: 'Rome family trip', itinerary, shareId: code, route: [], createdAt: record.createdAt, updatedAt: record.createdAt },
  { id: 'fixture-other', name: 'Another trip', itinerary, shareId: otherCode, route: [], createdAt: record.createdAt, updatedAt: record.createdAt },
] }));
for (const token of [code, otherCode]) await command('SET', `white-glove:itinerary-share:${token}`, JSON.stringify({ ownerEmail: email, kind: 'self' }));
const session = `${encodeURIComponent(email)}.${createHmac('sha256', secret).update(email).digest('base64url')}`;
const browser = await chromium.launch({ ...(process.env.COMPANION_CHROMIUM ? { executablePath: process.env.COMPANION_CHROMIUM } : {}), args: ['--no-sandbox'] });
const one = await browser.newContext({ viewport: { width: 390, height: 844 } });
const two = await browser.newContext({ viewport: { width: 390, height: 844 } });
const errors = [];
async function post(context, action, extra = {}) { return context.request.post(`${base}/api/trip-group`, { data: { code, action, ...extra } }); }
try {
  assert.equal((await post(one, 'send', { text: 'Not joined' })).status(), 401);
  assert.equal((await post(one, 'read', { code: 'unknownCode_12345' })).status(), 404);
  assert.equal((await post(one, 'join', { name: 'Miriam' })).status(), 200);
  assert.equal((await post(two, 'join', { name: 'David' })).status(), 200);
  const sent = await Promise.all([post(one, 'send', { text: 'Meet by the entrance' }), post(two, 'send', { text: 'On my way' })]);
  assert.ok(sent.every((response) => response.status() === 200));
  const thread = await (await post(one, 'read')).json();
  assert.equal(thread.messages.length, 2);
  assert.deepEqual(new Set(thread.messages.map((message) => message.name)), new Set(['Miriam', 'David']));
  assert.equal((await post(one, 'read', { code: otherCode })).status(), 401);
  assert.equal((await post(one, 'send', { text: 'x'.repeat(2001) })).status(), 400);
  assert.equal((await one.request.post(`${base}/api/trip-group`, { headers: { Origin: 'https://unrelated.invalid' }, data: { code, action: 'read' } })).status(), 403);
  const ownerHeaders = { Cookie: `white_glove_account=${session}` };
  assert.equal((await one.request.post(`${base}/api/account/companion-code`, { headers: ownerHeaders, data: { tripId: 'not-owned' } })).status(), 404);
  const ownCode = await one.request.post(`${base}/api/account/companion-code`, { headers: ownerHeaders, data: { tripId: 'fixture-trip' } });
  assert.equal(ownCode.status(), 200); assert.equal((await ownCode.json()).code, code);
  await command('DEL', `white-glove:itinerary-share:${code}`);
  assert.equal((await post(one, 'read')).status(), 404);
  await command('SET', `white-glove:itinerary-share:${code}`, JSON.stringify({ ownerEmail: email, kind: 'self' }));
  console.log('PASS: real API, signed participants, concurrent Redis writes, cross-trip isolation, origin checks, owner-only code creation and revoked-code handling');

  for (const context of [one, two]) await context.addInitScript(() => { localStorage.setItem('whiteGloveBetaNotice', '6'); localStorage.setItem('whiteGloveBetaNoticeShown', '6'); });
  const page = await one.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  let documentLoads = 0;
  page.on('request', (request) => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentLoads++; });
  await page.goto(`${base}/i/${code}/app`);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  await page.waitForLoadState('networkidle');
  assert.equal(documentLoads, 1, 'First worker installation must not reload the active page');
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await page.getByText('Meet by the entrance', { exact: true }).waitFor();
  await page.getByLabel('Message your trip group', { exact: true }).fill('See you by the entrance');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByText('See you by the entrance', { exact: true }).waitFor();
  const received = await (await post(two, 'read')).json();
  assert.ok(received.messages.some((message) => message.text === 'See you by the entrance' && message.name === 'Miriam'));
  assert.equal(await page.getByRole('button', { name: 'Add channel', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Wallet', exact: true }).click();
  await page.getByLabel('Add a PDF or photo').setInputFiles({ name: 'boarding-pass.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
  await page.getByRole('button', { name: 'boarding-pass.pdf' }).waitFor();
  await page.getByText('Saved on this device. You can open it without a connection.', { exact: true }).waitFor();
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Wallet', exact: true }).click();
  await page.getByRole('button', { name: 'boarding-pass.pdf' }).waitFor();
  const secondPage = await two.newPage();
  await secondPage.goto(`${base}/i/${code}/app`);
  await secondPage.getByRole('button', { name: 'Wallet', exact: true }).click();
  await secondPage.getByText('No personal documents saved for this trip yet.', { exact: true }).waitFor();
  assert.equal(await secondPage.getByRole('button', { name: 'boarding-pass.pdf' }).count(), 0);
  await one.setOffline(true);
  await page.getByRole('button', { name: 'boarding-pass.pdf' }).click();
  await page.getByRole('button', { name: 'Close document' }).waitFor();
  await page.getByText('Opening your document…', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('dialog', { name: 'boarding-pass.pdf' }).getByRole('alert').count(), 0);
  assert.ok(await page.locator('canvas').evaluate((canvas) => canvas.width > 0 && canvas.height > 0));
  await page.screenshot({ path: 'companion-results/offline-pdf-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Close document' }).click();
  await page.getByText('No connection — showing what was last loaded', { exact: false }).waitFor();
  await one.setOffline(false);
  await page.getByText('No connection — showing what was last loaded', { exact: false }).waitFor({ state: 'hidden' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await mkdir('companion-results', { recursive: true });
  await page.screenshot({ path: 'companion-results/personal-wallet-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Remove file', exact: true }).click();
  await page.getByRole('button', { name: 'boarding-pass.pdf' }).waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('button', { name: 'boarding-pass.pdf' }).count(), 0);
  console.log('PASS: mobile group chat, wallet persistence, private device files, offline file bytes, removal and viewport fit');

  const samplePage = await one.newPage();
  await samplePage.goto(`${base}/app/preview`);
  await samplePage.getByRole('button', { name: 'Chat', exact: true }).click();
  await samplePage.getByRole('region', { name: 'Sample trip group chat' }).waitFor();
  assert.equal(await samplePage.getByRole('button', { name: 'Advisor', exact: true }).count(), 0);
  await samplePage.screenshot({ path: 'companion-results/sample-group-chat-mobile.png', fullPage: true });
  await samplePage.close();
  console.log('PASS: sample preview matches the traveler-only companion');

  if (process.env.COMPANION_TEST_SEARCH === '1') {
    const searchContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await searchContext.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true }; localStorage.setItem('whiteGloveBetaNotice', '6'); localStorage.setItem('whiteGloveBetaNoticeShown', '6'); });
    const searchPage = await searchContext.newPage();
    searchPage.on('pageerror', (error) => errors.push(error.message));
    await searchPage.goto(base);
    await searchPage.waitForURL('**/travel');
    await searchPage.getByRole('heading', { name: 'Find what you need.' }).waitFor();
    assert.equal(await searchPage.getByRole('navigation', { name: 'Main', exact: true }).isVisible().catch(() => false), false);
    assert.ok(await searchPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await searchPage.screenshot({ path: 'companion-results/kosher-search-mobile.png', fullPage: true });
    await searchPage.getByRole('link', { name: 'AI companion', exact: true }).click();
    await searchPage.getByRole('heading', { name: 'AI travel companion', exact: true }).waitFor();
    for (const viewport of [{ width: 768, height: 1024 }, { width: 1024, height: 768 }]) {
      await searchPage.setViewportSize(viewport);
      await searchPage.getByRole('navigation', { name: 'Travel app', exact: true }).getByRole('link', { name: 'Search', exact: true }).click();
      await searchPage.getByRole('heading', { name: 'Find what you need.' }).waitFor();
      assert.ok(await searchPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await searchPage.getByRole('link', { name: 'AI companion', exact: true }).click();
      await searchPage.getByRole('heading', { name: 'AI travel companion', exact: true }).waitFor();
    }
    await searchContext.close();
    console.log('PASS: installed Kosher Travel search home, app navigation and AI screen');
  }
  const tablet = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true });
  await tablet.addInitScript((native) => { if (native) window.Capacitor = { isNativePlatform: () => true }; }, process.env.COMPANION_TEST_SEARCH !== '1');
  const tabletPage = await tablet.newPage();
  tabletPage.on('pageerror', (error) => errors.push(error.message));
  const affiliateRequests = [];
  tabletPage.on('request', (request) => { if (new URL(request.url()).hostname.endsWith('emrldco.com')) affiliateRequests.push(request.url()); });
  await tabletPage.goto(`${base}/app/preview`);
  for (const viewport of [{ width: 768, height: 1024 }, { width: 1024, height: 768 }]) {
    await tabletPage.setViewportSize(viewport);
    for (const tab of ['Chat', 'Wallet', 'You', 'Trip']) {
      await tabletPage.getByRole('button', { name: tab, exact: true }).click();
      if (tab === 'Chat') await tabletPage.getByRole('region', { name: 'Sample trip group chat' }).waitFor();
    }
    assert.ok(await tabletPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await tabletPage.screenshot({ path: `companion-results/tablet-${viewport.width}.png`, fullPage: true });
  }
  await tabletPage.goto(`${base}/app?enter=1`);
  await tabletPage.getByRole('textbox', { name: 'Trip code', exact: true }).waitFor();
  assert.deepEqual(affiliateRequests, [], 'Private companion routes must not load affiliate scripts');
  await tablet.close();
  console.log('PASS: installed tablet portrait/landscape tabs, code entry and private route scripts');
  assert.deepEqual(errors, [], 'Browser errors');
} catch (error) {
  await mkdir('companion-results', { recursive: true });
  for (const [index, page] of one.pages().entries()) await page.screenshot({ path: `companion-results/failure-${index}.png`, fullPage: true }).catch(() => {});
  throw error;
} finally { await browser.close(); }
