import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { accepting, openStatus, withOpen, withRevoked, type ShareOpens } from "@/lib/share-opens";

const T = (s: string) => `2026-08-${s}`;

describe("what an open records", () => {
  it("the first open sets both dates", () => {
    const out = withOpen({}, T("31T09:42:00.000Z"));
    assert.equal(out.firstOpenedAt, T("31T09:42:00.000Z"));
    assert.equal(out.lastOpenedAt, T("31T09:42:00.000Z"));
  });

  it("a later open moves only the last", () => {
    const one = withOpen({}, T("29T10:00:00.000Z"));
    const two = withOpen(one, T("31T18:00:00.000Z"));
    assert.equal(two.firstOpenedAt, T("29T10:00:00.000Z"), "the first open moved");
    assert.equal(two.lastOpenedAt, T("31T18:00:00.000Z"));
  });

  it("an out-of-order timestamp never drags the record backwards", () => {
    // A retry or a skewed clock must not make a link look less recently read
    // than it is, nor rewrite when it was first seen.
    const one = withOpen({}, T("31T18:00:00.000Z"));
    const late = withOpen(one, T("29T10:00:00.000Z"));
    assert.equal(late.firstOpenedAt, T("29T10:00:00.000Z"), "an earlier open should still win 'first'");
    assert.equal(late.lastOpenedAt, T("31T18:00:00.000Z"), "'last' went backwards");
  });

  it("records nothing at all beyond two dates", () => {
    // The privacy promise, held as a shape test: no ip, agent, device,
    // location, count or trail may appear on this record.
    const out = withOpen(withOpen({}, T("29T10:00:00.000Z")), T("31T18:00:00.000Z"));
    assert.deepEqual(Object.keys(out).sort(), ["firstOpenedAt", "lastOpenedAt"]);
  });
});

describe("a stopped link", () => {
  const stopped = withRevoked(withOpen({}, T("29T10:00:00.000Z")), T("30T12:00:00.000Z"));

  it("keeps what it had", () => {
    assert.equal(stopped.firstOpenedAt, T("29T10:00:00.000Z"));
    assert.equal(stopped.revokedAt, T("30T12:00:00.000Z"));
  });

  it("REFUSES later opens rather than merely not receiving them", () => {
    const after = withOpen(stopped, T("31T09:00:00.000Z"));
    assert.equal(after.lastOpenedAt, T("29T10:00:00.000Z"), "a revoked link recorded a later open");
    assert.equal(accepting(stopped), false);
  });

  it("is not revoked twice, so the first stop is the one on record", () => {
    assert.equal(withRevoked(stopped, T("31T00:00:00.000Z")).revokedAt, T("30T12:00:00.000Z"));
  });
});

describe("what the advisor reads", () => {
  const NOW = "2026-08-31T20:00:00.000Z";

  it("says so plainly when nobody has opened it", () => {
    const s = openStatus({}, NOW);
    assert.equal(s.text, "Not opened yet");
    assert.equal(s.state, "unopened");
    assert.equal(s.detail, "");
  });

  it("a single open is one sentence, not a line repeating itself", () => {
    const s = openStatus(withOpen({}, "2026-08-31T09:42:00.000Z"), NOW);
    assert.equal(s.text, "First opened 31 Aug");
    assert.equal(s.detail, "", "a single open produced a second line saying the same thing");
  });

  it("says 'today' for an open earlier the same day, with the time", () => {
    const opens = withOpen(withOpen({}, "2026-08-29T10:00:00.000Z"), "2026-08-31T09:42:00.000Z");
    const s = openStatus(opens, NOW);
    assert.match(s.text, /^Last opened today at /);
    assert.match(s.text, /9:42/);
    assert.equal(s.detail, "First opened 29 Aug");
  });

  it("USES THE TRIP'S TIMEZONE, not the server's", () => {
    // 22:30 UTC on the 30th is already 07:30 on the 31st in Tokyo. An advisor
    // reading a Tokyo trip should see the traveller's day, not the server's.
    const opens = withOpen({}, "2026-08-30T22:30:00.000Z");
    assert.match(openStatus(opens, NOW, "UTC").text, /30 Aug/);
    assert.match(openStatus(opens, NOW, "Asia/Tokyo").text, /31 Aug/);
  });

  it("counts 'today' in the trip's timezone too", () => {
    // Opened 22:30 UTC on the 30th; read at 02:00 UTC on the 31st. In Tokyo
    // both fall on the 31st — so it is "today" there and yesterday in UTC.
    const morning = "2026-08-31T02:00:00.000Z";
    const opens = withOpen(withOpen({}, "2026-08-20T00:00:00.000Z"), "2026-08-30T22:30:00.000Z");
    assert.doesNotMatch(openStatus(opens, morning, "UTC").text, /today/);
    assert.match(openStatus(opens, morning, "Asia/Tokyo").text, /today/);
  });

  it("a stopped link still shows what happened before it was stopped", () => {
    const opens = withRevoked(withOpen({}, "2026-08-29T10:00:00.000Z"), "2026-08-30T12:00:00.000Z");
    const s = openStatus(opens, NOW);
    assert.equal(s.state, "revoked");
    assert.match(s.text, /^Stopped/);
    assert.match(s.text, /29 Aug/);
  });

  it("a stopped link nobody opened says that, rather than 'not opened yet'", () => {
    // "Yet" promises a future that is not coming for a link that is off.
    const s = openStatus(withRevoked({}, "2026-08-30T12:00:00.000Z"), NOW);
    assert.equal(s.text, "Stopped — never opened");
    assert.equal(s.state, "revoked");
  });

  it("never leans on colour: every state carries its meaning in words", () => {
    const cases: ShareOpens[] = [
      {},
      withOpen({}, "2026-08-31T09:42:00.000Z"),
      withRevoked(withOpen({}, "2026-08-29T10:00:00.000Z"), "2026-08-30T12:00:00.000Z"),
    ];
    for (const c of cases) {
      const s = openStatus(c, NOW);
      assert.ok(s.text.trim().length > 3, "a state produced no readable text");
    }
  });

  it("survives an unreadable timestamp instead of printing Invalid Date", () => {
    const s = openStatus({ firstOpenedAt: "whenever", lastOpenedAt: "whenever" }, NOW);
    assert.equal(s.text, "Not opened yet");
  });
});

