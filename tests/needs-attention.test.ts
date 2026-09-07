import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { ReminderReason } from "@/data/trip-reminders";
import { tripReminders } from "@/data/trip-reminders";
import { GROUP_LABEL, GROUP_ORDER, REMINDER_ACTION, actionForReminder, groupForReminder } from "@/lib/needs-attention";

/**
 * Everything that needs a planner's attention gets one thing to press.
 *
 * WHAT IT WAS. The pipeline flagged six kinds of thing and offered an action
 * for one of them. The other five read "⚑ 2 add-ons still waiting on an
 * answer" — true, agreed, and then the planner had to work out for themselves
 * which screen answers an add-on. A work queue that names work and does not
 * lead to it is a list of reasons to feel behind.
 */

describe("every reason a trip needs attention leads somewhere", () => {
  it("covers every reason the pipeline can produce", () => {
    // The Record type makes this a compile error too. Asserted at runtime as
    // well because a reason added with a hand-written cast would slip past.
    const reasons = Object.keys(REMINDER_ACTION);
    assert.ok(reasons.length >= 6, `only ${reasons.length} reasons have an action`);
    for (const reason of reasons) {
      const action = actionForReminder(reason as keyof typeof REMINDER_ACTION);
      assert.ok(action, `${reason} has no action`);
      assert.ok(action.label.trim().length > 0, `${reason}'s action has no label`);
    }
  });

  it("gives each one exactly one action, not a menu", () => {
    // The point of the whole thing. If this ever becomes a list, the queue has
    // turned back into navigation.
    for (const action of Object.values(REMINDER_ACTION)) {
      assert.ok(!Array.isArray(action), "an action became a list of actions");
      assert.equal(typeof action.label, "string");
    }
  });

  it("only sends a planner somewhere the trip row can already open", () => {
    // Anywhere else would mean inventing a route. These three are the buttons
    // the card already carries, and they already resolve to the right trip.
    const openable = new Set(["/itinerary", "/proposal", "/payments"]);
    for (const [reason, action] of Object.entries(REMINDER_ACTION)) {
      if (action.kind !== "open") continue;
      assert.ok(openable.has(action.path), `${reason} points at ${action.path}, which the row cannot open`);
    }
  });

  it("keeps the rating request inline, because leaving would lose the point", () => {
    const action = actionForReminder("trip_completed_no_rating_sent");
    assert.equal(action.kind, "inline");
  });

  it("tells the planner the client said yes, and what to do about it", () => {
    // The worse of the two silences: tripStage moves an approved trip straight
    // to "Confirmed", so the board reads as settled while the agreed option is
    // still not on the itinerary — and the itinerary is what the traveler
    // opens. Nothing on the pipeline said so.
    const action = actionForReminder("proposal_approved_not_converted");
    assert.equal(action.kind, "open");
    if (action.kind === "open") {
      assert.equal(action.path, "/proposal");
      assert.match(action.label, /convert/i);
    }
  });

  it("gives the changes-requested badge something to press", () => {
    const action = actionForReminder("proposal_changes_requested");
    assert.equal(action.kind, "open");
    if (action.kind === "open") assert.equal(action.path, "/proposal");
  });

  it("sends the add-on chase to the proposal, where add-ons are answered", () => {
    const action = actionForReminder("addon_pending");
    assert.equal(action.kind, "open");
    if (action.kind === "open") assert.equal(action.path, "/proposal");
  });
});

