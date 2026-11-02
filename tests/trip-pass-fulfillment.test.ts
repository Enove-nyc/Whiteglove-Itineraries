import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createHmac } from "node:crypto";
import { mockBillingRouteDependencies } from "./helpers/billing-route.mjs";
const routeMocks = mockBillingRouteDependencies();
const { POST } = await import("../app/api/billing/webhook/route");
import { fulfillTripPassPurchase } from "../lib/trip-pass-purchase";
import { grantTripPass, spendTripPass } from "../lib/trip-pass-store";
import { paymentRedisAvailable, paymentRedisFixture } from "./helpers/payment-redis.mjs";

// CI runs these against real Redis; a plain unit-test setup can skip the optional integration dependency.
const fulfillmentTest = paymentRedisAvailable() ? test : test.skip;
const account = "buyer@example.test";
const accountKey = `white-glove:account:${account}`;
const passesKey = `white-glove:trip-passes:${account}`;
const purchaseKey = `white-glove:one-time-purchase:${account}`;
const receiptKey = (session: string) => `white-glove:fulfilled-checkout:${session}`;
const input = { account, plan: "one_trip", sessionId: "cs_fixture", tripId: "trip-a" };
const originalFetch = globalThis.fetch;
const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const originalWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
let notifications = 0;
let notificationFails = false;
let fixture: ReturnType<typeof paymentRedisFixture>;
let beforeCommand: ((command: Array<string | number>) => Promise<void>) | undefined;
let afterCommand: ((command: Array<string | number>) => void) | undefined;
beforeEach(() => {
  fixture = paymentRedisFixture({
    [accountKey]: JSON.stringify({ email: account, passwordHash: "preserved", plan: "free" }),
    [`white-glove:account-data:${account}`]: JSON.stringify({ trips: [{ id: "trip-a" }] }),
  });
  notifications = 0;
  notificationFails = false;
  (globalThis as unknown as Record<symbol, unknown>)[Symbol.for("whiteglove.payment-test")] = { notify: async () => { notifications += 1; if (notificationFails) throw new Error("notification failed"); return true; } };
  process.env.STRIPE_WEBHOOK_SECRET = "fixture-webhook-secret";
  beforeCommand = undefined;
  afterCommand = undefined;
  process.env.UPSTASH_REDIS_REST_URL = "https://storage.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fixture-token";
  globalThis.fetch = async (_url, init) => {
    const command = JSON.parse(String(init?.body)) as Array<string | number>;
    await beforeCommand?.(command);
    try {
      const result = fixture.execute(command);
      afterCommand?.(command);
      return Response.json({ result });
    } catch (error) {
      // A simulated lost HTTP response must propagate, unlike a Redis error.
      if (error instanceof TypeError) throw error;
      return Response.json({ error: String(error) });
    }
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = originalWebhookSecret;
  if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
  else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
  if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
  else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
});
const passes = () => JSON.parse(fixture.state[passesKey] ?? "[]");

fulfillmentTest("a purchase atomically saves pass, plan, purchase record and permanent receipt", async () => {
  assert.equal(await fulfillTripPassPurchase(input), "created");
  assert.equal(passes().length, 1);
  assert.equal(passes()[0].tripId, "trip-a");
  const stored = JSON.parse(fixture.state[accountKey]);
  assert.equal(stored.plan, "one_trip");
  assert.equal(stored.passwordHash, "preserved");
  assert.equal(JSON.parse(fixture.state[purchaseKey]).plan, "one_trip");
  assert.equal(JSON.parse(fixture.state[receiptKey(input.sessionId)]).passId, passes()[0].id);
});
fulfillmentTest("concurrent and completed/async redeliveries of one session create one pass", async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => fulfillTripPassPurchase(input)));
  assert.equal(results.filter((x) => x === "created").length, 1);
  assert.equal(passes().length, 1);
});
fulfillmentTest("a lost response after commit can be retried without granting twice", async () => {
  afterCommand = () => { throw new TypeError("connection lost after commit"); };
  await assert.rejects(fulfillTripPassPurchase(input));
  afterCommand = undefined;
  assert.equal(await fulfillTripPassPurchase(input), "duplicate");
  assert.equal(passes().length, 1);
});
fulfillmentTest("an outage before commit leaves no completed receipt and can be retried", async () => {
  beforeCommand = async () => { throw new TypeError("offline"); };
  await assert.rejects(fulfillTripPassPurchase(input));
  assert.equal(fixture.state[receiptKey(input.sessionId)], undefined);
  assert.equal(passes().length, 0);
  beforeCommand = undefined;
  assert.equal(await fulfillTripPassPurchase(input), "created");
});
fulfillmentTest("missing account or corrupt pass data fails before any fulfillment write", async () => {
  fixture = paymentRedisFixture({});
  await assert.rejects(fulfillTripPassPurchase(input));
  assert.equal(fixture.state[receiptKey(input.sessionId)], undefined);
  assert.equal(passes().length, 0);
  fixture = paymentRedisFixture({ [accountKey]: JSON.stringify({ plan: "free" }), [passesKey]: "not JSON" });
  await assert.rejects(fulfillTripPassPurchase(input));
  assert.equal(fixture.state[receiptKey(input.sessionId)], undefined);
  assert.equal(JSON.parse(fixture.state[accountKey]).plan, "free");
});
fulfillmentTest("a legacy pre-fulfillment marker requires reconciliation, not another grant", async () => {
  fixture = paymentRedisFixture({ [accountKey]: JSON.stringify({ plan: "free" }), "white-glove:stripe-events:cs_fixture": "1" });
  await assert.rejects(fulfillTripPassPurchase(input));
  assert.equal(fixture.state[receiptKey(input.sessionId)], undefined);
  assert.equal(passes().length, 0);
});
fulfillmentTest("a second distinct purchase for a covered or deleted trip remains spare", async () => {
  await fulfillTripPassPurchase(input);
  await fulfillTripPassPurchase({ ...input, sessionId: "cs_second" });
  await fulfillTripPassPurchase({ ...input, sessionId: "cs_deleted", tripId: "deleted-trip" });
  assert.equal(passes().length, 3);
  assert.equal(passes().filter((p: { tripId: string | null }) => p.tripId === null).length, 2);
});
fulfillmentTest("the same session cannot fulfill a different account", async () => {
  await fulfillTripPassPurchase(input);
  await assert.rejects(fulfillTripPassPurchase({ ...input, account: "other@example.test" }));
  assert.equal(passes().length, 1);
});
fulfillmentTest("missing configuration and Redis errors are not treated as successful grants", async () => {
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  await assert.rejects(fulfillTripPassPurchase(input), /not configured/);
  process.env.UPSTASH_REDIS_REST_TOKEN = "fixture-token";
  globalThis.fetch = async () => Response.json({ error: "permission denied" });
  await assert.rejects(fulfillTripPassPurchase(input), /command failed/);
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  await assert.rejects(fulfillTripPassPurchase(input), /request failed/);
});
fulfillmentTest("a concurrent purchase cannot be overwritten by a stale pass-spend write", async () => {
  await fulfillTripPassPurchase({ ...input, tripId: undefined });
  beforeCommand = async (command) => {
    if (command[0] === "EVAL" && command[2] === 1) {
      beforeCommand = undefined;
      await fulfillTripPassPurchase({ ...input, sessionId: "cs_during_spend", tripId: undefined });
    }
  };
  assert.deepEqual(await spendTripPass(account, "trip-a"), { ok: true });
  assert.equal(passes().length, 2);
  assert.equal(passes().filter((p: { tripId: string | null }) => p.tripId === "trip-a").length, 1);
});
fulfillmentTest("a failed ledger read never overwrites paid passes with an empty ledger", async () => {
  await fulfillTripPassPurchase(input);
  beforeCommand = async (command) => { if (command[0] === "GET") throw new TypeError("read failed"); };
  assert.equal(await grantTripPass(account), null);
  assert.equal(passes().length, 1);
});

