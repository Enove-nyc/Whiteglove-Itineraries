import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INQUIRY_STATUSES,
  LEAD_SOURCES,
  cleanInquiry,
  closedInquiries,
  emptyInquiry,
  followUpDue,
  isOpen,
  openInquiries,
  summariseInquiry,
  tripSeedFromInquiry,
  type Inquiry,
} from "@/data/inquiries";
import { MAX_INQUIRIES, trim } from "@/lib/inquiries-store";

const NOW = "2026-09-07T10:00:00.000Z";
const TODAY = "2026-09-07";

function inquiry(over: Partial<Inquiry> = {}): Inquiry {
  return { ...emptyInquiry("i1", "The Cohens", NOW), ...over };
}

describe("an enquiry holds only what is actually known", () => {
  it("needs a contact and nothing else", () => {
    const only = cleanInquiry({ contact: "David Cohen" }, "i1", NOW);
    assert.ok(only);
    assert.equal(only.contact, "David Cohen");
    assert.equal(only.status, "new");
    // Every other field absent rather than empty — a half-filled form is the
    // normal case after a phone call, not a defect.
    assert.equal(only.destination, undefined);
    assert.equal(only.dates, undefined);
    assert.equal(only.travelers, undefined);
    assert.equal(only.budget, undefined);
    assert.equal(only.source, undefined);
    assert.equal(only.followUpOn, undefined);
  });

  it("refuses a record nobody can be rung back about", () => {
    assert.equal(cleanInquiry({ destination: "Italy" }, "i1", NOW), null);
    assert.equal(cleanInquiry({ contact: "   " }, "i1", NOW), null);
    assert.equal(cleanInquiry(null, "i1", NOW), null);
  });

  it("keeps the vague answers people actually give", () => {
    const vague = cleanInquiry(
      { contact: "The Cohens", destination: "Italy — maybe Rome and the lakes", dates: "sometime in August" },
      "i1",
      NOW,
    );
    assert.equal(vague?.destination, "Italy — maybe Rome and the lakes");
    assert.equal(vague?.dates, "sometime in August");
  });
});

describe("the boundary drops what a browser has no business sending", () => {
  it("drops a lead source that is not one of the known ones", () => {
    assert.equal(cleanInquiry({ contact: "A", source: "Billboard" }, "i1", NOW)?.source, undefined);
    assert.equal(cleanInquiry({ contact: "A", source: "Referral" }, "i1", NOW)?.source, "Referral");
  });

  it("falls back to new rather than storing an unknown status", () => {
    assert.equal(cleanInquiry({ contact: "A", status: "booked" }, "i1", NOW)?.status, "new");
    for (const status of INQUIRY_STATUSES) {
      assert.equal(cleanInquiry({ contact: "A", status }, "i1", NOW)?.status, status);
    }
  });

  it("takes a follow-up only as a calendar date, never a sentence", () => {
    assert.equal(cleanInquiry({ contact: "A", followUpOn: "next Tuesday" }, "i1", NOW)?.followUpOn, undefined);
    assert.equal(cleanInquiry({ contact: "A", followUpOn: "2026-13-40" }, "i1", NOW)?.followUpOn, undefined);
    assert.equal(cleanInquiry({ contact: "A", followUpOn: "2026-10-01" }, "i1", NOW)?.followUpOn, "2026-10-01");
  });

  it("refuses nonsense numbers without inventing a value", () => {
    assert.equal(cleanInquiry({ contact: "A", travelers: -3 }, "i1", NOW)?.travelers, undefined);
    assert.equal(cleanInquiry({ contact: "A", travelers: 2.7 }, "i1", NOW)?.travelers, 2);
    assert.equal(cleanInquiry({ contact: "A", budget: "8000" }, "i1", NOW)?.budget, 8000);
    assert.equal(cleanInquiry({ contact: "A", budget: 0 }, "i1", NOW)?.budget, undefined);
  });

  it("caps a pasted email thread rather than storing it whole", () => {
    const huge = cleanInquiry({ contact: "A", notes: "x".repeat(9000) }, "i1", NOW);
    assert.equal(huge?.notes?.length, 2000);
  });

  it("keeps the original createdAt and moves updatedAt on every save", () => {
    const later = "2026-09-08T09:00:00.000Z";
    const edited = cleanInquiry({ contact: "A", createdAt: NOW }, "i1", later);
    assert.equal(edited?.createdAt, NOW);
    assert.equal(edited?.updatedAt, later);
  });
});

describe("an enquiry is finished when it converts or dies, and not before", () => {
  it("counts converted and lost as closed, everything else as live", () => {
    assert.equal(isOpen(inquiry({ status: "new" })), true);
    assert.equal(isOpen(inquiry({ status: "working" })), true);
    assert.equal(isOpen(inquiry({ status: "quoted" })), true);
    assert.equal(isOpen(inquiry({ status: "converted" })), false);
    assert.equal(isOpen(inquiry({ status: "lost" })), false);
  });

  it("does not chase a follow-up on one that already became a trip", () => {
    // The whole point: a stale reminder on finished work is how a "needs
    // attention" list teaches an advisor to stop reading it.
    const converted = inquiry({ status: "converted", followUpOn: "2026-09-01", tripId: "t1" });
    assert.equal(followUpDue(converted, TODAY), false);
    assert.equal(followUpDue(inquiry({ followUpOn: "2026-09-01" }), TODAY), true);
    assert.equal(followUpDue(inquiry({ followUpOn: TODAY }), TODAY), true);
    assert.equal(followUpDue(inquiry({ followUpOn: "2026-09-20" }), TODAY), false);
    assert.equal(followUpDue(inquiry({}), TODAY), false);
  });
});

