import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { identifySiteCode, verifyAccessPassword } from "../lib/access-passwords";

const originalFetch = globalThis.fetch;

/**
 * @types/node declares NODE_ENV read-only, and it is — for the app. These tests
 * exist to prove the development-only escape hatch is development-only, which
 * cannot be shown without standing in both environments.
 */
function setNodeEnv(value: string) {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

function hashPassword(password: string, salt: string) {
  return pbkdf2Sync(password, salt, 120000, 64, "sha256").toString("hex");
}

function mockStoredSitePassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const stored = JSON.stringify({ salt, hash: hashPassword(password, salt) });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("site-password")) {
      return new Response(JSON.stringify({ result: stored }), { status: 200 });
    }
    return new Response(JSON.stringify({ result: null }), { status: 200 });
  }) as typeof fetch;
}

describe("access passwords", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("accepts the env site password in development even when Redis has a different stored hash", async () => {
    setNodeEnv("development");
    process.env.SITE_ACCESS_PASSWORD = "2833";
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    mockStoredSitePassword("other-full-code");

    assert.equal(await verifyAccessPassword("site", "2833"), true);
    assert.equal(await verifyAccessPassword("site", " 2833 "), true);
    assert.equal(await verifyAccessPassword("site", "wrong"), false);
    assert.equal(await verifyAccessPassword("site", "other-full-code"), true);
  });

  it("does not fall back to env in production when Redis has a stored password", async () => {
    setNodeEnv("production");
    process.env.SITE_ACCESS_PASSWORD = "2833";
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    mockStoredSitePassword("other-full-code");

    assert.equal(await verifyAccessPassword("site", "2833"), false);
    assert.equal(await verifyAccessPassword("site", "other-full-code"), true);
    setNodeEnv("development");
  });

  it("accepts the admin password on the site gate in development only", async () => {
    setNodeEnv("development");
    process.env.ADMIN_PASSWORD = "6281003";
    process.env.SITE_ACCESS_PASSWORD = "2833";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    assert.equal(await identifySiteCode("6281003"), "full");
    assert.equal(await identifySiteCode("2833"), "full");

    setNodeEnv("production");
    assert.equal(await identifySiteCode("6281003"), null);
    assert.equal(await identifySiteCode("2833"), "full");
    setNodeEnv("development");
  });
});