describe("the reasons and their actions cannot drift apart", () => {
  it("every reason tripReminders can emit has an action", () => {
    // Driven from the real function rather than a list copied beside it: a
    // reason added there and forgotten here is what this catches.
    const today = "2026-08-26";
    // Each shape below is chosen to make a different reason fire; together
    // they cover every branch tripReminders has.
    let seen = 0;

    for (const trip of [
      { stage: "proposal" as const, proposal: { status: "sent", sentAt: "2026-08-01T00:00:00Z" } as never },
      { stage: "proposal" as const, proposal: { status: "viewed", sentAt: "2026-08-25T00:00:00Z", expiresAt: "2026-08-27" } as never },
      { stage: "planning" as const, startDate: "2026-09-01" },
      { stage: "completed" as const, endDate: "2026-08-20" },
      // The client has acted, and until now neither said so on the pipeline.
      { stage: "confirmed" as const, proposal: { status: "approved", options: [{ id: "a" }] } as never },
      { stage: "awaiting_approval" as const, proposal: { status: "changes_requested", options: [{ id: "a" }] } as never },
    ]) {
      for (const reminder of tripReminders(trip, today)) {
        seen += 1;
        assert.ok(
          reminder.reason in REMINDER_ACTION,
          `tripReminders emits "${reminder.reason}", which has no action`,
        );
      }
    }

    // Without this the loop above passes by emitting nothing at all, which is
    // the failure mode of every test that walks a generated list.
    assert.ok(seen >= 3, `only ${seen} reminders fired — the fixtures stopped exercising the branches`);
  });

  it("the pipeline renders the action rather than special-casing one reason", () => {
    const source = readFileSync("components/PipelineDashboard.tsx", "utf8");
    assert.ok(source.includes("actionForReminder(r.reason)"), "the dashboard no longer asks for the action");
    // The old shape: one reason got a control, the rest got nothing.
    assert.ok(
      !source.includes('r.reason === "trip_completed_no_rating_sent" && <RatingRequestAction'),
      "one reason is special-cased again and the other five have nothing to press",
    );
  });
});

/**
 * The two client actions the pipeline used to swallow.
 *
 * Driven through tripReminders itself, because the point is not that the
 * action table has an entry — it is that the reminder fires at all.
 */
describe("a client acting on a proposal reaches the planner", () => {
  const today = "2026-08-26";
  const options = [{ id: "a", name: "Option A", components: [] }];

  it("fires when they approved and nobody has converted it", () => {
    const reasons = tripReminders(
      { stage: "confirmed", proposal: { id: "p", status: "approved", options, comments: [], createdAt: today, updatedAt: today } },
      today,
    ).map((r) => r.reason);
    assert.ok(reasons.includes("proposal_approved_not_converted"), `got ${JSON.stringify(reasons)}`);
  });

  it("stops once it has been converted", () => {
    // convertProposalToItinerary moves the proposal to "confirmed". The
    // reminder must go with it, or it nags for ever after the work is done.
    const reasons = tripReminders(
      { stage: "confirmed", proposal: { id: "p", status: "confirmed", options, comments: [], createdAt: today, updatedAt: today } },
      today,
    ).map((r) => r.reason);
    assert.ok(!reasons.includes("proposal_approved_not_converted"));
  });

  it("fires when they asked for changes", () => {
    const reasons = tripReminders(
      { stage: "awaiting_approval", proposal: { id: "p", status: "changes_requested", options, comments: [], createdAt: today, updatedAt: today } },
      today,
    ).map((r) => r.reason);
    assert.ok(reasons.includes("proposal_changes_requested"), `got ${JSON.stringify(reasons)}`);
  });

  it("says nothing while it is still with the client", () => {
    for (const status of ["draft", "sent", "viewed"] as const) {
      const reasons = tripReminders(
        { stage: "awaiting_approval", proposal: { id: "p", status, options, comments: [], createdAt: today, updatedAt: today } },
        today,
      ).map((r) => r.reason);
      assert.ok(!reasons.includes("proposal_approved_not_converted"), `${status} nagged about converting`);
      assert.ok(!reasons.includes("proposal_changes_requested"), `${status} nagged about changes`);
    }
  });
});

