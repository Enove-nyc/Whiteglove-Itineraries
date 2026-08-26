import { NextRequest, NextResponse } from "next/server";
import { removePushSubscription, resolveCompanionShare, savePushSubscription } from "@/lib/account-store";
import { mayServeCompanionClients } from "@/lib/account-limits";
import { getPlan } from "@/lib/account-plan-store";
import { rateLimit } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/secure-access";
import type { PushSubscriptionRecord } from "@/data/push-subscriptions";

export const dynamic = "force-dynamic";

// A client's own opt-in to be pushed a notification about their trip — see
// components/companion/CompanionApp.tsx for the control, and
// savePushSubscription in lib/account-store.ts for where it lands. No
// account and no sign-in here: the per-trip share token IS the credential,
// the same as every other client-side action on a shared trip.

// The hosts real browsers hand out push endpoints on. The server later POSTs
// to whatever endpoint we store (web-push), so an endpoint is a URL we will
// fetch — an attacker who could set it to an internal address would turn this
// into a blind SSRF from the server's network. Pin it to https on a known
// push service instead; a browser whose endpoint is elsewhere simply does not
// register for push, which is far cheaper than the hole.
const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "push.services.mozilla.com",
  "notify.windows.com",
  "push.apple.com",
];

function isAllowedPushEndpoint(endpoint: string): boolean {
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

function isValidSubscription(v: unknown): v is { endpoint: string; keys: { p256dh: string; auth: string } } {
  if (!v || typeof v !== "object") return false;
  const s = v as { endpoint?: unknown; keys?: unknown };
  if (typeof s.endpoint !== "string" || !s.endpoint.trim()) return false;
  if (!isAllowedPushEndpoint(s.endpoint)) return false;
  const keys = s.keys as { p256dh?: unknown; auth?: unknown } | undefined;
  return Boolean(keys && typeof keys.p256dh === "string" && typeof keys.auth === "string");
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "That request did not come from this site." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { shareId?: string; action?: string; subscription?: unknown; endpoint?: string }
    | null;
  const shareId = body?.shareId?.trim();
  if (!shareId) return NextResponse.json({ ok: false, error: "Missing the trip." }, { status: 400 });

  // A courtesy fence against a hammered subscribe/unsubscribe loop. The store
  // already caps a trip at a dozen subscriptions and dedups by endpoint, so
  // this is about request rate, not storage.
  const limited = await rateLimit(`companion-push:${shareId}`, { limit: 30, windowSeconds: 3600 });
  if (!limited.ok) {
    return NextResponse.json({ ok: false, error: "Too many changes at once — try again shortly." }, { status: 429 });
  }

  // Push, like the chat itself, is a companion-app feature: only a trip whose
  // owner may serve companion clients (Business) has an app to be pushed from.
  // A share token from any other plan is a read-only itinerary, not a channel.
  const resolved = await resolveCompanionShare(shareId);
  if (!resolved || !mayServeCompanionClients(await getPlan(resolved.ownerEmail))) {
    return NextResponse.json({ ok: false, error: "That link is not active." }, { status: 404 });
  }

  if (body?.action === "unsubscribe") {
    const endpoint = body.endpoint?.trim();
    if (!endpoint) return NextResponse.json({ ok: false, error: "Missing the subscription." }, { status: 400 });
    const ok = await removePushSubscription(shareId, endpoint);
    return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
  }

  const subscription = body?.subscription;
  if (!isValidSubscription(subscription)) {
    return NextResponse.json({ ok: false, error: "That does not look like a push subscription." }, { status: 400 });
  }
  const record: PushSubscriptionRecord = {
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    addedAt: new Date().toISOString(),
  };
  const ok = await savePushSubscription(shareId, record);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
