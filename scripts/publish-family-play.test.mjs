import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { publish, verifyBundle } from './publish-family-play.mjs';
const bundle = Buffer.from('fictional test bundle');
const report = { applicationId: 'com.whitegloveitineraries.family', versionCode: 2, minSdkVersion: 24, targetSdkVersion: 36, uploadCertificateSha256: '3af98de9a3da39f9ff3a34f1debf00b330ad2edc19e65003ff7012c8ed8f680a', aabSha256: createHash('sha256').update(bundle).digest('hex') };
test('reject wrong package, SDK and modified artifact', () => {
  assert.throws(() => verifyBundle({ ...report, applicationId: 'other' }, bundle));
  assert.throws(() => verifyBundle({ ...report, minSdkVersion: 22 }, bundle));
  assert.throws(() => verifyBundle(report, Buffer.from('other')));
});
function mock(newer = false) {
  const calls = [];
  let edits = 0;
  const request = async (url, options) => {
    const suffix = url.split('/edits')[1];
    calls.push([options.method, suffix]);
    let value = {};
    if (!suffix) value = { id: 'edit' + ++edits };
    else if (suffix.endsWith('/tracks/internal') && options.method === 'GET') value = { releases: edits === 2 ? [{ status: 'completed', versionCodes: ['2'] }] : newer ? [{ versionCodes: ['3'] }] : [] };
    else if (suffix.endsWith('?uploadType=media')) value = { versionCode: 2, sha256: report.aabSha256 };
    return new Response(JSON.stringify(value), { status: 200 });
  };
  return { calls, request };
}
test('uploads, validates, commits and verifies internal only', async () => {
  const { calls, request } = mock();
  await publish(report, bundle, 'fictional-token', request);
  assert.ok(calls.some(([method, route]) => method === 'PUT' && route === '/edit1/tracks/internal'));
  assert.ok(calls.some(([method, route]) => method === 'POST' && route === '/edit1:commit'));
  assert.ok(calls.every(([, route]) => !route.includes('/production')));
});
test('refuses newer release and cleans edit', async () => {
  const { calls, request } = mock(true);
  await assert.rejects(publish(report, bundle, 'fictional-token', request), /newer/);
  assert.deepEqual(calls.at(-1), ['DELETE', '/edit1']);
});
