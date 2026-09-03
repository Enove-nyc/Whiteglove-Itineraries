import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { INBOUND_WORDS } from "@/data/inbound-words";
import {
  MAX_PENDING,
  MAX_UNCONFIRMED_PENDING,
  TOKEN_WORDS,
  addressedToMailbox,
  inboundAddress,
  isUnconfirmed,
  pendingToShow,
  senderAddress,
  tokenFromRecipients,
  type PendingImport,
} from "@/data/inbound-import";

function entry(over: Partial<PendingImport> = {}): PendingImport {
  return { id: "e1", at: "2026-09-03T12:00:00.000Z", subject: "Booking", from: "a@b.com", items: [], warnings: [], ...over };
}

/* ---------------------------------------------------------------- the words */

test("exactly 512 words, all unique — the whole strength of an address", () => {
  assert.equal(INBOUND_WORDS.length, 512);
  assert.equal(new Set(INBOUND_WORDS).size, 512);
});

test("every word can be typed without a decision: lowercase letters only", () => {
  for (const word of INBOUND_WORDS) {
    assert.match(word, /^[a-z]{3,10}$/, `"${word}" is not plainly typable`);
  }
});

test("four words from 512 is over sixty billion addresses", () => {
  assert.equal(TOKEN_WORDS, 4);
  assert.ok(INBOUND_WORDS.length ** TOKEN_WORDS > 6e10);
});

test("a word address parses back out of a recipient header", () => {
  const token = "cedar-harbor-lantern-swift";
  const to = inboundAddress(token, "whiteglovekoshertravel.com");
  assert.equal(to, "trips+cedar-harbor-lantern-swift@whiteglovekoshertravel.com");
  assert.equal(tokenFromRecipients([`Trips <${to}>`]), token);
});

test("the old character tokens still resolve — people have them saved", () => {
  assert.equal(tokenFromRecipients(["trips+Xk9_2mQvBz8Lw3aP@whiteglovekoshertravel.com"]), "Xk9_2mQvBz8Lw3aP");
});

/* ------------------------------------------------------------- the fallback */

test("the plain mailbox is recognised, in any of the shapes a header takes", () => {
  assert.equal(addressedToMailbox(["trips@whiteglovekoshertravel.com"]), true);
  assert.equal(addressedToMailbox(["Trips <trips@whiteglovekoshertravel.com>"]), true);
  assert.equal(addressedToMailbox(["someone@else.com, trips@whiteglovekoshertravel.com"]), true);
});

test("a tokened address is not the plain mailbox, and neither is a lookalike", () => {
  assert.equal(addressedToMailbox(["trips+cedar-harbor-lantern-swift@whiteglovekoshertravel.com"]), false);
  assert.equal(addressedToMailbox(["notrips@whiteglovekoshertravel.com"]), false);
  assert.equal(addressedToMailbox([""]), false);
});

test("a sender address is read out of either shape of From", () => {
  assert.equal(senderAddress("Sarah Cohen <Sarah@Example.com>"), "sarah@example.com");
  assert.equal(senderAddress("sarah@example.com"), "sarah@example.com");
  assert.equal(senderAddress("  sarah@example.com  "), "sarah@example.com");
});

test("anything that is not unmistakably one address gives nothing back", () => {
  for (const from of ["", "Sarah Cohen", "sarah@", "@example.com", "sarah@example", "a@b.com, c@d.com", "<>"]) {
    assert.equal(senderAddress(from), "", `"${from}" should not resolve to an address`);
  }
});

/* ---------------------------------------------------- forged mail is capped */

test("unconfirmed mail can never push a confirmed confirmation off the queue", () => {
  const confirmed = Array.from({ length: MAX_PENDING }, (_, i) =>
    entry({ id: `ok${i}`, at: `2026-09-01T${String(i).padStart(2, "0")}:00:00.000Z`, matchedBy: "address" }),
  );
  // A flood of forged mail, all of it newer than every real confirmation.
  const forged = Array.from({ length: 40 }, (_, i) =>
    entry({ id: `bad${i}`, at: `2026-09-02T${String(i % 24).padStart(2, "0")}:00:00.000Z`, matchedBy: "sender" }),
  );
  const kept = pendingToShow([...forged, ...confirmed], "2026-09-03T00:00:00.000Z");
  assert.equal(kept.filter((e) => !isUnconfirmed(e)).length, MAX_PENDING, "a real confirmation was evicted");
  assert.equal(kept.filter(isUnconfirmed).length, MAX_UNCONFIRMED_PENDING);
  for (const e of confirmed) assert.ok(kept.some((k) => k.id === e.id), `${e.id} was lost`);
});

