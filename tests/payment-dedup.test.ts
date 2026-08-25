import assert from "node:assert/strict";
import { test } from "node:test";
import { mergePaymentRecord } from "@/lib/account-store";
import { paidCentsFor, type PaymentRecord } from "@/data/trip-payments";

function rec(over: Partial<PaymentRecord> & Pick<PaymentRecord, "status" | "stripePaymentIntentId">): PaymentRecord {
  return {
    id: over.stripePaymentIntentId,
    unitKey: "open",
    amountCents: 5000,
    currency: "USD",
    receiptNumber: "R-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

test("a genuine duplicate (same intent, same outcome) changes nothing", () => {
  const existing = [rec({ status: "succeeded", stripePaymentIntentId: "pi_1" })];
  assert.equal(mergePaymentRecord(existing, rec({ status: "succeeded", stripePaymentIntentId: "pi_1" })), null);
});

test("a success after a failed attempt on the SAME intent is recorded and supersedes the failure", () => {
  // The exact double-charge bug: a declined card then a good card, same pi_.
  const afterFail = [rec({ status: "failed", stripePaymentIntentId: "pi_1" })];
  const merged = mergePaymentRecord(afterFail, rec({ status: "succeeded", stripePaymentIntentId: "pi_1" }));
  assert.ok(merged, "the success must be recorded, not swallowed as a duplicate");
  // The failed row is gone; only the success remains.
  assert.equal(merged!.length, 1);
  assert.equal(merged![0].status, "succeeded");
  // And the money now counts toward the balance.
  const balance = { currency: "USD", splitMode: "equal" as const, assignments: [], schedule: [], showTotalToTravelers: false, payments: merged! };
  assert.equal(paidCentsFor(balance, "open"), 5000);
});

test("a stale failure arriving after success never overwrites settled money", () => {
  const afterSuccess = [rec({ status: "succeeded", stripePaymentIntentId: "pi_1" })];
  assert.equal(mergePaymentRecord(afterSuccess, rec({ status: "failed", stripePaymentIntentId: "pi_1" })), null);
});

test("a first failed attempt is still recorded", () => {
  const merged = mergePaymentRecord([], rec({ status: "failed", stripePaymentIntentId: "pi_1" }));
  assert.equal(merged?.length, 1);
  assert.equal(merged![0].status, "failed");
});

test("payments on different intents both land", () => {
  const one = mergePaymentRecord([], rec({ status: "succeeded", stripePaymentIntentId: "pi_1" }))!;
  const two = mergePaymentRecord(one, rec({ status: "succeeded", stripePaymentIntentId: "pi_2" }))!;
  assert.equal(two.length, 2);
});
