import webpush from "web-push";
import { apiKey } from "@/lib/api-key";
import { BRAND_ORIGIN } from "@/lib/site-brand-core";
import type { PushSubscriptionRecord } from "@/data/push-subscriptions";

/**
 * Sending a push notification — server-only, and only ever for something the
 * traveler already asked to be told about (a flight delay, a cancellation, a
 * gate change; see alertsFromStatusChange in data/trip-alerts.ts for what
 * counts as worth one). Nobody is subscribed without asking, and the
 * subscribe control only appears where a client is actually looking at
 * their own trip — see components/companion/CompanionApp.tsx.
 *
 * VAPID, NOT A THIRD-PARTY PUSH SERVICE. Web Push needs a keypair to prove
 * to the browser's own push service (Google's, Mozilla's, Apple's) that the
 * notification really came from this site and not from whoever guessed a
 * subscription's endpoint. The keys are generated once and kept as
 * VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY; nothing here talks to a paid
 * service — the browsers' own push infrastructure is free to use.
 */

let configured = false;

/**
 * A contact the push services (Google's, Mozilla's, Apple's) can reach about
 * this sender if they ever need to — required by the Web Push protocol, and
 * never sent to the traveler's device. The spec accepts an https: URL as
 * well as a mailto:, so the site's own origin stands in for a support
 * mailbox rather than inventing or reusing anyone's personal address.
 */
function vapidSubject(): string {
  return BRAND_ORIGIN.itineraries;
}

/** True once a real keypair is set — the subscribe control checks this via the public key below. */
export function pushConfigured(): boolean {
  return Boolean(apiKey("VAPID_PUBLIC_KEY") && apiKey("VAPID_PRIVATE_KEY"));
}

/** The public half, safe to hand to a browser — read from the client-visible copy Next.js inlines. */
export function vapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
}

function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = apiKey("VAPID_PUBLIC_KEY");
  const privateKey = apiKey("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(vapidSubject(), publicKey, privateKey);
  configured = true;
  return true;
}

/**
 * The hosts real browsers hand out push endpoints on. The server later POSTs
 * to whatever endpoint is stored (web-push), so an endpoint is a URL we will
 * fetch — an attacker who could set it to an internal address would turn a
 * subscribe call into a blind SSRF from the server's network. Pinned to https
 * on a known push service; a browser whose endpoint is elsewhere simply does
 * not register, which is far cheaper than the hole. Shared by both the client
 * (per-trip) and advisor (account) subscribe routes so the fence can't drift.
 */
const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "push.services.mozilla.com",
  "notify.windows.com",
  "push.apple.com",
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export function isValidPushSubscription(v: unknown): v is { endpoint: string; keys: { p256dh: string; auth: string } } {
  if (!v || typeof v !== "object") return false;
  const s = v as { endpoint?: unknown; keys?: unknown };
  if (typeof s.endpoint !== "string" || !s.endpoint.trim()) return false;
  if (!isAllowedPushEndpoint(s.endpoint)) return false;
  const keys = s.keys as { p256dh?: unknown; auth?: unknown } | undefined;
  return Boolean(keys && typeof keys.p256dh === "string" && typeof keys.auth === "string");
}

export type PushPayload = { title: string; body: string; url?: string };

export type PushSendResult = {
  sent: number;
  /** Endpoints the push service says are gone — the caller should stop keeping these. */
  expired: string[];
};

/**
 * Push the same message to every device subscribed on a trip.
 *
 * Best-effort, one subscription at a time: a dead or misconfigured
 * subscription must never stop the others in the list from being reached.
 */
export async function sendPushToSubscriptions(
  subscriptions: readonly PushSubscriptionRecord[],
  payload: PushPayload,
): Promise<PushSendResult> {
  if (!subscriptions.length || !ensureConfigured()) return { sent: 0, expired: [] };

  const body = JSON.stringify(payload);
  const expired: string[] = [];
  let sent = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body);
      sent += 1;
    } catch (error) {
      // 404/410 is the push service saying this endpoint no longer exists —
      // the browser dropped the subscription (uninstalled, cleared data).
      // Anything else (a transient network error, a bad payload) is not
      // reason to forget the device; only these two mean "stop trying".
      const status = (error as { statusCode?: number } | null)?.statusCode;
      if (status === 404 || status === 410) expired.push(sub.endpoint);
      else console.error("[push-notify] send failed:", error);
    }
  }

  return { sent, expired };
}