test("the unconfirmed cap is far tighter than the confirmed one", () => {
  assert.ok(MAX_UNCONFIRMED_PENDING < MAX_PENDING);
});

test("an entry queued before any of this existed counts as confirmed", () => {
  assert.equal(isUnconfirmed(entry()), false);
  assert.equal(isUnconfirmed(entry({ matchedBy: "address" })), false);
  assert.equal(isUnconfirmed(entry({ matchedBy: "sender" })), true);
});

test("stale entries still drop out, whichever way they arrived", () => {
  const old = entry({ id: "old", at: "2026-01-01T00:00:00.000Z", matchedBy: "sender" });
  assert.deepEqual(pendingToShow([old], "2026-09-03T00:00:00.000Z"), []);
});

/* --------------------------------------------------------------- the route */

const ROUTE = readFileSync(new URL("../app/api/inbound/confirmation/route.ts", import.meta.url), "utf8");
const CODE = ROUTE.slice(ROUTE.indexOf("export async function POST"));

test("the address is tried first, and the sender can never override it", () => {
  assert.ok(CODE.indexOf("tokenFromRecipients") < CODE.indexOf("senderAddress"), "From is being read before the token");
  // The fallback runs only when there was no token at all.
  assert.match(CODE, /if \(!account && !token && addressedToMailbox\(recipients\)\)/);
});

test("the sender fallback only matches a verified account", () => {
  assert.match(CODE, /isAccountVerified\(sender\)/);
});

test("a sender match is recorded as such, never as an address match", () => {
  assert.match(CODE, /matchedBy = "sender"/);
  assert.match(CODE, /matchedBy,/);
});

test("the route still cannot write to a trip", () => {
  for (const forbidden of ["saveItinerary", "addImportedItems", "setTripItinerary", "upsertTrip"]) {
    assert.ok(!ROUTE.includes(forbidden), `the inbound route must not call ${forbidden}`);
  }
  assert.match(CODE, /addPending\(account, entry\)/);
});

test("it still fails closed with no signing secret, before anything is parsed", () => {
  assert.ok(CODE.indexOf("INBOUND_EMAIL_SECRET") < CODE.indexOf("JSON.parse"));
  assert.ok(CODE.indexOf("signatureOk") < CODE.indexOf("JSON.parse"));
});

/* ------------------------------------------------------------ what is said */

test("both screens say when a sender could not be confirmed", () => {
  const panel = readFileSync(new URL("../components/SmartImportPanel.tsx", import.meta.url), "utf8");
  const account = readFileSync(new URL("../components/ForwardingAddress.tsx", import.meta.url), "utf8");
  assert.match(panel, /isUnconfirmed\(entry\)/);
  assert.match(panel, /Sender not confirmed/);
  assert.match(account, /pending\.some\(isUnconfirmed\)/);
});

/* ------------------------------------------------- which domain it arrives at */

test("the receiving domain can be a subdomain, and falls back to the site's own", async () => {
  const { inboundDomain } = await import("@/lib/inbound-import-store");
  const before = process.env.INBOUND_EMAIL_DOMAIN;
  try {
    delete process.env.INBOUND_EMAIL_DOMAIN;
    assert.equal(inboundDomain("whiteglovekoshertravel.com"), "whiteglovekoshertravel.com");

    process.env.INBOUND_EMAIL_DOMAIN = "Mail.WhiteGloveKosherTravel.com";
    assert.equal(inboundDomain("whiteglovekoshertravel.com"), "mail.whiteglovekoshertravel.com");

    process.env.INBOUND_EMAIL_DOMAIN = "@mail.example.com";
    assert.equal(inboundDomain("whiteglovekoshertravel.com"), "mail.example.com");

    // Half a pasted URL in an email address is worse than no address at all.
    for (const bad of ["https://mail.example.com", "mail.example.com/inbound", "mail example com", "localhost", ""]) {
      process.env.INBOUND_EMAIL_DOMAIN = bad;
      assert.equal(inboundDomain("whiteglovekoshertravel.com"), "whiteglovekoshertravel.com", `"${bad}" was accepted`);
    }
  } finally {
    if (before === undefined) delete process.env.INBOUND_EMAIL_DOMAIN;
    else process.env.INBOUND_EMAIL_DOMAIN = before;
  }
});

test("only the address SHOWN depends on the domain — routing never does", () => {
  const store = readFileSync(new URL("../lib/inbound-import-store.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/inbound/confirmation/route.ts", import.meta.url), "utf8");
  // The account route builds the address with it; the inbound route never reads it.
  assert.ok(!route.includes("INBOUND_EMAIL_DOMAIN"), "the inbound route must not care which domain mail arrived on");
  assert.match(store, /export function inboundDomain/);
});
