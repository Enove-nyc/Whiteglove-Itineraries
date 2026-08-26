import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * There is one admin, and it is not this deployment's.
 *
 * THE HOLE THIS CLOSES. This service and the kosher one read the same private
 * store — the owner confirmed UPSTASH_REDIS_REST_URL is set to the same value
 * on both — so /admin here was a second, full-strength door onto exactly the
 * same data. And this deployment carries NO second factor: no
 * lib/admin-2fa-store, no two-factor route, no code field on the sign-in form.
 * The kosher admin asks for six digits; this one asked for the password and
 * nothing else, so anybody holding that password could walk past the
 * authenticator entirely by coming here instead.
 *
 * The tests below hold both halves: the door is shut, and the reason it had to
 * be — that this deployment never grew a second factor — is still true, so if
 * one is ever added here the mismatch is worth revisiting deliberately rather
 * than by accident.
 */

const MIDDLEWARE = readFileSync("middleware.ts", "utf8");

describe("the second admin door is shut", () => {
  it("redirects every admin path away from this deployment", () => {
    assert.match(
      MIDDLEWARE,
      /configuredBrand\(\) === "itineraries" && \(pathname === "\/admin" \|\| pathname\.startsWith\("\/admin\/"\)\)/,
    );
    assert.match(MIDDLEWARE, /BRAND_ORIGIN\.kosher\), 307\)/);
  });

  it("shuts it before the gate, not after", () => {
    // Anything ordered after the admin-host branch or the token check would be
    // reachable on the way past.
    const shut = MIDDLEWARE.indexOf('configuredBrand() === "itineraries" && (pathname === "/admin"');
    const adminHostBranch = MIDDLEWARE.indexOf('if (onAdminHost && pathname.startsWith("/admin"))');
    const gate = MIDDLEWARE.indexOf('adminPath.startsWith("/admin") && adminPath !== "/admin/login"');
    assert.ok(shut > 0 && adminHostBranch > 0 && gate > 0);
    assert.ok(shut < adminHostBranch, "the admin-host branch runs first");
    assert.ok(shut < gate, "the admin gate runs first");
  });

  it("is decided by THIS BUILD's brand, so the kosher admin is untouched", () => {
    // configuredBrand() reads NEXT_PUBLIC_SITE_BRAND, set only on this service.
    // Reading the request's brand instead would shut the admin on the other
    // deployment the moment somebody reached it through an itineraries host.
    assert.ok(MIDDLEWARE.includes("configuredBrand()"));
    const shut = MIDDLEWARE.indexOf('configuredBrand() === "itineraries" && (pathname === "/admin"');
    const clause = MIDDLEWARE.slice(shut, shut + 200);
    assert.ok(!clause.includes("brandFromRequestHeaders"), "the request's brand decides whether the admin exists");
  });
});

describe("the reason it had to be shut is still true", () => {
  it("this deployment still has no second factor to bypass", () => {
    // If any of these ever appear here, the door was shut for a reason that has
    // changed, and that is worth a deliberate decision rather than a surprise.
    const access = readFileSync("app/api/access/route.ts", "utf8");
    assert.ok(!access.includes("checkSecondFactor"), "a second factor arrived; revisit why the admin is shut");
    assert.ok(!access.includes("needsCode"), "a second factor arrived; revisit why the admin is shut");
  });
});
