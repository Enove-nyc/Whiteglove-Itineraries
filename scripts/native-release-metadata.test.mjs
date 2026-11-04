import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apkCertificateFingerprint, jarSignatureIsVerified, certificateBlocks, gradleIdentity } from './native-release-metadata.mjs';
const cert = 'e9d5dcfaefe96ea39fca11eede0233cc3db2c41a592df56e6fd28129db7dda09';
test('reads the actual apksigner output format without confusing file hashes', () => {
  assert.equal(apkCertificateFingerprint(`Signer #1 certificate DN: CN=White Glove\nSigner #1 certificate SHA-256 digest: ${cert}\nSigner #1 certificate SHA-1 digest: not-the-certificate\n`), cert);
  assert.equal(apkCertificateFingerprint(`Signer #1 certificate SHA-256 digest: ${cert.toUpperCase()}`), cert);
  assert.equal(apkCertificateFingerprint(`Verifies\nV2 Signer: certificate DN: CN=White Glove Admin\nV2 Signer: certificate SHA-256 digest: ${cert}\nV2 Signer: public key SHA-256 digest: ${'0'.repeat(64)}\n`), cert);
  assert.equal(apkCertificateFingerprint(`V2 Signer: public key SHA-256 digest: ${cert}`), undefined);
  assert.equal(apkCertificateFingerprint(`Signer #2 certificate SHA-256 digest: ${cert}`), undefined);
  assert.equal(apkCertificateFingerprint(`V2 Signer: certificate SHA-256 digest: ${cert}aa`), undefined);
  assert.equal(apkCertificateFingerprint(`APK SHA-256: ${cert}`), undefined);
  assert.equal(apkCertificateFingerprint(''), undefined);
});
test('requires a verified JAR and extracts multiline public certificates', () => {
  assert.ok(jarSignatureIsVerified('jar verified.\nWarning: certificate is self-signed.'));
  assert.ok(!jarSignatureIsVerified('jar is unsigned.'));
  assert.ok(!jarSignatureIsVerified('verification failed'));
  const pem='-----BEGIN CERTIFICATE-----\nYWJj\n-----END CERTIFICATE-----';
  assert.deepEqual(certificateBlocks('Signer #1:\n'+pem+'\nSigner #2:\n'+pem),[pem,pem]);
});
test('uses the application ID and version code rather than namespace or SDK', () => {
  assert.deepEqual(gradleIdentity('namespace "different.namespace"\ncompileSdk 36\napplicationId "com.whitegloveadvisor.app"\nversionCode 12\nversionName "1.8"'), {applicationId:'com.whitegloveadvisor.app',versionCode:12});
  assert.throws(()=>gradleIdentity('namespace "not.an.application"'),/required/);
});