async function webhook(type = "checkout.session.completed", paid = true, validSignature = true) {
  const body = JSON.stringify({ id: "evt_fixture", type, data: { object: {
    id: input.sessionId, mode: "payment", payment_status: paid ? "paid" : "unpaid",
    metadata: { account, plan: "one_trip", trip: "trip-a" },
  } } });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", validSignature ? "fixture-webhook-secret" : "wrong")
    .update(`${timestamp}.${body}`).digest("hex");
  return POST(new Request("https://app.example.test/api/billing/webhook", {
    method: "POST", body, headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
  }) as Parameters<typeof POST>[0]);
}

fulfillmentTest("the signed HTTP handler returns 503 on storage failure, then 200 on successful retry", async () => {
  beforeCommand = async () => { throw new TypeError("offline"); };
  assert.equal((await webhook()).status, 503);
  assert.equal(fixture.state[receiptKey(input.sessionId)], undefined);
  beforeCommand = undefined;
  assert.equal((await webhook()).status, 200);
  assert.equal(passes().length, 1);
});
fulfillmentTest("completed and async HTTP deliveries share one permanent grant and one notification", async () => {
  assert.equal((await webhook()).status, 200);
  assert.equal((await webhook("checkout.session.async_payment_succeeded")).status, 200);
  assert.equal(passes().length, 1);
  assert.equal(notifications, 1);
});
fulfillmentTest("an HTTP retry after a lost commit response does not duplicate purchased access", async () => {
  afterCommand = () => { throw new TypeError("lost response"); };
  assert.equal((await webhook()).status, 503);
  afterCommand = undefined;
  assert.equal((await webhook()).status, 200);
  assert.equal(passes().length, 1);
});
fulfillmentTest("unpaid and incorrectly signed HTTP events never grant a pass", async () => {
  assert.equal((await webhook("checkout.session.completed", false)).status, 200);
  assert.equal((await webhook("checkout.session.async_payment_succeeded", false)).status, 200);
  assert.equal((await webhook("checkout.session.completed", true, false)).status, 400);
  assert.equal(passes().length, 0);
  assert.equal(notifications, 0);
});
fulfillmentTest("a notification failure cannot undo a saved grant or duplicate it on retry", async () => {
  notificationFails = true;
  assert.equal((await webhook()).status, 200);
  assert.equal((await webhook()).status, 200);
  assert.equal(passes().length, 1);
  assert.equal(notifications, 1);
});
fulfillmentTest("a missing account is retryable at the HTTP boundary, never acknowledged as fulfilled", async () => {
  fixture = paymentRedisFixture({});
  assert.equal((await webhook()).status, 503);
  assert.equal(fixture.state[receiptKey(input.sessionId)], undefined);
});

void routeMocks;
