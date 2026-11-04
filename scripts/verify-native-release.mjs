import { X509Certificate, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

// Public certificate fingerprints only. Signing keys remain in Actions secrets.
const expected = process.env.EXPECTED_UPLOAD_CERT_SHA256?.replaceAll(':', '').toLowerCase();
assert.match(expected ?? '', /^[a-f0-9]{64}$/, 'A previous release certificate fingerprint is required');
const apk = 'android/app/build/outputs/apk/release/app-release.apk';
const aab = 'android/app/build/outputs/bundle/release/app-release.aab';
const androidSdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
assert.ok(androidSdk, 'Android SDK path is required');
const tools = readdirSync(join(androidSdk, 'build-tools')).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).find(version => existsSync(join(androidSdk, 'build-tools', version, 'apksigner')));
assert.ok(tools, 'apksigner is required');
const directory = join(androidSdk, 'build-tools', tools);
const apkVerification = execFileSync(join(directory, 'apksigner'), ['verify', '--print-certs', apk], { encoding: 'utf8' });
const fingerprint = /Signer #1 certificate SHA-256 digest:\s*([a-f0-9]+)/i.exec(apkVerification)?.[1]?.toLowerCase();
assert.equal(fingerprint, expected, 'APK signing certificate changed');
const aabVerification = execFileSync('jarsigner', ['-J-Duser.language=en', '-verify', aab], { encoding: 'utf8' });
assert.match(aabVerification, /jar verified\./i, 'The AAB must have a valid JAR signature');
const publicCertificates = execFileSync('keytool', ['-J-Duser.language=en', '-printcert', '-jarfile', aab, '-rfc'], { encoding: 'utf8' }).match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
assert.ok(publicCertificates.some(cert => new X509Certificate(cert).fingerprint256.replaceAll(':', '').toLowerCase() === expected), 'AAB signing certificate changed');
const metadata = execFileSync(join(directory, 'aapt2'), ['dump', 'badging', apk], { encoding: 'utf8' });
const gradle = readFileSync('android/app/build.gradle', 'utf8');
const packageName = /applicationId\s+"([^"]+)"/.exec(gradle)?.[1];
const versionCode = /versionCode\s+(\d+)/.exec(gradle)?.[1];
assert.ok(metadata.includes(`package: name='${packageName}'`), 'APK application ID changed');
assert.ok(metadata.includes(`versionCode='${versionCode}'`), 'APK version code does not match the reviewed project');
assert.match(metadata, /targetSdkVersion:'36'/, 'Android target SDK must remain 36');
const report = { applicationId: packageName, versionCode: Number(versionCode), targetSdkVersion: 36, uploadCertificateSha256: expected,
  apkSha256: createHash('sha256').update(readFileSync(apk)).digest('hex'), aabSha256: createHash('sha256').update(readFileSync(aab)).digest('hex') };
writeFileSync('release-verification.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
