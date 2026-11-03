import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, afterEach, before, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { createAccount, getAccountRecord, signInWithGoogle, verifyAccount } from "@/lib/account-store";
import { POST as register } from "@/app/api/account/register/route";
import { createAccountInvitation, createInvitedAccount, inspectAccountInvitation, invitationId, InvitationStorageError, listAccountInvitations, revokeAccountInvitation } from "@/lib/account-invitations";

describe("invitation token validation", () => {
  it("rejects missing, oversized and malformed credentials before storage", async () => {
    for (const token of ["", "short", "x".repeat(44), "../".repeat(15), "x".repeat(42) + " "]) {
      assert.equal(invitationId(token), null);
      assert.equal(await inspectAccountInvitation(token), null);
    }
  });
  it("stores a SHA-256 identifier rather than the bearer token", () => {
    const token = "a".repeat(43);
    assert.equal(invitationId(token), createHash("sha256").update(token).digest("hex"));
    assert.notEqual(invitationId(token), token);
  });
});

describe("single-use invitations on real isolated Redis", { skip: process.env.INVITE_INTEGRATION !== "1" }, () => {
  const url = process.env.UPSTASH_REDIS_REST_URL || "";
  const originalFetch = global.fetch;
  const fixtureFetch: typeof fetch = async (input, init) => {
    const address = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    assert.equal(new URL(address).hostname, "127.0.0.1", "External email/provider requests are disabled in invitation fixtures.");
    return originalFetch(input, init);
  };
  const keys = new Set<string>();
  let sequence = 0;
  before(() => { assert.equal(new URL(url).hostname, "127.0.0.1", "Invitation integration tests require the disposable loopback store."); global.fetch = fixtureFetch; });
  async function raw(args: (string | number)[]) {
    assert.equal(new URL(url).hostname, "127.0.0.1", "Fixture cleanup must never reach production.");
    const response = await originalFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args) });
    assert.equal(response.status, 200);
    return (await response.json() as { result: unknown }).result;
  }
  function identity() { return `invitation-${++sequence}@invite-test.audit.local`; }
  async function issue(email = identity(), now?: number) {
    const issued = await createAccountInvitation(email, "owner@audit.local", now);
    keys.add("white-glove:account-invitation:" + issued.invitation.id);
    keys.add("white-glove:account:" + issued.invitation.identity);
    keys.add("white-glove:account-data:" + issued.invitation.identity);
    return issued;
  }
  function payload(email: string, name = "Invited traveller") {
    return [JSON.stringify({ email, name, passwordHash: "fixture", salt: "fixture" }), JSON.stringify({ route: [], favorites: [], notes: name })] as const;
  }
  function acceptanceRequest(init?: RequestInit) {
    if (typeof init?.body !== "string") return false;
    try { const args = JSON.parse(init.body); return args[0] === "EVAL" && String(args[1]).includes("invite.usedAt"); } catch { return false; }
  }
  afterEach(() => { global.fetch = fixtureFetch; });
  after(async () => { global.fetch = originalFetch; if (keys.size) await raw(["DEL", ...keys]); await raw(["DEL", "white-glove:account-invitations"]); });

  it("issues an identity-bound seven-day invitation without storing its raw token", async () => {
    const now = Date.now(); const issued = await issue("Mixed.Case@invite-test.audit.local", now);
    assert.match(issued.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(issued.invitation.identity, "mixed.case@invite-test.audit.local");
    assert.equal(issued.invitation.expiresAtMs - now, 7 * 24 * 3600 * 1000);
    const stored = await raw(["GET", "white-glove:account-invitation:" + issued.invitation.id]);
    assert(!String(stored).includes(issued.token));
    assert.equal((await inspectAccountInvitation(issued.token))?.identity, issued.invitation.identity);
  });
  it("rejects an unknown token", async () => {
    assert.equal(await inspectAccountInvitation("z".repeat(43)), null);
    assert.equal(await createInvitedAccount("z".repeat(43), identity(), "{}", "{}"), "invalid");
  });
  it("rejects another identity without using the invitation or writing an account", async () => {
    const issued = await issue(); const other = identity();
    const [account, data] = payload(other);
    assert.equal(await createInvitedAccount(issued.token, other, account, data), "invalid");
    assert.equal(await raw(["GET", "white-glove:account:" + other]), null);
    assert(await inspectAccountInvitation(issued.token));
  });
  it("rejects expired and revoked invitations", async () => {
    const expired = await issue(identity(), Date.now() - 8 * 24 * 3600 * 1000);
    assert.equal(await inspectAccountInvitation(expired.token), null);
    assert.equal(await createInvitedAccount(expired.token, expired.invitation.identity, ...payload(expired.invitation.identity)), "invalid");
    const revoked = await issue(); assert(await revokeAccountInvitation(revoked.invitation.id));
    assert.equal(await inspectAccountInvitation(revoked.token), null);
    assert.equal(await createInvitedAccount(revoked.token, revoked.invitation.identity, ...payload(revoked.invitation.identity)), "invalid");
  });
  it("creates the account and data together, then refuses token reuse", async () => {
    const issued = await issue(), email = issued.invitation.identity;
    const [account, data] = payload(email);
    assert.equal(await createInvitedAccount(issued.token, email, account, data), "created");
    assert.equal(await raw(["GET", "white-glove:account:" + email]), account);
    assert.equal(await raw(["GET", "white-glove:account-data:" + email]), data);
    assert.equal(await inspectAccountInvitation(issued.token), null);
    assert.equal(await createInvitedAccount(issued.token, email, ...payload(email, "Replacement")), "invalid");
    assert.equal(await raw(["GET", "white-glove:account:" + email]), account);
  });
  it("has exactly one winner under concurrent registration attempts", async () => {
    const issued = await issue(), email = issued.invitation.identity;
    const results = await Promise.all(Array.from({ length: 16 }, (_, i) => createInvitedAccount(issued.token, email, ...payload(email, "Attempt " + i))));
    assert.equal(results.filter(result => result === "created").length, 1);
    const winner = results.indexOf("created");
    assert.equal(await raw(["GET", "white-glove:account:" + email]), payload(email, "Attempt " + winner)[0]);
    assert.equal(await raw(["GET", "white-glove:account-data:" + email]), payload(email, "Attempt " + winner)[1]);
  });
  it("does not overwrite an account when different invitations race for the same identity", async () => {
    const first = await issue(); const second = await issue(first.invitation.identity), email = first.invitation.identity;
    const results = await Promise.all([createInvitedAccount(first.token, email, ...payload(email, "First")), createInvitedAccount(second.token, email, ...payload(email, "Second"))]);
    assert.deepEqual([...results].sort(), ["created", "exists"]);
    assert.equal(await raw(["GET", "white-glove:account:" + email]), payload(email, results[0] === "created" ? "First" : "Second")[0]);
  });
  it("preserves an orphaned data record instead of replacing it", async () => {
    const issued = await issue(), email = issued.invitation.identity;
    await raw(["SET", "white-glove:account-data:" + email, "retained trip data"]);
    assert.equal(await createInvitedAccount(issued.token, email, ...payload(email)), "exists");
    assert.equal(await raw(["GET", "white-glove:account-data:" + email]), "retained trip data");
    assert(await inspectAccountInvitation(issued.token));
  });
  it("fails closed on storage failure without using the invitation", async () => {
    const issued = await issue(), email = issued.invitation.identity;
    global.fetch = async (input, init) => acceptanceRequest(init) ? new Response("unavailable", { status: 503 }) : originalFetch(input, init);
    await assert.rejects(createInvitedAccount(issued.token, email, ...payload(email)), InvitationStorageError);
    global.fetch = originalFetch;
    assert(await inspectAccountInvitation(issued.token));
    assert.equal(await raw(["GET", "white-glove:account:" + email]), null);
    assert.equal(await createInvitedAccount(issued.token, email, ...payload(email)), "created");
  });
  it("cannot grant a second account or overwrite data after a lost commit response", async () => {
    const issued = await issue(), email = issued.invitation.identity;
    global.fetch = async (input, init) => { const response = await originalFetch(input, init); if (acceptanceRequest(init)) throw new Error("simulated lost response"); return response; };
    await assert.rejects(createInvitedAccount(issued.token, email, ...payload(email, "Original")), InvitationStorageError);
    global.fetch = originalFetch;
    assert.equal(await createInvitedAccount(issued.token, email, ...payload(email, "Replacement")), "invalid");
    assert.equal(await raw(["GET", "white-glove:account:" + email]), payload(email, "Original")[0]);
  });
  it("enforces invitation-only registration at the HTTP handler", async () => {
    const issued = await issue(), email = issued.invitation.identity;
    const request = (data: unknown) => new NextRequest("http://127.0.0.1:3002/api/account/register", { method: "POST", headers: { origin: "http://127.0.0.1:3002", "content-type": "application/json", "x-wg-brand": "kosher", "cf-connecting-ip": "192.0.2.200", "x-forwarded-for": "192.0.2.200" }, body: JSON.stringify(data) });
    assert.equal((await register(request({ email, password: "Audit-local-pass-1!" }))).status, 403);
    assert.equal(await getAccountRecord(email) ?? null, null);
    assert.equal((await register(request({ email: "someone-else@audit.local", password: "Audit-local-pass-1!", invitationToken: issued.token }))).status, 403);
    assert(await inspectAccountInvitation(issued.token));
    const accepted = await register(request({ email, password: "Audit-local-pass-1!", invitationToken: issued.token }));
    assert.equal(accepted.status, 200, await accepted.clone().text());
    assert.equal((await accepted.json()).verificationRequired, true);
    assert.equal(await verifyAccount(email, "Audit-local-pass-1!"), true);
    assert.equal((await register(request({ email, password: "Different-password-1!", invitationToken: issued.token }))).status, 403);
    assert.equal(await verifyAccount(email, "Audit-local-pass-1!"), true);
  });
  it("Google cannot create a new uninvited account", async () => {
    const email = identity(); keys.add("white-glove:account:" + email); keys.add("white-glove:account-data:" + email);
    const result = await signInWithGoogle({ email, googleId: "fixture-subject" });
    assert.equal(result.ok, false);
    assert.equal(await getAccountRecord(email) ?? null, null);
  });
  it("existing accounts keep Google login, their password and saved data", async () => {
    const issued = await issue(), email = issued.invitation.identity;
    const created = await createAccount(email, "Audit-local-pass-1!", "Existing member"); assert(created.ok);
    await raw(["SET", "white-glove:account-data:" + email, JSON.stringify({ notes: "Keep my trip" })]);
    const prior = await getAccountRecord(email);
    const result = await signInWithGoogle({ email, googleId: "fixture-subject", name: "Provider name" });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.created, false);
    const after = await getAccountRecord(email);
    assert.equal(after?.passwordHash, prior?.passwordHash); assert.equal(after?.name, "Existing member"); assert(after?.verifiedAt);
    assert.equal(await raw(["GET", "white-glove:account-data:" + email]), JSON.stringify({ notes: "Keep my trip" }));
    assert.equal(await verifyAccount(email, "Audit-local-pass-1!"), true);
  });
  it("lists use/revocation state without exposing bearer tokens", async () => {
    const issued = await issue(); await revokeAccountInvitation(issued.invitation.id);
    const list = await listAccountInvitations();
    assert.equal(list.find(record => record.id === issued.invitation.id)?.status, "revoked");
    assert(!JSON.stringify(list).includes(issued.token));
  });
});
