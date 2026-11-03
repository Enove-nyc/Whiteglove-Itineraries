import { createHash, randomBytes } from "node:crypto";
import { identityKey, normalizeIdentity } from "@/lib/identity";

export const INVITATION_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const PREFIX = "white-glove:account-invitation:";
const INDEX = "white-glove:account-invitations";
export type AccountInvitation = {
  id: string;
  identity: string;
  createdAt: string;
  expiresAt: string;
  expiresAtMs: number;
  createdBy: string;
  status: "pending" | "used" | "revoked";
  usedAt?: string;
  revokedAt?: string;
};

export class InvitationStorageError extends Error {
  constructor() { super("Invitation storage is temporarily unavailable."); }
}

async function command<T>(args: (string | number)[]): Promise<T> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new InvitationStorageError();
  try {
    const response = await fetch(url.replace(/\/$/, ""), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    if (!response.ok) throw new InvitationStorageError();
    const payload = await response.json() as { result?: T; error?: unknown };
    if (payload.error || !Object.prototype.hasOwnProperty.call(payload, "result")) throw new InvitationStorageError();
    return payload.result as T;
  } catch { throw new InvitationStorageError(); }
}

export function invitationId(token: string): string | null {
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? createHash("sha256").update(token).digest("hex") : null;
}

function readRecord(raw: string | null): AccountInvitation | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as AccountInvitation;
    if (!/^[a-f0-9]{64}$/.test(value.id) || !normalizeIdentity(value.identity) || !Number.isFinite(value.expiresAtMs)) return null;
    return value;
  } catch { return null; }
}

const CREATE = `
if redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2], 'NX') == false then return 0 end
redis.call('ZADD', KEYS[2], ARGV[3], ARGV[4])
redis.call('ZREMRANGEBYRANK', KEYS[2], 0, -101)
return 1
`;

/** Trusted owner-side operation. Raw tokens are returned once and never stored. */
export async function createAccountInvitation(identifier: string, by: string, now = Date.now()) {
  const identity = normalizeIdentity(identifier);
  if (!identity) throw new Error("Enter a valid email address or phone number.");
  const token = randomBytes(32).toString("base64url");
  const id = invitationId(token)!;
  const expiresAtMs = now + INVITATION_LIFETIME_SECONDS * 1000;
  const invitation: AccountInvitation = {
    id, identity: identity.value, createdBy: by, status: "pending",
    createdAt: new Date(now).toISOString(), expiresAt: new Date(expiresAtMs).toISOString(), expiresAtMs,
  };
  const saved = await command<number>(["EVAL", CREATE, 2, PREFIX + id, INDEX, JSON.stringify(invitation), INVITATION_LIFETIME_SECONDS, now, id]);
  if (saved !== 1) throw new InvitationStorageError();
  return { invitation, token };
}

export async function inspectAccountInvitation(token: string, now = Date.now()): Promise<AccountInvitation | null> {
  const id = invitationId(token);
  if (!id) return null;
  const invitation = readRecord(await command<string | null>(["GET", PREFIX + id]));
  return invitation?.status === "pending" && invitation.expiresAtMs > now ? invitation : null;
}

export async function listAccountInvitations(): Promise<AccountInvitation[]> {
  const ids = await command<string[]>(["ZREVRANGE", INDEX, 0, 99]);
  if (!Array.isArray(ids)) throw new InvitationStorageError();
  const keys = ids.filter(id => /^[a-f0-9]{64}$/.test(id)).map(id => PREFIX + id);
  if (!keys.length) return [];
  const raw = await command<(string | null)[]>(["MGET", ...keys]);
  if (!Array.isArray(raw)) throw new InvitationStorageError();
  return raw.map(readRecord).filter((value): value is AccountInvitation => value !== null);
}

const REVOKE = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local invite = cjson.decode(raw)
if invite.status ~= 'pending' then return 0 end
invite.status = 'revoked'
invite.revokedAt = ARGV[1]
redis.call('SET', KEYS[1], cjson.encode(invite), 'KEEPTTL')
return 1
`;

export async function revokeAccountInvitation(id: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(id)) return false;
  return await command<number>(["EVAL", REVOKE, 1, PREFIX + id, new Date().toISOString()]) === 1;
}

const ACCEPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return -1 end
local invite = cjson.decode(raw)
if invite.status ~= 'pending' or invite.identity ~= ARGV[1] or invite.expiresAtMs <= tonumber(ARGV[2]) then return -1 end
if redis.call('EXISTS', KEYS[2]) == 1 or redis.call('EXISTS', KEYS[3]) == 1 then return -2 end
redis.call('SET', KEYS[2], ARGV[3])
redis.call('SET', KEYS[3], ARGV[4])
invite.status = 'used'
invite.usedAt = ARGV[5]
redis.call('SET', KEYS[1], cjson.encode(invite), 'KEEPTTL')
return 1
`;

/** Account creation and spending the invitation are one atomic Redis operation. */
export async function createInvitedAccount(token: string, identifier: string, accountJson: string, dataJson: string, now = Date.now()): Promise<"created" | "invalid" | "exists"> {
  const id = invitationId(token);
  if (!id) return "invalid";
  const identity = identityKey(identifier);
  const result = await command<number>(["EVAL", ACCEPT, 3, PREFIX + id, `white-glove:account:${identity}`, `white-glove:account-data:${identity}`, identity, now, accountJson, dataJson, new Date(now).toISOString()]);
  if (result === 1) return "created";
  if (result === -1) return "invalid";
  if (result === -2) return "exists";
  throw new InvitationStorageError();
}
