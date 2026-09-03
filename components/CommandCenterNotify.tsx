"use client";

import { useEffect, useState } from "react";

/**
 * "Tell me on my phone" — the traveller's own opt-in to be pushed their own
 * trip's readiness alerts.
 *
 * The command centre answers the question when somebody opens it, which is
 * the half that only helps people who think to look. The alerts it shows are
 * the ones that get worse the longer nobody notices: a kever visit planned
 * for Shabbos is a different problem found three weeks out than found in a
 * hotel lobby in Poland. This is how it reaches them without being opened.
 *
 * The counterpart of NotifyControl in components/companion/CompanionApp.tsx,
 * and deliberately not shared with it: that one is a client on a per-trip
 * link, posts a share token, and is styled for the app. This one is a signed-
 * in traveller, posts nothing but the subscription (the session says who),
 * covers every trip in the account rather than one, and wears the site's own
 * chrome. Two things that look alike and agree on nothing that matters.
 *
 * Renders nothing at all when the browser cannot do push, or when this
 * deployment has no VAPID key — an offer nobody can accept is not an offer.
 */

/** A VAPID key, as it is stored, into the form the Push API wants. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type Status = "checking" | "unsupported" | "off" | "on" | "denied";

export default function CommandCenterNotify() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    // One path, resolved asynchronously, rather than a synchronous setState
    // for the unsupported case and an async one for everything else. The
    // repo's react-hooks/set-state-in-effect rule rejects the first shape,
    // and it is right to: an effect that sometimes settles immediately and
    // sometimes a tick later is the sort of thing that renders one answer and
    // then another.
    const supported =
      Boolean(publicKey) && typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
    const settle: Promise<Status> = supported
      ? navigator.serviceWorker.ready
          .then((reg) => reg.pushManager.getSubscription())
          .then((sub) => (sub ? "on" : Notification.permission === "denied" ? "denied" : "off"))
      : Promise.resolve("unsupported");
    settle
      .then((next) => {
        if (active) setStatus(next);
      })
      .catch(() => {
        if (active) setStatus("off");
      });
    return () => {
      active = false;
    };
  }, [publicKey]);

  async function subscribe() {
    if (!publicKey) return;
    setBusy(true);
    setError("");
    try {
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource });
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("incomplete subscription");
      const res = await fetch("/api/account/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: { endpoint: json.endpoint, keys: json.keys } }),
      });
      if (!res.ok) throw new Error("save failed");
      setStatus("on");
    } catch {
      setError("Could not turn on notifications. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    setError("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/account/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "unsubscribe", endpoint: sub.endpoint }),
        }).catch(() => undefined);
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch {
      setError("Could not turn off notifications. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "unsupported" || status === "checking") return null;

  return (
    <div className="mb-10 flex flex-wrap items-center justify-between gap-4 border border-[var(--gold-light)] bg-white p-5">
      <div>
        <p className="text-sm font-bold text-[var(--navy)]">Tell me on my phone</p>
        <p className="mt-1 text-sm leading-6 text-stone-600">
          {status === "denied"
            ? "Notifications are blocked in your browser's settings."
            : status === "on"
              ? "On for this device, for every trip in your account."
              : "A stop that falls on Shabbos, or loose ends as you get close to leaving — sent to you rather than waiting here."}
        </p>
        {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
      </div>
      {status !== "denied" && (
        <button
          onClick={() => void (status === "on" ? unsubscribe() : subscribe())}
          disabled={busy}
          className={`flex-none px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] disabled:opacity-60 ${
            status === "on" ? "border border-[var(--gold-light)] text-[var(--navy)]" : "bg-[var(--navy)] text-[var(--cream)]"
          }`}
        >
          {busy ? "One moment" : status === "on" ? "Turn off" : "Turn on"}
        </button>
      )}
    </div>
  );
}
