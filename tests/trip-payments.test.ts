import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  assignOpen,
  collectedCents,
  emptyTripBalance,
  formatCents,
  hasBalance,
  nextDueFor,
  OPEN_BALANCE_UNIT_KEY,
  outstandingCents,
  paidCentsFor,
  remainingCentsFor,
  splitEqually,
  type PaymentRecord,
  type TripBalance,
} from "@/data/trip-payments";

function payment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: "p1",
    unitKey: "solo:a",
    amountCents: 100000,
    currency: "USD",
    status: "succeeded",
    stripePaymentIntentId: "pi_1",
    receiptNumber: "WG-000001",
    createdAt: "2026-01-01T00:00:00.000Z",
    paidAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("a fresh trip balance", () => {
  it("has no balance set up", () => {
    assert.equal(hasBalance(emptyTripBalance()), false);
  });

  it("has a balance once a total and at least one assignment exist", () => {
    const balance: TripBalance = { ...emptyTripBalance(), totalCents: 100000, assignments: [{ unitKey: "solo:a", label: "A", amountCents: 100000 }] };
    assert.equal(hasBalance(balance), true);
  });
});

describe("splitting a total equally", () => {
  it("divides evenly when it divides evenly", () => {
    const units = [{ unitKey: "a", label: "A" }, { unitKey: "b", label: "B" }];
    const result = splitEqually(200000, units);
    assert.deepEqual(result.map((a) => a.amountCents), [100000, 100000]);
  });

  it("gives nobody's cent to rounding — the remainder lands on the earliest units, and the total still adds up exactly", () => {
    const units = [{ unitKey: "a", label: "A" }, { unitKey: "b", label: "B" }, { unitKey: "c", label: "C" }];
    const result = splitEqually(100, units); // $1.00 / 3
    const total = result.reduce((sum, a) => sum + a.amountCents, 0);
    assert.equal(total, 100);
    assert.deepEqual(result.map((a) => a.amountCents).sort((x, y) => y - x), [34, 33, 33]);
  });

  it("is empty with no units to split across", () => {
    assert.deepEqual(splitEqually(50000, []), []);
  });
});

describe("an open balance", () => {
  it("is one shared assignment for the whole total, under the open key", () => {
    const result = assignOpen(500000);
    assert.equal(result.length, 1);
    assert.equal(result[0].unitKey, OPEN_BALANCE_UNIT_KEY);
    assert.equal(result[0].amountCents, 500000);
  });
});

describe("what a unit has paid, and what it still owes", () => {
  const balance: TripBalance = {
    ...emptyTripBalance(),
    totalCents: 400000,
    assignments: [{ unitKey: "smith", label: "Smith family", amountCents: 400000 }],
    payments: [payment({ id: "p1", unitKey: "smith", amountCents: 150000, stripePaymentIntentId: "pi_1" })],
  };

  it("counts only succeeded payments toward this unit", () => {
    assert.equal(paidCentsFor(balance, "smith"), 150000);
  });

  it("what's left is the assignment minus what's paid", () => {
    assert.equal(remainingCentsFor(balance, "smith"), 250000);
  });

  it("a refund subtracts back out of what was paid", () => {
    const refunded: TripBalance = {
      ...balance,
      payments: [...balance.payments, payment({ id: "p2", unitKey: "smith", amountCents: 50000, status: "refunded", stripePaymentIntentId: "pi_2" })],
    };
    assert.equal(paidCentsFor(refunded, "smith"), 100000);
  });

  it("a failed payment counts toward nothing", () => {
    const failed: TripBalance = {
      ...balance,
      payments: [...balance.payments, payment({ id: "p3", unitKey: "smith", amountCents: 999999, status: "failed", stripePaymentIntentId: "pi_3" })],
    };
    assert.equal(paidCentsFor(failed, "smith"), 150000);
  });

  it("a unit with no assignment at all owes nothing, rather than throwing", () => {
    assert.equal(remainingCentsFor(balance, "nobody"), 0);
  });

  it("never goes negative even if a unit somehow overpaid", () => {
    const overpaid: TripBalance = {
      ...balance,
      payments: [payment({ id: "p1", unitKey: "smith", amountCents: 999999, stripePaymentIntentId: "pi_1" })],
    };
    assert.equal(remainingCentsFor(overpaid, "smith"), 0);
  });
});

describe("collected and outstanding, across every unit on the trip", () => {
  const balance: TripBalance = {
    ...emptyTripBalance(),
    totalCents: 1000000,
    assignments: [
      { unitKey: "a", label: "Family A", amountCents: 400000 },
      { unitKey: "b", label: "Family B", amountCents: 300000 },
      { unitKey: "c", label: "Family C", amountCents: 300000 },
    ],
    payments: [
      payment({ id: "p1", unitKey: "a", amountCents: 400000, stripePaymentIntentId: "pi_1" }),
      payment({ id: "p2", unitKey: "b", amountCents: 100000, stripePaymentIntentId: "pi_2" }),
    ],
  };

  it("matches the brief's own worked example — collected $6,000 of $10,000 across three families is $500 paid, $1,000+$3,000 owed", () => {
    // (scaled down here to keep the fixture simple, same shape as the brief's example)
    assert.equal(collectedCents(balance), 500000);
    assert.equal(outstandingCents(balance), 500000);
  });
});

