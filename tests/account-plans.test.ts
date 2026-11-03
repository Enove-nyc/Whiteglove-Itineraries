import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACCOUNT_PLANS,
  DEFAULT_PLAN,
  MAX_NOTE,
  type PlanRequest,
  PLAN_LABELS,
  describePlan,
  isAccountPlan,
  isUpgrade,
  planOf,
  plansToAskAbout,
  requestProblem,
  waitingFor,
  whatYouGet,
} from "@/lib/account-plans";

/**
 * What kind of account somebody has.
 *
 * The rule underneath all of these: a plan never decides what anybody can do.
 * Nothing is behind one that lib/account-limits.ts does not say out loud, and
 * the tests here say so too — so that wiring a gate to a plan trips a failing
 * test rather than quietly taking something away from somebody who had it
 * yesterday.
 */

const NOW = "2026-08-02T14:00:00.000Z";
const agoHours = (h: number) => new Date(Date.parse(NOW) - h * 3_600_000).toISOString();

function request(over: Partial<PlanRequest> = {}): PlanRequest {
  return { account: "someone@example.com", wanted: "pro", askedAt: agoHours(2), state: "asked", ...over };
}

describe("which plan an account is on", () => {
  it("has no plan when nobody has bought anything", () => {
    // Every account before it chooses one. Nothing about it changes.
    assert.equal(planOf(undefined), "free");
    assert.equal(planOf(null), "free");
    assert.equal(planOf({}), "free");
    assert.equal(DEFAULT_PLAN, "free");
  });

  it("refuses a plan it does not know rather than taking it", () => {
    assert.equal(planOf({ plan: "platinum" }), "free");
    assert.equal(isAccountPlan("platinum"), false);
    assert.equal(isAccountPlan("pro"), true);
  });

  it("keeps a plan that was set", () => {
    assert.equal(planOf({ plan: "one_trip" }), "one_trip");
    assert.equal(planOf({ plan: "starter" }), "starter");
    assert.equal(planOf({ plan: "pro" }), "pro");
  });
});

describe("what a plan gets you", () => {
  it("IS NOTHING BEFORE A PLAN IS CHOSEN, AND ONE THING FOR EACH OF THE OTHERS", () => {
    // An invented line here would be a promise nobody made.
    assert.deepEqual(whatYouGet("free"), []);
    for (const plan of ["one_trip", "starter", "pro"] as const) {
      assert.ok(whatYouGet(plan).length > 0, plan);
    }
    // Every line is a plain promise, not a feature name.
    for (const plan of ACCOUNT_PLANS) {
      for (const line of whatYouGet(plan)) {
        assert.ok(line.trim().length > 10, `${plan}: "${line}"`);
        assert.doesNotMatch(line, /[A-Z]{2,}|_|\bboolean\b/, `${plan}: that is a field name, not a promise`);
      }
    }
  });
});

describe("what you can ask about", () => {
  it("offers all three to somebody with no plan yet", () => {
    assert.deepEqual(plansToAskAbout("free"), ["one_trip", "starter", "pro"]);
  });

  it("does not offer somebody what they already have", () => {
    // Offering an "upgrade" to the plan you are on reads as the site not
    // knowing who you are.
    assert.ok(!plansToAskAbout("one_trip").includes("one_trip"));
    assert.ok(!plansToAskAbout("starter").includes("starter"));
    assert.ok(!plansToAskAbout("pro").includes("pro"));
  });

  it("only offers what is further up the ladder", () => {
    assert.deepEqual(plansToAskAbout("one_trip"), ["starter", "pro"]);
    assert.deepEqual(plansToAskAbout("starter"), ["pro"]);
    assert.deepEqual(plansToAskAbout("pro"), []);
  });

  it("never offers no-plan-yet as something to move to", () => {
    for (const plan of ACCOUNT_PLANS) assert.ok(!plansToAskAbout(plan).includes("free"), plan);
  });

  it("knows which way is up", () => {
    assert.equal(isUpgrade("free", "one_trip"), true);
    assert.equal(isUpgrade("one_trip", "free"), false);
    assert.equal(isUpgrade("pro", "pro"), false);
    assert.equal(isUpgrade("starter", "one_trip"), false);
  });
});

describe("asking for one", () => {
  it("takes a plain request for Advisor Pro", () => {
    assert.equal(requestProblem({ current: "free", wanted: "pro" }), null);
  });

  it("will not take a plan it does not know", () => {
    assert.equal(requestProblem({ current: "free", wanted: "platinum" }), "Choose which kind of account you want.");
    assert.equal(requestProblem({ current: "free", wanted: undefined }), "Choose which kind of account you want.");
  });

  it("says so when you are already on it", () => {
    assert.equal(requestProblem({ current: "pro", wanted: "pro" }), "You are already on Advisor Pro.");
  });

  it("will not take a downgrade through this door", () => {
    // Nothing here can take a plan away. Whatever that eventually looks like,
    // it is not a form a person fills in about themselves.
    assert.equal(requestProblem({ current: "pro", wanted: "starter" }), "That is not a change this can make.");
  });

  it("does not need a note", () => {
    assert.equal(requestProblem({ current: "free", wanted: "pro", note: "" }), null);
  });

  it("refuses a note longer than it will keep", () => {
    assert.match(String(requestProblem({ current: "free", wanted: "pro", note: "x".repeat(MAX_NOTE + 1) })), /under 600/);
  });
});

describe("how long it has been waiting", () => {
  it("says it the way a person would", () => {
    assert.equal(waitingFor(request({ askedAt: agoHours(0) }), NOW), "in the last hour");
    assert.equal(waitingFor(request({ askedAt: agoHours(5) }), NOW), "5 hours ago");
    assert.equal(waitingFor(request({ askedAt: agoHours(26) }), NOW), "yesterday");
    assert.equal(waitingFor(request({ askedAt: agoHours(72) }), NOW), "3 days ago");
  });

  it("does not pretend to know when it cannot", () => {
    assert.equal(waitingFor(request({ askedAt: "whenever" }), NOW), "at some point");
  });
});

describe("what the account page says", () => {
  it("names the plan", () => {
    assert.equal(describePlan("free", null), "You are on Personal.");
  });

  it("says an open request is with a person", () => {
    // Somebody who asked and heard nothing needs to know the ask still exists.
    const said = describePlan("free", request());
    assert.match(said, /You asked about Advisor Pro/);
    assert.match(said, /we will be in touch/);
  });

  it("has a label for every plan", () => {
    for (const plan of ACCOUNT_PLANS) assert.ok(PLAN_LABELS[plan]?.length, plan);
  });
});
