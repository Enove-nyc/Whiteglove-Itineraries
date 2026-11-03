import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { BRAND_ORIGIN } from "@/lib/site-brand-core";

const SECRET_KEY = "white-glove:content-cache-invalidation-key";
const WINDOW_MS = 5 * 60 * 1000;
export const CONTENT_CACHE_PATH = "/api/internal/content-cache";
type Notice = { at: number; nonce: string };
let secret: string | null = null;
let pendingSecret: Promise<string> | null = null;

async function command<T>(args: (string | number)[]): Promise<T> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Content cache coordination is not configured.");
  const response = await fetch(url.replace(/\/$/, ""), {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args), cache: "no-store", signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Content cache coordination is unavailable.");
  const payload = await response.json() as { result?: T; error?: unknown };
  if (payload.error || !("result" in payload)) throw new Error("Content cache coordination failed.");
  return payload.result as T;
}

async function sharedKey(): Promise<string> {
  if (secret) return secret;
  if (!pendingSecret) pendingSecret = (async () => {
    let value = await command<string | null>(["GET", SECRET_KEY]);
    if (value === null) {
      await command(["SET", SECRET_KEY, randomBytes(32).toString("hex"), "NX"]);
      value = await command<string | null>(["GET", SECRET_KEY]);
    }
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error("Content cache coordination key is invalid.");
    secret = value;
    return value;
  })().finally(() => { pendingSecret = null; });
  return pendingSecret;
}

function signature(notice: Notice, key: string): string {
  return createHmac("sha256", key).update(JSON.stringify([notice.at, notice.nonce])).digest("hex");
}

/** No account/admin identity is inferred from headers; the shared store holds the private key. */
export async function authenticateContentCacheNotice(raw: unknown, supplied: string | null, now = Date.now()): Promise<Notice | null> {
  if (!raw || typeof raw !== "object" || typeof supplied !== "string" || !/^[a-f0-9]{64}$/.test(supplied)) return null;
  const notice = raw as Notice;
  if (!Number.isSafeInteger(notice.at) || Math.abs(now - notice.at) > WINDOW_MS || typeof notice.nonce !== "string" || !/^[a-f0-9]{32}$/.test(notice.nonce)) return null;
  const expected = signature(notice, await sharedKey());
  return timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex")) ? notice : null;
}

function origins(): string[] {
  // Only disposable loopback builds may override the two fixed production destinations.
  const fixture = process.env.CONTENT_CACHE_FIXTURE_ORIGINS;
  if (fixture && process.env.AUDIT_ISOLATED === "1" && new URL(process.env.UPSTASH_REDIS_REST_URL || "https://invalid").hostname === "127.0.0.1") {
    const result = fixture.split(",").map(value => new URL(value));
    if (!result.length || result.some(url => url.hostname !== "127.0.0.1" || url.protocol !== "http:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash)) throw new Error("Cache fixtures require loopback origins.");
    return result.map(url => url.origin);
  }
  return Object.values(BRAND_ORIGIN);
}

/** Called after committed writes, never on a timer. Failures are visible, and do not undo a saved edit. */
export async function notifyContentCaches(): Promise<void> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return;
  try {
    const notice: Notice = { at: Date.now(), nonce: randomBytes(16).toString("hex") };
    const mac = signature(notice, await sharedKey());
    const results = await Promise.allSettled(origins().map(async origin => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch(origin + CONTENT_CACHE_PATH, {
            method: "POST", headers: { "Content-Type": "application/json", "X-White-Glove-Cache-Signature": mac },
            body: JSON.stringify(notice), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
          });
          if (response.ok) return;
          if (response.status >= 400 && response.status < 500) break;
        } catch { /* A sleeping service can fail its first wake request; retry briefly. */ }
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
      }
      throw new Error("Cache refresh was not acknowledged.");
    }));
    if (results.some(result => result.status === "rejected")) console.error("[content-cache] A saved edit could not refresh every website cache. Check deployment health; cache expiry remains the fallback.");
  } catch {
    console.error("[content-cache] A saved edit could not coordinate cache refresh. Check the shared store; cache expiry remains the fallback.");
  }
}
