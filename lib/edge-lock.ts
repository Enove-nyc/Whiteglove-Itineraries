function toBase64Url(bytes: ArrayBuffer) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const input = new Uint8Array(bytes);
  let output = "";
  for (let index = 0; index < input.length; index += 3) {
    const a = input[index];
    const b = input[index + 1];
    const c = input[index + 2];
    output += chars[a >> 2];
    output += chars[((a & 3) << 4) | ((b ?? 0) >> 4)];
    output += index + 1 < input.length ? chars[((b! & 15) << 2) | ((c ?? 0) >> 6)] : "";
    output += index + 2 < input.length ? chars[c! & 63] : "";
  }
  return output.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The signing secret, or null when this deployment has none.
 *
 * WHY THIS CAN BE NULL. This used to fall back to the development secret
 * unconditionally — including in production — while lib/secure-access.ts,
 * which does the same job for server actions, returns null there instead.
 *
 * With neither WHITE_GLOVE_SESSION_SECRET nor ADMIN_PASSWORD set, the two
 * disagreed in the worst possible direction: the middleware let every admin
 * page render, and every server action on those pages refused with "Please
 * sign in as an administrator". A fully drawn dashboard where nothing works
 * and nothing says why.
 *
 * Routing fails open, authorisation fails closed, and the visible half was the
 * open one. Both halves refuse now. The development fallback stays for
 * development only, matching secure-access.ts exactly.
 */
function edgeSecret(): string | null {
  const configured = process.env.WHITE_GLOVE_SESSION_SECRET?.trim() || process.env.ADMIN_PASSWORD?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return "white-glove-development-secret";
  return null;
}

/** The token for a scope, or null when nothing can be signed at all. */
export async function edgeAccessToken(scope: "admin" | "site"): Promise<string | null> {
  const secret = edgeSecret();
  if (!secret) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`white-glove:${scope}`));
  return toBase64Url(signature);
}

/**
 * Which round of access cookies is current, read in the edge runtime.
 *
 * Mirrors accessGeneration() in lib/signin-log.ts. The middleware is the only
 * thing standing between a revoked cookie and the site, so it has to read this
 * itself rather than trust what the cookie claims.
 */
export async function edgeAccessGeneration(): Promise<number> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return 0;
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/get/white-glove:access-generation`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as { result?: string };
    const value = Number(payload.result);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

/**
 * Mint a site-access cookie in the edge runtime.
 *
 * Mirrors mintSiteAccess() in lib/site-access.ts. `minutes` undefined means it
 * does not expire.
 */
export async function edgeMintSiteAccess(generation: number, minutes?: number): Promise<string> {
  const expires = minutes === undefined ? 0 : Date.now() + minutes * 60_000;
  const secret = edgeSecret();
  // With no signing secret this deployment cannot mint a real access cookie.
  // Return one that will never verify (edgeSiteAccessValid fails closed on the
  // same null secret) rather than signing with the public development key.
  if (!secret) return `${expires}.${generation}.`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`white-glove:site:${expires}:${generation}`));
  return `${expires}.${generation}.${toBase64Url(bytes)}`;
}

/**
 * Is this site-access cookie still good?
 *
 * Mirrors checkSiteAccess() in lib/site-access.ts, which uses node's crypto and
 * so cannot run here. Same secret, same input, same output — a cookie minted by
 * one verifies against the other. If these two ever disagree, either a
 * five-minute code lasts forever or somebody is thrown out mid-visit.
 */
export async function edgeSiteAccessValid(value: string | undefined, generation: number): Promise<boolean> {
  if (!value) return false;

  // No signing secret — nothing can be a valid cookie. Fails closed in
  // production exactly as edgeSecret() does for the admin token, rather than
  // verifying against a key that is public in the source tree.
  const secret = edgeSecret();
  if (!secret) return false;

  // The old bare token, from before expiries existed. Honoured until the first
  // revoke, so shipping this does not sign everybody out.
  if (generation === 0 && value === (await edgeAccessToken("site"))) return true;

  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const expires = Number(parts[0]);
  const cookieGeneration = Number(parts[1]);
  if (!Number.isFinite(expires) || !Number.isFinite(cookieGeneration)) return false;
  if (cookieGeneration !== generation) return false;

  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`white-glove:site:${expires}:${cookieGeneration}`),
  );
  const expected = toBase64Url(signatureBytes);

  if (parts[2].length !== expected.length) return false;
  let differences = 0;
  for (let i = 0; i < expected.length; i += 1) differences |= parts[2].charCodeAt(i) ^ expected.charCodeAt(i);
  if (differences !== 0) return false;

  // The whole point of the five-minute code: the expiry is checked here, not
  // left to the browser to honour.
  return expires === 0 || Date.now() <= expires;
}

/**
 * Sections that have moved, old address to new.
 *
 * A lock is a stored path, and a path that no longer serves a page stops
 * locking anything — silently. `/booking` was the flights-and-hotels page; it
 * is `/book` now, and it redirects there before this check ever runs. An owner
 * who had locked `/booking` would have had it quietly opened by the rename,
 * which is the one failure mode a lock must not have, so the old address keeps
 * locking the page it became.
 *
 * The old entry stays visible in the admin as a custom path, so it can be
 * tidied up deliberately rather than disappearing on somebody.
 */
const RENAMED_SECTIONS: Record<string, string> = {
  "/booking": "/book",
};

/** Adds the current address of any section that has been renamed. */
export function withRenamedSections(paths: string[]): string[] {
  const result: string[] = [];
  const add = (path: string) => {
    if (path && !result.includes(path)) result.push(path);
  };
  for (const raw of paths) {
    const path = raw.trim();
    if (!path) continue;
    add(path);
    add(RENAMED_SECTIONS[path.endsWith("/") ? path.slice(0, -1) : path]);
  }
  return result;
}

export async function edgeLockedPaths(): Promise<string[]> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return [];
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/get/white-glove:locked-paths`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const payload = (await response.json()) as { result?: string };
    if (!payload.result) return [];
    const parsed = JSON.parse(payload.result);
    return Array.isArray(parsed) ? withRenamedSections(parsed.filter((p): p is string => typeof p === "string")) : [];
  } catch {
    return [];
  }
}

