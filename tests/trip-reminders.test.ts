import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { emptyTripBalance } from "@/data/trip-payments";
import {
  balanceDueReminderDue,
  balanceDueReminderText,
  departureReminderDue,
  departureReminderText,
  DEPARTURE_REMINDER_DAYS,
  type ReminderTrip,
} from "@/lib/trip-reminders";

const TODAY = "2026-06-10";

function trip(over: Partial<ReminderTrip> = {}): ReminderTrip {
  return { name: "Poland trip", startDate: "2026-06-13", shareId: "abc123", autoReminders: true, ...over };
}

describe("the 'leaving soon' reminder", () => {
  it("is due exactly 3 days out", () => {
    assert.equal(DEPARTURE_REMINDER_DAYS, 3);
    assert.equal(departureReminderDue(trip({ startDate: "2026-06-13" }), TODAY), true);
    assert.equal(departureReminderDue(trip({ startDate: "2026-06-14" }), TODAY), false);
    assert.equal(departureReminderDue(trip({ startDate: "2026-06-12" }), TODAY), false);
  });

  it("never fires on a trip that never turned reminders on", () => {
    assert.equal(departureReminderDue(trip({ autoReminders: false }), TODAY), false);
    assert.equal(departureReminderDue(trip({ autoReminders: undefined }), TODAY), false);
  });

  it("never fires with nowhere to send it", () => {
    assert.equal(departureReminderDue(trip({ shareId: undefined }), TODAY), false);
  });

  it("fires once — never again once it has already gone out", () => {
    assert.equal(departureReminderDue(trip({ remindersSent: { departure: "2026-06-09" } }), TODAY), false);
  });

  it("says the trip leaves in 3 days and names the client when there is one", () => {
    assert.match(departureReminderText(trip({ client: "The Cohen family" })), /Hi The Cohen family/);
    assert.match(departureReminderText(trip({ client: "The Cohen family" })), /3 days/);
    assert.match(departureReminderText(trip({ client: undefined })), /^Your trip/);
  });
});

describe("the 'balance still due' reminder", () => {
  function withBalance(totalCents: number, paidCents = 0) {
    return {
      ...emptyTripBalance(),
      totalCents,
      assignments: [{ unitKey: "open", label: "Open balance", amountCents: totalCents }],
      payments:
        paidCents > 0
          ? [
              {
                id: "p1",
                unitKey: "open",
                amountCents: paidCents,
                currency: "USD",
                status: "succeeded" as const,
                stripePaymentIntentId: "pi_test",
                receiptNumber: "1001",
                createdAt: "2026-01-01T00:00:00Z",
              },
            ]
          : [],
    };
  }

  it("is due once something is actually owed within the window, before departure", () => {
    assert.equal(balanceDueReminderDue(trip({ startDate: "2026-06-20", balance: withBalance(50000) }), TODAY), true);
    // 30 days out — outside the window
    assert.equal(balanceDueReminderDue(trip({ startDate: "2026-07-10", balance: withBalance(50000) }), TODAY), false);
    // already departed
    assert.equal(balanceDueReminderDue(trip({ startDate: "2026-06-01", balance: withBalance(50000) }), TODAY), false);
  });

  it("never fires once the balance is fully paid off", () => {
    assert.equal(balanceDueReminderDue(trip({ startDate: "2026-06-20", balance: withBalance(50000, 50000) }), TODAY), false);
  });

  it("never fires on a trip with no balance set up at all", () => {
    assert.equal(balanceDueReminderDue(trip({ startDate: "2026-06-20", balance: undefined }), TODAY), false);
  });

  it("fires once — never again once it has already gone out", () => {
    assert.equal(
      balanceDueReminderDue(trip({ startDate: "2026-06-20", balance: withBalance(50000), remindersSent: { balanceDue: "2026-06-05" } }), TODAY),
      false,
    );
  });

  it("names the amount actually owed", () => {
    const text = balanceDueReminderText(trip({ balance: withBalance(50000) }));
    assert.match(text, /\$500\.00/);
  });
});

describe("automatic reminders stay behind the same fences as the rest of the client tools", () => {
  const TRIPS_ROUTE = readFileSync("app/api/account/trips/route.ts", "utf8");
  const CRON_ROUTE = readFileSync("app/api/cron/trip-reminders/route.ts", "utf8");
  // The reminder loop moved out of the route and into a plain task function, so
  // the same body runs from the in-process scheduler and from the manual
  // endpoint alike (see lib/cron-scheduler.ts). The fences travelled with it.
  const CRON_TASKS = readFileSync("lib/cron-tasks.ts", "utf8");

  it("turning them on or off is gated the same as naming a client at all", () => {
    const branch = TRIPS_ROUTE.slice(TRIPS_ROUTE.indexOf('case "auto-reminders"'), TRIPS_ROUTE.indexOf('case "commission"'));
    assert.match(branch, /mayServeCompanionClients/);
  });

  it("the cron route refuses to run without its own secret, fails closed if unset, and checks the header", () => {
    assert.match(CRON_ROUTE, /process\.env\.CRON_SECRET/);
    assert.match(CRON_ROUTE, /Not configured/);
    assert.match(CRON_ROUTE, /authorization.*!==.*Bearer \$\{secret\}/);
  });

  it("re-checks the plan fresh per account, not just the scan's own snapshot", () => {
    assert.match(CRON_TASKS, /mayServeCompanionClients\(await getPlan\(account\.email\)\)/);
  });

  it("never marks a reminder sent without confirming the message actually saved", () => {
    // These are one-shot — remindersSent means "never fire this again". A
    // mark written after a chat-store write that silently failed (the store
    // is down, the network blips) would mean the client never sees the
    // message AND it never retries, forever. appendChat itself no-ops and
    // returns [] on failure rather than throwing, so the return value has to
    // be checked, not just awaited.
    assert.match(CRON_TASKS, /function wasDelivered/);
    assert.match(CRON_TASKS, /if \(await wasDelivered\(trip\.shareId, message\)\)/g);
    assert.ok(
      CRON_TASKS.match(/if \(await wasDelivered\(trip\.shareId, message\)\)/g)?.length === 2,
      "both the departure and balance-due sends should check delivery before marking sent",
    );
  });
});