describe("the three piles, and why they are three and not eight", () => {
  /**
   * THE PIPELINE ASKED THE SAME QUESTION FOUR TIMES.
   *
   * It offered eight views along the top — Board, Upcoming, Currently
   * traveling, Awaiting approval, Changes requiring attention, Unread
   * messages, Payment due, Needs a nudge — and four of those eight mean
   * "something needs the advisor". The screen led with none of them: it opened
   * on Board, every trip they have. So the first question anybody opens this
   * with was answered in four places, and being sure meant checking all four.
   *
   * One view answers it now and the screen opens on it, grouped by the only
   * split that changes what somebody does next: whose move is it.
   */
  it("groups every reason, so a new one cannot land nowhere", () => {
    // The same Record-over-the-union discipline as REMINDER_ACTION. A reason
    // added to data/trip-reminders.ts and forgotten here is a compile error;
    // this catches the runtime half.
    for (const reason of Object.keys(REMINDER_ACTION) as ReminderReason[]) {
      assert.ok(GROUP_ORDER.includes(groupForReminder(reason)), `${reason} is in no pile`);
    }
  });

  it("splits by whose move it is, not by which system raised it", () => {
    /**
     * The two proposal items that look alike and are not: one is the client
     * asking the advisor for something, the other is the advisor waiting on
     * the client. Sorting by feature would file them together and separate
     * each from the thing it actually resembles.
     */
    assert.equal(groupForReminder("proposal_changes_requested"), "needs_you");
    assert.equal(groupForReminder("proposal_stale"), "waiting_on_client");
  });

  it("puts an approved-but-unconverted proposal on the advisor", () => {
    // The one that does not look like a problem: the board reads Confirmed
    // while the agreed option is still not on the itinerary the traveler
    // opens. Nobody is waiting on the client for it.
    assert.equal(groupForReminder("proposal_approved_not_converted"), "needs_you");
  });

  it("does not call somebody else's money the advisor's move", () => {
    assert.equal(groupForReminder("payment_due_soon"), "waiting_on_client");
    assert.equal(groupForReminder("addon_pending"), "waiting_on_client");
  });

  it("reads the blocking pile first", () => {
    assert.equal(GROUP_ORDER[0], "needs_you");
    assert.equal(GROUP_ORDER.length, 3);
  });

  it("names the piles in words an advisor would use", () => {
    // Not "queue", not "state", not the name of the module that raised it.
    for (const group of GROUP_ORDER) {
      assert.ok(GROUP_LABEL[group].length > 3);
      assert.doesNotMatch(GROUP_LABEL[group], /queue|status|state|record|item/i);
    }
  });
});

describe("the dashboard opens on the answer, not the board", () => {
  const DASH = readFileSync("components/PipelineDashboard.tsx", "utf8");

  it("leads with what needs the advisor", () => {
    assert.match(DASH, /useState<View>\("needs_attention"\)/);
    assert.match(DASH, /\{ id: "needs_attention", label: "Needs attention" \}/);
  });

  it("has four views where it had eight", () => {
    // The four that meant the same thing became one. "Awaiting approval" went
    // with them: it is a stage, and the board already shows stages in columns.
    const list = DASH.slice(DASH.indexOf("const VIEWS"), DASH.indexOf("];", DASH.indexOf("const VIEWS")));
    // `{ id: "` and not `{ id:`, or the Array<{ id: View }> annotation counts
    // as a fifth view.
    assert.equal((list.match(/\{ id: "/g) ?? []).length, 4);
    for (const gone of ["awaiting_approval", '"unread"', '"payment_due"', '"nudge"', '"attention"']) {
      assert.ok(!list.includes(gone), `${gone} is back as its own view`);
    }
  });

  it("shows a trip in every pile it genuinely belongs to", () => {
    // A client who asked for changes AND owes money is both. Showing it once,
    // under whichever came first, would hide half of why it is there.
    assert.match(DASH, /rowGroups\(row, today\)\.has\(group\)/);
  });
});

describe("a number you can press", () => {
  const DASH = readFileSync("components/PipelineDashboard.tsx", "utf8");

  it("sends each count to the list behind it", () => {
    /**
     * The four cards along the top were plain text. "Traveling now: 3" is only
     * useful if the next thing it does is show you the three, and every one of
     * them already had a list behind it — the advisor read the count here and
     * then found the matching view along the top by hand.
     */
    // Bounded by the comment on the last card, not by the words "Commission
    // earned" — those appear earlier in the file, in the per-trip editor.
    const cards = DASH.slice(DASH.indexOf("showAnalytics && ("), DASH.indexOf("Not a link: commission"));
    assert.ok(cards.length > 200, "the analytics cards moved");
    for (const view of ['setView("board")', 'setView("traveling")', 'setView("upcoming")', 'setView("needs_attention")']) {
      assert.ok(cards.includes(view), `no card leads to ${view}`);
    }
  });

  it("leaves commission as text, because there is no list to open", () => {
    /**
     * A card that looks pressable and does nothing is worse than one that
     * plainly is not. Anchored on the stat card's own comment rather than on
     * the words "Commission earned", which appear earlier in the file in the
     * per-trip commission editor.
     */
    const at = DASH.indexOf("Not a link: commission");
    assert.ok(at > 0, "the note explaining why this one is not a button is gone");
    const card = DASH.slice(at, at + 400);
    assert.match(card, /<div className=\{cardBase\}>/);
    assert.ok(!card.slice(0, card.indexOf("Commission earned")).includes("<button"));
  });
});
