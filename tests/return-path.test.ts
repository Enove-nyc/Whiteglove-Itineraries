import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { withReturnPath } from "@/lib/return-path";

/**
 * Signing back in returns you to the page you were thrown out of.
 *
 * The owner's report: signed out while working on one admin screen, password
 * back in, and the admin front page every single time. The middleware guarding
 * /admin already puts the wanted page in ?next= and that whole chain works —
 * traced end to end. What did not was the redirect that actually fires when a
 * session lapses under him, which pushed the bare login address.
 *
 * THIS DEPLOYMENT HAS NO SECOND FACTOR, so the remembered-device half of the
 * same change (Whiteglove#366) has nothing here to attach to. Only the return
 * path and the session lengths were ported.
 */

describe("being signed out does not lose the page", () => {
  const LOGIN = "/admin/login";

  it("carries the page they were on", () => {
    // The owner's report: signed out mid-screen, password back in, and the
    // admin front page every time.
    assert.equal(
      withReturnPath(LOGIN, "/admin/settings/proof"),
      "/admin/login?next=%2Fadmin%2Fsettings%2Fproof",
    );
  });

  it("keeps the query string, because half a page is not the page", () => {
    assert.equal(
      withReturnPath(LOGIN, "/admin/alerts?tab=sent"),
      "/admin/login?next=%2Fadmin%2Falerts%3Ftab%3Dsent",
    );
  });

  it("works on a deployment served from an admin hostname", () => {
    // There the paths carry no /admin prefix and the login is at /login.
    assert.equal(withReturnPath("/login", "/settings/proof"), "/login?next=%2Fsettings%2Fproof");
  });

  it("never sends a login page back to itself", () => {
    for (const here of ["/login", "/admin/login", "/admin/login?next=%2Fx", "/login/"]) {
      assert.equal(withReturnPath(LOGIN, here), LOGIN, `${here} would loop`);
    }
  });

  it("refuses to be turned into an open redirect", () => {
    // A timed-out session must not become a way to bounce somebody off-site.
    for (const here of ["//evil.example.com", "https://evil.example.com", "http://evil.example.com/x", "evil"]) {
      assert.equal(withReturnPath(LOGIN, here), LOGIN, `${here} was accepted`);
    }
  });

  it("falls back to the plain login address when there is no page", () => {
    assert.equal(withReturnPath(LOGIN, null), LOGIN);
    assert.equal(withReturnPath(LOGIN, undefined), LOGIN);
    assert.equal(withReturnPath(LOGIN, ""), LOGIN);
  });

  it("is what the idle redirect actually calls", () => {
    const source = readFileSync("components/IdleLogout.tsx", "utf8");
    assert.ok(source.includes("withReturnPath(redirectTo, here)"), "the idle redirect drops the page again");
  });
});
