import { randomUUID } from "node:crypto";
import type { TripGroupMember } from "./trip-group-identity";
import type { TripChatChannel } from "./trip-chat-channels";

export type TripGroupMessage = { id: string; memberId: string; name: string; text: string; at: string; channel?: TripChatChannel };

// Messages belong to a trip, never to an address book or a private inbox.
// A Redis list avoids lost messages when two travelers send at once.
async function command<T>(args: (string | number)[]): Promise<T> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Trip chat is unavailable.");
  const response = await fetch(url.replace(/\/$/, ""), {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args), cache: "no-store", signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Trip chat is unavailable.");
  const data = await response.json() as { result: T; error?: string };
  if (data.error) throw new Error("Trip chat is unavailable.");
  return data.result;
}
// Preserve the original General key so existing conversations need no migration.
function conversationKey(group: string, channel: TripChatChannel): string {
  return `white-glove:trip-group:${group}${channel === "general" ? "" : ":" + channel}`;
}
function messages(rows: string[], channel: TripChatChannel): TripGroupMessage[] {
  return rows.map(row => ({ ...JSON.parse(row) as TripGroupMessage, channel }));
}
export async function readTripGroup(group: string, channel: TripChatChannel = "general"): Promise<TripGroupMessage[]> {
  return messages(await command<string[]>(["LRANGE", conversationKey(group, channel), -500, -1]), channel);
}
/** A quiet conversation returns null without transferring the entire Redis list. */
export async function pollTripGroup(group: string, channel: TripChatChannel, after: string): Promise<TripGroupMessage[] | null> {
  const rows = await command<string[] | null>(["EVAL",
    "local last=redis.call('LINDEX',KEYS[1],-1); if last and cjson.decode(last).id==ARGV[1] then return false end; return redis.call('LRANGE',KEYS[1],-500,-1)",
    1, conversationKey(group, channel), after,
  ]);
  return rows === null ? null : messages(rows, channel);
}
export async function sendTripGroup(member: TripGroupMember, text: string, channel: TripChatChannel = "general"): Promise<TripGroupMessage[]> {
  const message: TripGroupMessage = { id: randomUUID(), memberId: member.id, name: member.name, text, at: new Date().toISOString(), channel };
  const rows = await command<string[]>(["EVAL",
    "redis.call('RPUSH',KEYS[1],ARGV[1]); redis.call('LTRIM',KEYS[1],-500,-1); return redis.call('LRANGE',KEYS[1],-500,-1)",
    1, conversationKey(member.group, channel), JSON.stringify(message),
  ]);
  return messages(rows, channel);
}
