import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { emptyItinerary, type ItinTraveler, type Itinerary } from "@/data/itinerary";
import { assignOpen, emptyTripBalance, type TripBalance } from "@/data/trip-payments";
import { attributeResponses, isGroupTrip, partiesOf, sortForAdviser } from "@/data/trip-parties";
import type { ClientFormResponse, ClientFormTemplate } from "@/data/client-form";
import { codeOf } from "./helpers/source";

const TODAY = "2026-06-01";
const money = (cents: number) => `$${(cents / 100).toFixed(0)}`;

const traveler = (id: string, name: string, family?: string, over: Partial<ItinTraveler> = {}): ItinTraveler => ({
  id,
  name,
  ...(family ? { family } : {}),
  ...over,
});

/** Three families, the shape the brief describes. */
function trip(): Itinerary {
  return {
    ...emptyItinerary(),
    title: "Italy family trip",
    travelers: [
      traveler("s1", "Dovid Schwartz", "Schwartz family", { email: "dovid@example.com" }),
      traveler("s2", "Rivky Schwartz", "Schwartz family"),
      traveler("w1", "Yaakov Weiss", "Weiss family", { phone: "+1 555 0100" }),
      traveler("w2", "Miri Weiss", "Weiss family"),
      traveler("k1", "Shimon Klein", "Klein family"),
    ],
  };
}

function balance(): TripBalance {
  return {
    ...emptyTripBalance(),
    totalCents: 900000,
    splitMode: "custom",
    assignments: [
      { unitKey: "family:schwartz family", label: "Schwartz family", amountCents: 400000 },
      { unitKey: "family:weiss family", label: "Weiss family", amountCents: 300000 },
      { unitKey: "family:klein family", label: "Klein family", amountCents: 200000 },
    ],
    schedule: [{ id: "s1", label: "Deposit", amountCents: 100000, dueDate: "2026-05-01" }],
    payments: [
      {
        id: "p1",
        unitKey: "family:schwartz family",
        amountCents: 400000,
        currency: "USD",
        status: "succeeded",
        stripePaymentIntentId: "pi_1",
        receiptNumber: "1",
        createdAt: TODAY,
      },
    ],
  };
}

const build = (over: Partial<Parameters<typeof partiesOf>[2]> = {}, bal: TripBalance | null = balance()) =>
  partiesOf(trip(), bal, { today: TODAY, formatAmount: money, ...over });

describe("the four questions an adviser has", () => {
  it("says who has paid", () => {
    const { parties } = build();
    const schwartz = parties.find((p) => p.label === "Schwartz family");
    assert.equal(schwartz?.share?.remainingCents, 0);
    assert.deepEqual(schwartz?.needs.map((n) => n.kind), []);
  });

  it("says who owes, and how much", () => {
    const { parties } = build();
    const weiss = parties.find((p) => p.label === "Weiss family");
    assert.equal(weiss?.share?.remainingCents, 300000);
    assert.ok(weiss?.needs.some((n) => n.kind === "overdue"), "a deposit due 1 May is overdue on 1 June");
  });

  it("says who cannot even be reached", () => {
    const klein = build().parties.find((p) => p.label === "Klein family");
    assert.equal(klein?.contact, null);
    assert.ok(klein?.needs.some((n) => n.kind === "no-contact"));
  });

  it("counts a family as one, whatever it owes", () => {
    const { totals } = build();
    assert.equal(totals.parties, 3);
    assert.equal(totals.travelers, 5);
    assert.equal(totals.owing, 2);
    assert.equal(totals.paidCents, 400000);
    assert.equal(totals.remainingCents, 500000);
  });

  it("puts what needs attention at the top", () => {
    const order = sortForAdviser(build().parties).map((p) => p.label);
    assert.equal(order[0], "Weiss family", "the overdue family should lead");
    assert.equal(order[order.length - 1], "Schwartz family", "the paid-up family should be last");
  });
});

