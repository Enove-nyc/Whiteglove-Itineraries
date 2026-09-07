import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * THE HECHSHER LOOKUP CANNOT OUTGROW A URL.
 *
 * useHechsherim asked for every kosher place on a page in one GET, ids joined
 * into the query string. With the full directory in the database the admin
 * hechsherim page built a request line longer than Node accepts and got 431
 * back — and because the hook treats a failed lookup as "nothing confirmed",
 * every badge simply stayed unverified, with no error anywhere. The same
 * hook draws the badges on the public destination pages (KosherNearby).
 *
 * The ids travel in a POST body now. This holds that, and documents the size
 * that broke it.
 */

describe("the ids go in the body, not the address", () => {
  const hook = readFileSync("lib/use-hechsherim.ts", "utf8").replace(/\/\/[^\n]*/g, "");
  const route = readFileSync("app/api/kosher/hechsherim/route.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("posts JSON rather than building a query string", () => {
    assert.match(hook, /fetch\("\/api\/kosher\/hechsherim", \{\s*method: "POST"/);
    assert.match(hook, /body: JSON\.stringify\(\{ ids: key\.split\(","\) \}\)/);
    assert.doesNotMatch(hook, /\?ids=/);
  });

  it("the route answers POST with the same filter and cap as GET", () => {
    assert.match(route, /export async function POST/);
    assert.match(route, /export async function GET/);
    // One shared answer(): curated ids only, at most 200 — for both verbs.
    assert.equal((route.match(/return answer\(/g) ?? []).length, 2);
    assert.match(route, /\.filter\(isCuratedKosherPlaceId\)\s*\.slice\(0, 200\)/);
  });

  it("ignores a body that is not a list of strings", () => {
    assert.match(route, /Array\.isArray\(body\?\.ids\) \? body\.ids\.filter\(\(id\): id is string => typeof id === "string"\) : \[\]/);
  });

  it("documents why: two hundred real ids do not fit a request line", () => {
    // The cap is 200 ids; the ids are "eatery:<city>-<name>" and average well
    // over 30 characters. Node's default limit on the whole request head is
    // 16 KB, and the page that broke had far more than 200 candidates before
    // the cap — the cap is applied on the server, after the URL was built.
    const sample = Array.from({ length: 200 }, (_, n) => `eatery:some-long-city-name-${n}-and-the-restaurant-name-${n}`);
    const url = `/api/kosher/hechsherim?ids=${encodeURIComponent(sample.join(","))}`;
    assert.ok(url.length > 12_000, `a 200-id query string is already ${url.length} bytes`);
  });
});
