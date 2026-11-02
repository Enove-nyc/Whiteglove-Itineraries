import { randomBytes } from "node:crypto";
import { identityKey } from "@/lib/identity";
import { paidRedisCommand } from "@/lib/paid-redis";

/**
 * Read/validate/encode everything before ONE atomic MSET. A timeout after commit
 * can be retried: the permanent receipt is committed with the entitlement.
 * The old expiring marker is not proof of fulfillment; ambiguous legacy events
 * fail for reconciliation rather than silently grant twice or acknowledge loss.
 */
export const FULFILL_TRIP_PASS = `
local receiptRaw = redis.call("GET", KEYS[1])
if receiptRaw then
  local receipt = cjson.decode(receiptRaw)
  if receipt.account ~= ARGV[1] or receipt.plan ~= ARGV[2] then
    return redis.error_reply("purchase identity mismatch")
  end
  return "duplicate"
end
if redis.call("EXISTS", KEYS[2]) == 1 then
  return redis.error_reply("legacy purchase requires reconciliation")
end
local accountRaw = redis.call("GET", KEYS[3])
if not accountRaw or string.sub(accountRaw, 1, 1) ~= "{" then
  return redis.error_reply("account is unavailable")
end
if accountRaw ~= ARGV[6] then return "retry" end
local passesRaw = redis.call("GET", KEYS[4])
if passesRaw and string.sub(passesRaw, 1, 1) ~= "[" then
  return redis.error_reply("invalid pass ledger")
end
local passes = passesRaw and cjson.decode(passesRaw) or {}
for _, pass in ipairs(passes) do
  if type(pass) ~= "table" or type(pass.id) ~= "string" or type(pass.boughtAt) ~= "string" then
    return redis.error_reply("invalid pass ledger")
  end
end
local trip = cjson.null
if ARGV[3] ~= "" then
  local dataRaw = redis.call("GET", KEYS[6])
  if dataRaw then
    local data = cjson.decode(dataRaw)
    for _, owned in ipairs(data.trips or {}) do
      if owned.id == ARGV[3] then trip = ARGV[3] end
    end
  end
  for _, pass in ipairs(passes) do
    if pass.tripId == trip then trip = cjson.null end
  end
end
local pass = { id = ARGV[5], boughtAt = ARGV[4], tripId = trip, spentAt = cjson.null }
if trip ~= cjson.null then pass.spentAt = ARGV[4] end
table.insert(passes, pass)
local accountJSON = ARGV[7]
local passesJSON = cjson.encode(passes)
local purchaseJSON = cjson.encode({ plan = ARGV[2], purchasedAt = ARGV[4] })
local receiptJSON = cjson.encode({ version = 1, account = ARGV[1], plan = ARGV[2], passId = ARGV[5], fulfilledAt = ARGV[4] })
redis.call("MSET", KEYS[3], accountJSON, KEYS[4], passesJSON, KEYS[5], purchaseJSON, KEYS[1], receiptJSON)
return "created"
`;

export async function fulfillTripPassPurchase(input: {
  account: string;
  plan: string;
  sessionId: string;
  tripId?: string;
}): Promise<"created" | "duplicate"> {
  const account = identityKey(input.account);
  if (!account || input.plan !== "one_trip" || !input.sessionId.startsWith("cs_")) {
    throw new Error("Invalid Trip Pass purchase.");
  }
  const accountKey = `white-glove:account:${account}`;
  const now = new Date().toISOString();
  const passId = randomBytes(9).toString("base64url");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const raw = await paidRedisCommand<string | null>(["GET", accountKey]);
    let next = "";
    if (raw !== null) {
      const record: unknown = JSON.parse(raw);
      if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Invalid purchase account.");
      // Serialize in JavaScript: Redis cjson changes nested empty arrays to
      // objects, which would corrupt fields such as the account's team roster.
      next = JSON.stringify({ ...record, plan: input.plan, planSince: now, planSetBy: "Stripe one-time purchase" });
    }
    const result = await paidRedisCommand<unknown>([
      "EVAL", FULFILL_TRIP_PASS, 6,
      `white-glove:fulfilled-checkout:${input.sessionId}`,
      `white-glove:stripe-events:${input.sessionId}`,
      accountKey,
      `white-glove:trip-passes:${account}`,
      `white-glove:one-time-purchase:${account}`,
      `white-glove:account-data:${account}`,
      account, input.plan, input.tripId ?? "", now, passId, raw ?? "", next,
    ]);
    if (result === "created" || result === "duplicate") return result;
    if (result !== "retry") throw new Error("Invalid fulfillment response.");
  }
  throw new Error("Purchase account changed too often; please retry.");
}
