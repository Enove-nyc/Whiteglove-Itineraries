import { createHmac, timingSafeEqual } from "crypto";

const cookieName = "white_glove_account";

/**
 * The secret every account session cookie is signed with.
 *
 * Returns null when the deployment has no real secret. The fallback used to be
 * a constant string compiled into the source, which meant a production deploy
 * with neither variable set signed every `white_glove_account` cookie with a
 * value anybody could read here and forge offline. This fails closed instead,
 * exactly as `secure-access.ts` does for the admin cookie: with no secret, no
 * session is minted and none validates. The dev constant survives only outside
 * production, for local work.
 */
function secret(): string | null {
  const configured = process.env.WHITE_GLOVE_SESSION_SECRET?.trim() || process.env.ADMIN_PASSWORD?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return "white-glove-development-secret";
  return null;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function createAccountSession(email: string) {
  const key = secret();
  // Fail closed rather than mint a cookie signed with a guessable constant.
  if (!key) throw new Error("Cannot create an account session: WHITE_GLOVE_SESSION_SECRET (or ADMIN_PASSWORD) is not set.");
  const normalized = normalizeEmail(email);
  const signature = createHmac("sha256", key).update(normalized).digest("base64url");
  return `${encodeURIComponent(normalized)}.${signature}`;
}

export function parseAccountSession(value?: string) {
  if (!value) return null;
  // Split on the LAST "." — the signature is base64url (no dots), but the
  // encoded email keeps its dots (e.g. "gmail.com"), so splitting on the first
  // "." would slice the email apart and never validate.
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;
  const encodedEmail = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!encodedEmail || !signature) return null;
  // HMAC-SHA256 uses 43 base64url characters. Reject malformed input before
  // decoding it or passing unequal byte lengths to timingSafeEqual.
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  let email: string;
  try {
    email = decodeURIComponent(encodedEmail);
  } catch {
    return null;
  }
  const key = secret();
  // No secret, no valid session — nobody is authenticated rather than everybody.
  if (!key) return null;
  const expected = createHmac("sha256", key).update(normalizeEmail(email)).digest("base64url");
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return normalizeEmail(email);
}

export function accountCookieName() {
  return cookieName;
}
