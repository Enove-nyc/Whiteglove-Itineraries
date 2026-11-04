import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { groupKey, memberCookieName, readMember, signMember } from '../lib/trip-group-identity.ts';
import { personalDocumentProblem, personalWalletScope, MAX_PERSONAL_DOCUMENT_BYTES } from '../lib/personal-travel-wallet.ts';
import { sendTripGroup, readTripGroup } from '../lib/trip-group-store.ts';

const code = 'Abc_def-12345';
const secret = 'isolated-test-secret';
const member = { id: randomUUID(), name: 'Miriam', group: groupKey(code) };
test('a signed participant identity is limited to its own trip', () => {
  const cookie = signMember(member, secret);
  assert.deepEqual(readMember(cookie, code, secret), member);
  assert.equal(readMember(cookie, 'Another-trip', secret), null);
  assert.equal(readMember(cookie, code, 'wrong-secret'), null);
  assert.equal(readMember(cookie + '.extra', code, secret), null);
  assert.equal(readMember(undefined, code, secret), null);
});
test('changing a participant name or id invalidates the signature', () => {
  const cookie = signMember(member, secret);
  const [, signature] = cookie.split('.');
  const forged = Buffer.from(JSON.stringify({ ...member, name: 'Someone else' })).toString('base64url');
  assert.equal(readMember(`${forged}.${signature}`, code, secret), null);
  assert.equal(readMember(signMember({ ...member, name: '' }, secret), code, secret), null);
  assert.notEqual(memberCookieName(code), memberCookieName('Other-trip'));
});
test('wallet scopes separate trips without retaining the access code', async () => {
  const scope = await personalWalletScope(code);
  assert.equal(scope.length, 64);
  assert.equal(scope, await personalWalletScope(code));
  assert.notEqual(scope, await personalWalletScope('another-trip'));
  assert.ok(!scope.includes(code));
});
test('wallet accepts supported documents and rejects executable or mislabeled content', async () => {
  assert.equal(await personalDocumentProblem(new Blob(['%PDF-1.7\n'], { type: 'application/pdf' })), null);
  assert.equal(await personalDocumentProblem(new Blob([new Uint8Array([255,216,255,224])], { type: 'image/jpeg' })), null);
  assert.equal(await personalDocumentProblem(new Blob([new Uint8Array([137,80,78,71,13,10,26,10])], { type: 'image/png' })), null);
  assert.ok(await personalDocumentProblem(new Blob(['<script>alert(1)</script>'], { type: 'application/pdf' })));
  assert.ok(await personalDocumentProblem(new Blob(['<svg/>'], { type: 'image/svg+xml' })));
  assert.ok(await personalDocumentProblem(new Blob([], { type: 'application/pdf' })));
  assert.ok(await personalDocumentProblem(new Blob([new Uint8Array(MAX_PERSONAL_DOCUMENT_BYTES + 1)], { type: 'application/pdf' })));
});
test('concurrent group sends append both messages without exposing private credentials', async () => {
  const prior = { fetch: globalThis.fetch, url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN };
  const stored = new Map();
  process.env.UPSTASH_REDIS_REST_URL = 'https://isolated.invalid';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
  globalThis.fetch = async (_url, init) => {
    const args = JSON.parse(init.body);
    if (args[0] === 'EVAL') {
      const rows = stored.get(args[3]) ?? [];
      rows.push(args[4]); stored.set(args[3], rows.slice(-500));
      return Response.json({ result: stored.get(args[3]) });
    }
    if (args[0] === 'LRANGE') return Response.json({ result: stored.get(args[1]) ?? [] });
    throw new Error('Unexpected Redis operation');
  };
  try {
    await Promise.all([sendTripGroup(member, 'Meet at the entrance'), sendTripGroup({ ...member, id: randomUUID(), name: 'David' }, 'On my way')]);
    const messages = await readTripGroup(member.group);
    assert.equal(messages.length, 2);
    assert.deepEqual(messages.map((row) => row.name), ['Miriam', 'David']);
    assert.equal((await readTripGroup(groupKey('different-trip'))).length, 0);
    assert.ok(!JSON.stringify(messages).includes(code));
    globalThis.fetch = async () => Response.json({ error: 'store is unavailable' });
    await assert.rejects(() => readTripGroup(member.group), /unavailable/);
  } finally {
    globalThis.fetch = prior.fetch;
    for (const [key, value] of [['UPSTASH_REDIS_REST_URL', prior.url], ['UPSTASH_REDIS_REST_TOKEN', prior.token]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
