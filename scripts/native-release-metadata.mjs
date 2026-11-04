export function apkCertificateFingerprint(output) {
  return /Signer #1 certificate SHA-256 digest:\s*([a-f0-9]{64})/i.exec(output)?.[1]?.toLowerCase();
}
export function jarSignatureIsVerified(output) {
  return /jar verified\./i.test(output);
}
export function certificateBlocks(output) {
  return output.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
}
export function gradleIdentity(source) {
  const applicationId = /applicationId\s+"([^"]+)"/.exec(source)?.[1];
  const version = /versionCode\s+(\d+)/.exec(source)?.[1];
  if (!applicationId || !version) throw new Error('Reviewed application ID and versionCode are required');
  return { applicationId, versionCode: Number(version) };
}
