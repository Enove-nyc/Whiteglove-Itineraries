import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contentSecurityPolicy, reportingEndpointsHeader } from "@/lib/csp-policy";
import { blockedOrigin, parseViolations } from "@/lib/csp-reports";

/**
 * The Content-Security-Policy, and the endpoint that learns what it gets wrong.
 *
 * It ships Report-Only first because getting the host list wrong takes the
 * booking form or the card entry down silently. These tests hold the two
 * things that make that phase safe: the policy names every host read out of the
 * source, and the report sink understands whatever the browser sends it.
 */

const CSP = contentSecurityPolicy("/api/csp-report");

describe("the policy names what the site actually loads", () => {
  it("carries the hosts found by reading the app", () => {
    // Each of these is in the code: the map script, the OSM tiles, the address
    // autocomplete, the Travelpayouts snippet and widget, and the Duffel /
    // Stripe / Evervault card hosts. A host dropped from here is a page that
    // would break the day the policy enforces.
    for (const host of [
      "https://maps.googleapis.com",
      "https://*.tile.openstreetmap.org",
      "https://photon.komoot.io",
      "https://emrldco.com",
      "https://tp.media",
      "https://js.stripe.com",
      "https://js.evervault.com",
      "https://api.duffel.com",
    ]) {
      assert.ok(CSP.includes(host), `${host} is missing from the policy`);
    }
  });

  it("keeps the safe floor: no plugins, no framing us, self is the base", () => {
    assert.match(CSP, /object-src 'none'/);
    assert.match(CSP, /frame-ancestors 'self'/);
    assert.match(CSP, /base-uri 'self'/);
    assert.match(CSP, /default-src 'self'/);
  });

  it("allows what the Report-Only pass caught the widget and card form doing", () => {
    // Not in the source, only seen once running: the Emerald snippet phoning
    // home (connect), the Aviasales widget's Sentry and Google ad hosts, and a
    // Google Fonts stylesheet a third-party component loads. Allowed so
    // enforcing does not break the booking search or the card form.
    for (const host of [
      "https://emrldco.com",
      "https://sentry.avs.io",
      "https://*.doubleclick.net",
      "https://*.googlesyndication.com",
      "https://fonts.googleapis.com",
      "https://fonts.gstatic.com",
    ]) {
      assert.ok(CSP.includes(host), `${host} was reported and must be allowed before enforcing`);
    }
    // emrldco must reach connect-src, not only script-src — it makes a
    // background request, which is what the report showed.
    const connect = CSP.split(";").find((d) => d.trim().startsWith("connect-src")) ?? "";
    assert.ok(connect.includes("https://emrldco.com"), "emrldco must be in connect-src");
  });

  it("LEAVES unsafe-eval OUT, so Report-Only can answer whether it is needed", () => {
    // Google Maps has historically wanted it. Whether it still does is the
    // question this phase exists to answer, so it must not be pre-granted —
    // that would hide the very report that settles it.
    assert.doesNotMatch(CSP, /'unsafe-eval'/);
  });

  it("points reports at the endpoint, both the old way and the new", () => {
    assert.match(CSP, /report-uri \/api\/csp-report/);
    assert.match(CSP, /report-to csp/);
    assert.equal(reportingEndpointsHeader("/api/csp-report"), 'csp="/api/csp-report"');
  });
});

describe("the report sink understands the browser", () => {
  it("reads the old csp-report shape", () => {
    const v = parseViolations(
      { "csp-report": { "violated-directive": "connect-src", "blocked-uri": "https://x.example.com/a?b=1", "document-uri": "https://site/book?q=secret" } },
      "",
    );
    assert.equal(v.length, 1);
    assert.equal(v[0].directive, "connect-src");
    assert.equal(v[0].blocked, "https://x.example.com");
    assert.equal(v[0].documentPath, "/book", "the query string must be dropped");
  });

  it("reads the newer Reporting API array", () => {
    const v = parseViolations(
      [{ type: "csp-violation", body: { effectiveDirective: "frame-src", blockedURL: "https://widget.aviasales.com/f", documentURL: "https://site/book" } }],
      "",
    );
    assert.equal(v.length, 1);
    assert.equal(v[0].directive, "frame-src");
    assert.equal(v[0].blocked, "https://widget.aviasales.com");
  });

  it("reduces a blocked URL to what a policy is written in", () => {
    assert.equal(blockedOrigin("https://tp.media/content?marker=1&x=2"), "https://tp.media");
    assert.equal(blockedOrigin("inline"), "inline");
    assert.equal(blockedOrigin("eval"), "eval");
    assert.equal(blockedOrigin(""), "unknown");
  });

  it("drops a shape it does not recognise rather than guessing", () => {
    assert.deepEqual(parseViolations({ nonsense: true }, ""), []);
    assert.deepEqual(parseViolations("a string", ""), []);
    assert.deepEqual(parseViolations(null, ""), []);
  });

  it("falls back to the referer for the page when the report omits it", () => {
    const v = parseViolations(
      [{ type: "csp-violation", body: { effectiveDirective: "img-src", blockedURL: "https://t.example/x" } }],
      "https://site/destinations/rome?utm=1",
    );
    assert.equal(v[0].documentPath, "/destinations/rome");
  });
});

describe("the header is wired in and now enforces", () => {
  it("ships as the enforcing Content-Security-Policy, not Report-Only", async () => {
    const { readFileSync } = await import("node:fs");
    const config = readFileSync("next.config.ts", "utf8");
    // The report-only pass is done: real use of the maps, the booking search
    // and the card form reported nothing left to allow, so the header enforces.
    assert.match(config, /key: "Content-Security-Policy",/, "the header should enforce now");
    assert.doesNotMatch(
      config,
      /key: "Content-Security-Policy-Report-Only"/,
      "the report-only header should be gone once enforcing",
    );
    assert.match(config, /Reporting-Endpoints/);
  });

  it("keeps reporting on while enforcing, so a block is never silent", () => {
    // An enforcing policy that also reports: a resource stopped on a page the
    // report-only pass never exercised is both blocked and surfaced on the
    // admin Security screen, rather than just breaking.
    assert.match(CSP, /report-uri \/api\/csp-report/);
    assert.match(CSP, /report-to csp/);
  });
});

describe("the partner script's own second file is not blocked", () => {
  /**
   * The Travelpayouts verification snippet loads from https://emrldco.com,
   * which the policy allows — and that script then asks for a second file of
   * its own over PLAIN http, from the same host. Measured in a browser on
   * /app/preview: "Refused to load the script 'http://emrldco.com/chunk...js'
   * because it violates ... script-src", against a host three lines above it
   * in the same policy.
   *
   * That block is not the policy being strict. A browser refuses an insecure
   * script on a secure page whatever the policy says, so this was failing for
   * every visitor on every page carrying the snippet, and arriving at the
   * report sink looking like a missing host.
   */
  it("upgrades an http subresource rather than refusing it", () => {
    assert.match(CSP, /upgrade-insecure-requests/);
  });

  it("does not admit a single insecure host to make that work", () => {
    // The directive rewrites the request; it never widens a source list. If a
    // plain-http origin is ever added to one of these, this catches it.
    assert.doesNotMatch(CSP, /\shttp:\/\//);
  });
});
