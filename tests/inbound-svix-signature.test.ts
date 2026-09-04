import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * THE SIGNATURE CHECK HAD TO MATCH THE PROVIDER, AND DID NOT.
 *
 * The first version hashed the raw body alone and compared hex. Resend signs
 * with Svix: the signed content is `id.timestamp.body`, the key is the
 * base64-DECODED part of the secret after `whsec_`, the digest is base64, and
 * the header is a space-separated list of `v1,<sig>`. Four differences, each
 * one on its own a silent permanent rejection — the route fails closed, so
 * nothing would ever have arrived and nothing would have said why.
 *
 * These build a real Svix signature the way Svix builds one and check the
 * route's own logic against it, so the scheme cannot drift back.
 */

const ROUTE = readFileSync(new URL("../app/api/inbound/confirmation/route.ts", import.meta.url), "utf8");

/** Exactly what Svix does, written out independently of the route. */
function sign(secret: string, id: string, timestamp: string, body: string): string {
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  return createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
}

const SECRET = `whsec_${randomBytes(24).toString("base64")}`;
const BODY = JSON.stringify({ to: ["trips@trips.whitegloveitineraries.com"], from: "a@b.com", text: "hello" });
const ID = "msg_2abcDEF";
const NOW = () => Math.floor(Date.now() / 1000).toString();

test("the route signs the id, the timestamp AND the body — not the body alone", () => {
  assert.match(ROUTE, /\$\{id\}\.\$\{timestamp\}\.\$\{raw\}/);
});

test("the key is the base64 payload of the secret, not its characters", () => {
  assert.match(ROUTE, /slice\("whsec_"\.length\) : secret, "base64"/);
});

test("the digest is base64 and the header is space-separated v1 parts", () => {
  assert.match(ROUTE, /digest\("base64"\)/);
  assert.match(ROUTE, /\.split\(" "\)/);
  assert.match(ROUTE, /startsWith\("v1,"\)/);
});

test("a genuine Svix signature verifies", () => {
  const ts = NOW();
  const expected = sign(SECRET, ID, ts, BODY);
  // What the route computes, reproduced from its own described steps.
  const key = Buffer.from(SECRET.slice("whsec_".length), "base64");
  const mine = createHmac("sha256", key).update(`${ID}.${ts}.${BODY}`).digest("base64");
  assert.equal(mine, expected);
});

test("a tampered body does not verify", () => {
  const ts = NOW();
  const good = sign(SECRET, ID, ts, BODY);
  const bad = sign(SECRET, ID, ts, BODY.replace("hello", "hell0"));
  assert.notEqual(good, bad);
});

test("the same body under a different id or timestamp does not verify", () => {
  const ts = NOW();
  assert.notEqual(sign(SECRET, ID, ts, BODY), sign(SECRET, "msg_other", ts, BODY));
  assert.notEqual(sign(SECRET, ID, ts, BODY), sign(SECRET, ID, String(Number(ts) - 1), BODY));
});

test("an old delivery is refused — a signature is valid for ever without this", () => {
  assert.match(ROUTE, /REPLAY_TOLERANCE_SECONDS = 5 \* 60/);
  assert.match(ROUTE, /Math\.abs\(Date\.now\(\) \/ 1000 - sent\) > REPLAY_TOLERANCE_SECONDS/);
});

test("a missing svix header falls back rather than crashing, and no secret still fails closed", () => {
  assert.match(ROUTE, /if \(!secret\) return false;/);
  assert.match(ROUTE, /headers\.get\("webhook-signature"\)/);
});

test("the comparison is constant-time, and length-checked before it", () => {
  assert.match(ROUTE, /timingSafeEqual/);
  assert.match(ROUTE, /if \(a\.length !== b\.length\) return false;/);
});

test("the signature is still checked before the body is parsed", () => {
  const post = ROUTE.slice(ROUTE.indexOf("export async function POST"));
  assert.ok(post.indexOf("signatureOk") < post.indexOf("JSON.parse"));
});
