import { randomUUID } from "node:crypto";
import type { TripGroupMember } from "./trip-group-identity";

export type TripGroupMessage = { id: string; memberId: string; name: string; text: string; at: string };

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
export async function readTripGroup(group: string): Promise<TripGroupMessage[]> {
  const rows = await command<string[]>(["LRANGE", `white-glove:trip-group:${group}`, -500, -1]);
  return rows.map((row) => JSON.parse(row) as TripGroupMessage);
}
export async function sendTripGroup(member: TripGroupMember, text: string): Promise<TripGroupMessage[]> {
  const message: TripGroupMessage = { id: randomUUID(), memberId: member.id, name: member.name, text, at: new Date().toISOString() };
  // Append, bound storage, and return the current conversation atomically.
  const rows = await command<string[]>(["EVAL",
    "redis.call('RPUSH',KEYS[1],ARGV[1]); redis.call('LTRIM',KEYS[1],-500,-1); return redis.call('LRANGE',KEYS[1],-500,-1)",
    1, `white-glove:trip-group:${member.group}`, JSON.stringify(message),
  ]);
  return rows.map((row) => JSON.parse(row) as TripGroupMessage);
}