export async function edgeSiteIsLocked() {
  if (process.env.SITE_LOCK_ENABLED === "true") return true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/get/white-glove:site-lock`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const payload = (await response.json()) as { result?: string };
    return payload.result === "on";
  } catch {
    return false;
  }
}

/**
 * The signed-in account's email, verified in the edge runtime.
 *
 * Mirrors lib/account-session.ts, which uses node's crypto and so cannot run
 * in middleware. Same secret, same input, same base64url output — a cookie
 * minted by one verifies against the other.
 */
export async function edgeAccountEmail(cookieValue?: string): Promise<string | null> {
  if (!cookieValue) return null;
  const separator = cookieValue.lastIndexOf(".");
  if (separator <= 0) return null;
  const encodedEmail = cookieValue.slice(0, separator);
  const signature = cookieValue.slice(separator + 1);
  if (!encodedEmail || !signature) return null;

  let email: string;
  try {
    email = decodeURIComponent(encodedEmail).trim().toLowerCase();
  } catch {
    return null;
  }

  // No signing secret — no account cookie can be trusted. Fails closed like the
  // admin and site-access checks, never falling back to the public dev key.
  const secret = edgeSecret();
  if (!secret) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expectedBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(email));
  const expected = toBase64Url(expectedBytes);

  // Constant-time compare: a length check first, then every byte.
  if (signature.length !== expected.length) return null;
  let differences = 0;
  for (let i = 0; i < signature.length; i += 1) differences |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  return differences === 0 ? email : null;
}

/**
 * May this account see the site while it is closed?
 *
 * Reads the same roster the admin Team screen writes. The owner from
 * OWNER_EMAIL always passes, so a misconfigured store can never shut the owner
 * out of their own site.
 */
export async function edgeAccountHasSiteAccess(email: string | null): Promise<boolean> {
  if (!email) return false;
  const owner = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
  if (owner && email === owner) return true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/get/white-glove:team`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as { result?: string };
    if (!payload.result) return false;
    const members = JSON.parse(payload.result) as Array<{ email?: string; admin?: boolean; siteAccess?: boolean }>;
    return members.some((m) => (m.email || "").trim().toLowerCase() === email && (m.siteAccess || m.admin));
  } catch {
    return false;
  }
}
