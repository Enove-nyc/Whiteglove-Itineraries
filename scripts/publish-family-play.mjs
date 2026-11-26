import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const packageName = 'com.whitegloveitineraries.family';
const certificate = '3af98de9a3da39f9ff3a34f1debf00b330ad2edc19e65003ff7012c8ed8f680a';
const root = 'https://androidpublisher.googleapis.com';
export function verifyBundle(report, bundle) {
  assert.equal(report.applicationId, packageName);
  assert.ok(Number.isInteger(report.versionCode) && report.versionCode > 0);
  assert.ok(Number.isInteger(report.minSdkVersion) && report.minSdkVersion >= 24);
  assert.ok(report.targetSdkVersion >= 36);
  assert.equal(report.uploadCertificateSha256, certificate);
  assert.equal(createHash('sha256').update(bundle).digest('hex'), report.aabSha256);
}
export async function publish(report, bundle, token, request = fetch) {
  verifyBundle(report, bundle);
  assert.ok(token, 'Missing authorized Play publishing token');
  const path = '/androidpublisher/v3/applications/' + packageName + '/edits';
  async function api(suffix, method = 'GET', body, upload = false) {
    const response = await request(root + (upload ? '/upload' : '') + path + suffix, {
      method, headers: { Authorization: 'Bearer ' + token, ...(body === undefined ? {} : { 'Content-Type': upload ? 'application/octet-stream' : 'application/json' }) },
      body: body === undefined ? undefined : upload ? body : JSON.stringify(body),
    });
    if (!response.ok) throw new Error('Google Play ' + method + ' ' + suffix + ': HTTP ' + response.status + ' ' + await response.text());
    const raw = await response.text();
    return raw ? JSON.parse(raw) : {};
  }
  const edit = await api('', 'POST', {});
  const id = '/' + encodeURIComponent(edit.id);
  let committed = false;
  try {
    const track = await api(id + '/tracks/internal');
    const codes = (track.releases || []).flatMap(release => release.versionCodes || []).map(Number);
    assert.ok(codes.every(code => code <= report.versionCode), 'Refusing to replace a newer internal release');
    const available = await api(id + '/bundles');
    const existing = (available.bundles || []).find(item => Number(item.versionCode) === report.versionCode);
    if (existing) assert.equal(existing.sha256?.toLowerCase(), report.aabSha256, 'Existing version code has different bundle bytes');
    else {
      const uploaded = await api(id + '/bundles?uploadType=media', 'POST', bundle, true);
      assert.equal(Number(uploaded.versionCode), report.versionCode);
      assert.equal(uploaded.sha256?.toLowerCase(), report.aabSha256);
    }
    await api(id + '/tracks/internal', 'PUT', { track: 'internal', releases: [{ versionCodes: [String(report.versionCode)], status: 'completed' }] });
    await api(id + ':validate', 'POST');
    await api(id + ':commit', 'POST');
    committed = true;
  } finally {
    if (!committed) await api(id, 'DELETE').catch(() => {});
  }
  const inspection = await api('', 'POST', {});
  const inspectionId = '/' + encodeURIComponent(inspection.id);
  try {
    const live = await api(inspectionId + '/tracks/internal');
    assert.ok(live.releases?.some(release => release.status === 'completed' && release.versionCodes?.includes(String(report.versionCode))), 'Committed version not confirmed on internal track');
  } finally {
    await api(inspectionId, 'DELETE');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = process.argv[2];
  assert.ok(directory, 'Release artifact directory required');
  const report = JSON.parse(readFileSync(join(directory, 'release-verification.json'), 'utf8'));
  await publish(report, readFileSync(join(directory, 'app-release.aab')), process.env.PLAY_ACCESS_TOKEN);
  console.log('Confirmed internal testing version ' + report.versionCode);
}