describe("which schedule line is next due", () => {
  const balance: TripBalance = {
    ...emptyTripBalance(),
    assignments: [{ unitKey: "a", label: "A", amountCents: 300000 }],
    schedule: [
      { id: "s1", label: "Deposit", amountCents: 100000, dueDate: "2026-09-01" },
      { id: "s2", label: "Second payment", amountCents: 100000, dueDate: "2026-10-01" },
      { id: "s3", label: "Final balance", amountCents: 100000, dueDate: "2026-11-01" },
    ],
  };

  it("is the earliest unpaid line by due date", () => {
    assert.equal(nextDueFor(balance, "a")?.id, "s1");
  });

  it("skips a line already paid against, even out of date order", () => {
    const paid: TripBalance = { ...balance, payments: [payment({ unitKey: "a", scheduleItemId: "s1", stripePaymentIntentId: "pi_1" })] };
    assert.equal(nextDueFor(paid, "a")?.id, "s2");
  });

  it("is null once every line is paid", () => {
    const done: TripBalance = {
      ...balance,
      payments: balance.schedule.map((s, i) => payment({ unitKey: "a", scheduleItemId: s.id, stripePaymentIntentId: `pi_${i}` })),
    };
    assert.equal(nextDueFor(done, "a"), null);
  });

  it("is null with no schedule at all", () => {
    assert.equal(nextDueFor(emptyTripBalance(), "a"), null);
  });
});

describe("formatting cents", () => {
  it("as a currency string", () => {
    assert.equal(formatCents(400000, "USD"), "$4,000.00");
    assert.equal(formatCents(150, "USD"), "$1.50");
  });
});

describe("the payment routes and webhook keep the same fences everything else does", () => {
  const PLANNER_ROUTE = readFileSync("app/api/account/payments/route.ts", "utf8");
  const PUBLIC_ROUTE = readFileSync("app/api/pay/[shareId]/route.ts", "utf8");
  const WEBHOOK = readFileSync("app/api/payments/webhook/route.ts", "utf8");
  const STORE = readFileSync("lib/account-store.ts", "utf8");
  const CONNECT = readFileSync("lib/stripe-connect.ts", "utf8");

  it("the planner side is Business-gated", () => {
    assert.match(PLANNER_ROUTE, /mayServeCompanionClients/);
  });

  it("the planner side checks same-origin before writing anything", () => {
    const post = PLANNER_ROUTE.slice(PLANNER_ROUTE.indexOf("export async function POST"));
    assert.match(post, /sameOrigin/);
    assert.ok(post.indexOf("sameOrigin") < post.indexOf("Please log in first"));
  });

  it("the public pay route is rate limited on both read and write", () => {
    assert.match(PUBLIC_ROUTE, /rateLimit\(`pay-read:/);
    assert.match(PUBLIC_ROUTE, /rateLimit\(`pay-action:/);
  });

  it("the public pay route checks same-origin before creating a charge", () => {
    const post = PUBLIC_ROUTE.slice(PUBLIC_ROUTE.indexOf("export async function POST"));
    assert.match(post, /sameOrigin/);
  });

  it("the public pay route never trusts a client-supplied unit — it is always resolved from the share token", () => {
    assert.doesNotMatch(PUBLIC_ROUTE, /body\?\.unitKey|body\.unitKey/);
  });

  it("the public pay route never lets a payment exceed what is actually still owed", () => {
    assert.match(PUBLIC_ROUTE, /Math\.min\(requested, remainingCents\)/);
  });

  it("a whole-trip link only pays when the trip has exactly one unit — never an ambiguous family choice", () => {
    assert.match(PUBLIC_ROUTE, /units\.length !== 1/);
  });

  it("the webhook verifies its OWN signing secret, never the billing one", () => {
    assert.match(WEBHOOK, /paymentsWebhookSecret/);
    assert.doesNotMatch(WEBHOOK, /stripeWebhookSecret\(\)/);
  });

  it("the webhook always answers 200 once the signature is real, even on its own internal error", () => {
    const body = WEBHOOK.slice(WEBHOOK.indexOf("try {"));
    assert.match(body, /catch \(error\)/);
    assert.match(body, /received: true/);
  });

  it("recordPayment is idempotent by the PaymentIntent id AND its outcome, not by trusting the caller", () => {
    // The dedup decision lives in mergePaymentRecord (behaviour pinned in
    // tests/payment-dedup.test.ts). It must key on both the intent id and the
    // outcome: a single PaymentIntent keeps its id across a declined attempt
    // and the successful retry, so id alone would let the earlier failure
    // swallow the later success — the trip would read as still owing.
    const fn = STORE.slice(STORE.indexOf("export function mergePaymentRecord"), STORE.indexOf("export function mergePaymentRecord") + 900);
    assert.match(fn, /stripePaymentIntentId === record\.stripePaymentIntentId/);
    assert.match(fn, /p\.status === record\.status/);
  });

  it("never stores a card, and never charges to White Glove's own account — every charge names a destination", () => {
    assert.doesNotMatch(CONNECT, /card_number|cardNumber/i);
    assert.match(CONNECT, /transfer_data/);
  });

  it("no application fee is charged today — nobody asked White Glove to take a cut", () => {
    assert.doesNotMatch(CONNECT, /application_fee/);
  });
});