describe("an open balance is one pot, not a set of shares", () => {
  it("shows no per-family share rather than every family owing nothing", () => {
    const open = { ...emptyTripBalance(), totalCents: 900000, splitMode: "open" as const, assignments: assignOpen(900000) };
    const { parties, totals } = build({}, open);
    assert.deepEqual(parties.map((p) => p.share), [null, null, null]);
    assert.equal(totals.owing, 0);
    assert.equal(totals.remainingCents, 0);
  });

  it("and a trip with no balance at all says nothing about money", () => {
    const { parties } = build({}, null);
    assert.deepEqual(parties.map((p) => p.share), [null, null, null]);
  });
});

describe("a form answer is attributed exactly or not at all", () => {
  const template: ClientFormTemplate = {
    fields: [{ id: "f1", kind: "standard", key: "legalName", required: true }],
    updatedAt: TODAY,
  };
  const response = (respondentName: string): ClientFormResponse => ({
    id: `r-${respondentName}`,
    respondentName,
    answers: { f1: "…" },
    submittedAt: TODAY,
  });

  it("matches a response whose name is a traveler's name", () => {
    const { parties } = build({ template, responses: [response("Dovid Schwartz")] });
    assert.equal(parties.find((p) => p.label === "Schwartz family")?.answered, true);
    assert.equal(parties.find((p) => p.label === "Weiss family")?.answered, false);
  });

  it("leaves a name it does not recognise unmatched rather than guessing", () => {
    const { totals, parties } = build({ template, responses: [response("D. Schwartz")] });
    assert.equal(totals.unmatchedResponses, 1);
    assert.deepEqual(parties.map((p) => p.answered), [false, false, false]);
  });

  it("refuses an ambiguous name outright", () => {
    // The same name in two families is not a match, it is a question — and
    // picking one would show one family's answers under another's heading.
    const twins: Itinerary = {
      ...emptyItinerary(),
      travelers: [traveler("a", "Sara Cohen", "Cohen family"), traveler("b", "Sara Cohen", "Levy family")],
    };
    const { byUnit, unmatched } = attributeResponses(twins, [response("Sara Cohen")]);
    assert.equal(unmatched, 1);
    assert.equal(byUnit.size, 0);
  });

  it("says nothing about forms when no form has been set up", () => {
    // Null, not false: "no form exists" and "has not answered" are different
    // statements and only one of them is a need.
    const { parties } = build();
    assert.deepEqual(parties.map((p) => p.answered), [null, null, null]);
    assert.ok(!parties.some((p) => p.needs.some((n) => n.kind === "no-form")));
  });
});

describe("what a party may carry", () => {
  it("carries no form answers at all", () => {
    // The type has nowhere to put them and the route hands none back. A
    // passport number belongs to the family that gave it.
    const source = codeOf("data/trip-parties.ts") + codeOf("app/api/account/parties/route.ts");
    assert.doesNotMatch(source, /\.answers\b/);
    const { parties } = build({
      template: { fields: [{ id: "f1", kind: "custom", label: "Passport", required: true }], updatedAt: TODAY },
      responses: [{ id: "r1", respondentName: "Dovid Schwartz", answers: { f1: "X1234567" }, submittedAt: TODAY }],
    });
    assert.doesNotMatch(JSON.stringify(parties), /X1234567/);
  });

  it("is derived, never stored — nothing here writes a group record", () => {
    const source = codeOf("data/trip-parties.ts");
    assert.doesNotMatch(source, /redis|upstash|prisma|fetch\(|save/i);
  });
});

describe("one family is a trip, not a group", () => {
  it("knows the difference", () => {
    assert.equal(isGroupTrip(trip()), true);
    const solo: Itinerary = { ...emptyItinerary(), travelers: [traveler("a", "Dovid Schwartz", "Schwartz family")] };
    assert.equal(isGroupTrip(solo), false);
  });

  it("treats a traveler with no family name as their own party", () => {
    const mixed: Itinerary = {
      ...emptyItinerary(),
      travelers: [traveler("a", "Dovid Schwartz", "Schwartz family"), traveler("b", "Yitzchok Alone")],
    };
    const { parties } = partiesOf(mixed, null, { today: TODAY, formatAmount: money });
    assert.deepEqual(parties.map((p) => p.label), ["Schwartz family", "Yitzchok Alone"]);
  });
});