describe("where the status is recorded and shown", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("every traveller-facing door records an open", () => {
    for (const page of [
      "app/i/[shareId]/page.tsx",
      "app/i/[shareId]/app/page.tsx",
      "app/t/[shareId]/app/page.tsx",
    ]) {
      assert.match(read(page), /noteShareOpened\(shareId, shared\.ownerEmail\)/, page);
    }
  });

  it("THE ADVISOR'S OWN PREVIEW IS EXCLUDED, and a colleague's too", () => {
    // The existing proposal viewedAt has exactly this bug — an advisor's own
    // "Preview as client" marks a sent proposal viewed. This must not repeat
    // it: a status pointing the wrong way is worse than none.
    const recorder = read("lib/share-open-recorder.ts");
    assert.match(recorder, /identityKey\(viewer\) === identityKey\(ownerEmail\)/);
    assert.match(recorder, /resolveBusinessOwner\(viewer\)/);
    // And it never blocks the traveller's page on a failed write.
    assert.match(recorder, /catch \{/);
  });

  it("records nothing but two dates — no address, device or trail", () => {
    const store = read("lib/account-store.ts");
    const fn = store.slice(store.indexOf("export async function recordShareOpen"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    for (const forbidden of ["ip", "agent", "userAgent", "device", "location", "referer", "count"]) {
      assert.ok(!new RegExp(`\\b${forbidden}\\b`, "i").test(body), `recordShareOpen touches ${forbidden}`);
    }
  });

  it("stopping a link freezes its record BEFORE the link is deleted", () => {
    // After the delete there is no token to look up, so the order matters.
    const store = read("lib/account-store.ts");
    const fn = store.slice(store.indexOf("export async function stopTripShare"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    assert.ok(body.indexOf("markShareRevoked") < body.indexOf("deleteKey(shareKey"), "the link is deleted before it is frozen");
    assert.match(body, /revokedShareIds: remembered/, "a stopped link is forgotten, so its history cannot be shown");
  });

  it("the status is worked out on the server, in the trip's own timezone", () => {
    const store = read("lib/account-store.ts");
    assert.match(store, /openStatus\(opens, now, zone\)/);
    assert.match(store, /tripTimeZone\(trips\.find/);
  });

  it("the advisor sees it on the sharing panel and on the board", () => {
    assert.match(read("components/TripSwitcher.tsx"), /<ShareOpenStatus/);
    assert.match(read("components/PipelineDashboard.tsx"), /<ShareOpenStatus/);
    assert.match(read("app/api/account/trips/route.ts"), /withLinkOpens\(email\)/);
  });

  it("the line never depends on colour to be read", () => {
    // The icon and the tone reinforce; the words carry it.
    const view = read("components/ShareOpenStatus.tsx");
    assert.match(view, /\{status\.text\}/);
    assert.match(view, /name=\{icon\}/);
  });
});
