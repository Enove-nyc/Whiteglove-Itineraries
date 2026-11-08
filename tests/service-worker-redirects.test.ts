import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * A REDIRECT REACHES THE BROWSER AS A REDIRECT.
 *
 * A service worker may not answer a navigation with a response it arrived at
 * through a redirect — a navigation's redirect mode is "manual", and the
 * browser discards such an answer as a network error. fetch() follows
 * redirects by default, so every redirecting page came back to the worker as
 * the final page, flagged `redirected`, and died on the doorstep.
 *
 * It matters most here: signed in, this site's "/" redirects to /app or
 * /advisor, so the home page failed for exactly the people who have the app
 * installed. Found on the kosher side, where the admin hostname's root always
 * redirects to /login and the dashboard could not be opened at all, and
 * reproduced against this file. Both workers carry the fix.
 */
const SW = readFileSync("public/sw.js", "utf8");

describe("a navigation that redirects is handed back to the browser", () => {
  it("navigations ask for the redirect unfollowed", () => {
    assert.match(
      SW,
      /const fresh = isNav\s*\?\s*fetch\(req\.url, \{ credentials: "same-origin", redirect: "manual" \}\)\s*:\s*fetch\(new Request\(req, \{ cache: "reload" \}\)\);/,
    );
  });

  it("everything that is not a navigation still follows redirects as before", () => {
    const arm = SW.slice(SW.indexOf("const fresh = isNav"), SW.indexOf("return fresh"));
    assert.match(arm, /fetch\(new Request\(req, \{ cache: "reload" \}\)\)/);
    assert.ok(!/cache: "reload", redirect/.test(arm));
  });

  it("the offline fallback is untouched: a page miss with no network still lands on /offline", () => {
    assert.match(SW, /isNav \? caches\.match\("\/offline"\) : undefined/);
  });
});
