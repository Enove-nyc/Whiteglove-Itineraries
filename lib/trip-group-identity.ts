import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type TripGroupMember = { id: string; name: string; group: string };
export function groupKey(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
export function memberCookieName(code: string): string {
  return `wg-trip-member-${groupKey(code).slice(0, 16)}`;
}
export function signMember(member: TripGroupMember, secret: string): string {
  const payload = Buffer.from(JSON.stringify(member)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
export function readMember(value: string | undefined, code: string, secret: string): TripGroupMember | null {
  if (!value || value.length > 1024 || !secret) return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const member = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TripGroupMember;
    return member.group === groupKey(code) && typeof member.id === "string" && /^[a-f0-9-]{36}$/.test(member.id)
      && typeof member.name === "string" && member.name.trim().length > 0 && member.name.length <= 60 ? member : null;
  } catch { return null; }
}
