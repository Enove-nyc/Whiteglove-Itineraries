/** Strict Redis commands for paid fulfillment: failures must remain retryable. */
export async function paidRedisCommand<T>(command: Array<string | number>): Promise<T> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Payment storage is not configured.");
  const response = await fetch(url.replace(/\/$/, ""), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Payment storage request failed.");
  const payload = await response.json() as { result?: T; error?: unknown };
  if (payload.error || !Object.prototype.hasOwnProperty.call(payload, "result")) {
    throw new Error("Payment storage command failed.");
  }
  return payload.result as T;
}