describe("the list leads with what is late", () => {
  const rows: Inquiry[] = [
    inquiry({ id: "fresh", createdAt: "2026-09-06T10:00:00.000Z" }),
    inquiry({ id: "old", createdAt: "2026-08-01T10:00:00.000Z" }),
    inquiry({ id: "due-today", followUpOn: TODAY, createdAt: "2026-09-05T10:00:00.000Z" }),
    inquiry({ id: "late", followUpOn: "2026-08-20", createdAt: "2026-09-05T10:00:00.000Z" }),
    inquiry({ id: "gone", status: "lost", updatedAt: "2026-09-02T10:00:00.000Z" }),
    inquiry({ id: "won", status: "converted", updatedAt: "2026-09-04T10:00:00.000Z" }),
  ];

  it("puts the most overdue chase first and the newest arrival last", () => {
    assert.deepEqual(
      openInquiries(rows, TODAY).map((row) => row.id),
      ["late", "due-today", "old", "fresh"],
    );
  });

  it("keeps the finished ones out of the working list", () => {
    const open = openInquiries(rows, TODAY).map((row) => row.id);
    assert.ok(!open.includes("gone"));
    assert.ok(!open.includes("won"));
  });

  it("keeps the finished ones reachable, newest first", () => {
    assert.deepEqual(
      closedInquiries(rows).map((row) => row.id),
      ["won", "gone"],
    );
  });

  it("does not mutate what it was given", () => {
    const before = rows.map((row) => row.id);
    openInquiries(rows, TODAY);
    closedInquiries(rows);
    assert.deepEqual(
      rows.map((row) => row.id),
      before,
    );
  });
});

describe("what an advisor reads, and what a trip starts from", () => {
  it("says nothing about what it does not know", () => {
    assert.equal(summariseInquiry(inquiry({})), "");
    assert.equal(summariseInquiry(inquiry({ destination: "Italy" })), "Italy");
    assert.equal(
      summariseInquiry(inquiry({ destination: "Italy", dates: "August", travelers: 6 })),
      "Italy · August · 6 travelers",
    );
    assert.equal(summariseInquiry(inquiry({ travelers: 1 })), "1 traveler");
  });

  it("carries the person and what was said, and guesses no structured fields", () => {
    const seed = tripSeedFromInquiry(
      inquiry({ contact: "David Cohen", destination: "the lakes", dates: "August", notes: "Anniversary." }),
    );
    assert.equal(seed.client, "David Cohen");
    assert.match(seed.notes, /the lakes · August/);
    assert.match(seed.notes, /Anniversary\./);
    // "sometime in August" is not a date range, so nothing here may pretend to
    // be one — the advisor sets real dates on the trip.
    assert.ok(!("startDate" in seed));
    assert.ok(!("endDate" in seed));
  });
});

describe("the vocabularies stay closed", () => {
  it("offers Other, so an advisor is never stuck", () => {
    assert.ok(LEAD_SOURCES.includes("Other"));
    assert.ok(LEAD_SOURCES.includes("Referral"));
    assert.ok(LEAD_SOURCES.includes("Repeat client"));
  });

  it("does not duplicate the trip stages", () => {
    // data/trip-pipeline.ts owns what happens AFTER conversion. An enquiry
    // carrying "traveling" or "completed" would be a second status to keep in
    // sync, and it would go stale the moment the trip moved on.
    for (const stage of ["planning", "awaiting_approval", "confirmed", "traveling", "completed"]) {
      assert.ok(!(INQUIRY_STATUSES as readonly string[]).includes(stage), `${stage} belongs to the trip, not the enquiry`);
    }
  });
});

describe("the store gives up finished work before live work", () => {
  it("keeps everything while under the cap", () => {
    const rows = [inquiry({ id: "a" }), inquiry({ id: "b", status: "lost" })];
    assert.equal(trim(rows).length, 2);
  });

  it("drops the oldest closed enquiry first, and never an open one", () => {
    const open = Array.from({ length: MAX_INQUIRIES - 1 }, (_, n) => inquiry({ id: `open-${n}` }));
    const oldClosed = inquiry({ id: "old-closed", status: "lost", updatedAt: "2026-01-01T00:00:00.000Z" });
    const newClosed = inquiry({ id: "new-closed", status: "converted", updatedAt: "2026-09-01T00:00:00.000Z" });
    const kept = trim([...open, oldClosed, newClosed]).map((row) => row.id);
    assert.equal(kept.length, MAX_INQUIRIES);
    assert.ok(kept.includes("new-closed"));
    assert.ok(!kept.includes("old-closed"));
    for (const row of open) assert.ok(kept.includes(row.id), `${row.id} is live work and must not be dropped`);
  });

  it("would rather exceed the cap than throw away live work", () => {
    const open = Array.from({ length: MAX_INQUIRIES + 5 }, (_, n) => inquiry({ id: `open-${n}` }));
    assert.equal(trim(open).length, MAX_INQUIRIES + 5);
  });

  it("does not mutate what it was given", () => {
    const rows = [inquiry({ id: "a" }), inquiry({ id: "b", status: "lost" })];
    trim(rows);
    assert.deepEqual(rows.map((r) => r.id), ["a", "b"]);
  });
});
