"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The advisor's notification bell, in their app's header.
 *
 * One opt-in that covers every client's trip: the advisor's own device is saved
 * on their account (/api/account/push), and the chat route pushes it whenever a
 * client writes back. So this is the other half of the client's per-trip
 * NotifyControl — the advisor being told, rather than the traveller.
 *
 * Nobody is subscribed without asking, and the bell only offers what the
 * browser supports; where push isn't available it says so plainly rather than
 * pretending.
 */

const NAVY = "#14213d";
const CREAM = "#f7f5f0";

// A standard, stable Web-Push helper — the same one the client control uses;
// duplicated here (ten pure lines) rather than reaching into the 4,000-line
// companion component for it.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type Status = "checking" | "unsupported" | "off" | "on" | "denied";

export default function AdvisorNotify() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    if (!publicKey || typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      void Promise.resolve().then(() => {
        if (active) setStatus("unsupported");
      });
      return () => {
        active = false;
      };
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (active) setStatus(sub ? "on" : Notification.permission === "denied" ? "denied" : "off");
      })
      .catch(() => {
        if (active) setStatus("off");
      });
    return () => {
      active = false;
    };
  }, [publicKey]);

  // Close the little panel on an outside click or on Escape (the keyboard way
  // out every other dialog on the site gives).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
        await sub.unsubscribe().catch(() => undefined);
      }
      setStatus("off");
    } catch {
      setError("Could not turn notifications off. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const on = status === "on";

  return (
    <div ref={panelRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        aria-expanded={open}
        style={{ position: "relative", border: "1px solid rgba(255,255,255,.22)", background: "rgba(255,255,255,.08)", width: 34, height: 34, borderRadius: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: CREAM }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {on && <span aria-hidden="true" style={{ position: "absolute", top: -3, right: -3, width: 11, height: 11, borderRadius: 14, background: "#4ba36a", border: `2px solid ${NAVY}` }} />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          style={{ position: "absolute", top: 42, right: 0, zIndex: 40, width: 250, background: "#ffffff", border: "1px solid rgba(38,50,58,.12)", borderRadius: 16, boxShadow: "0 18px 44px rgba(15,20,25,.22)", padding: 14, color: "#26323a", fontFamily: "Inter,system-ui,sans-serif" }}
        >
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Notifications</p>
          {status === "unsupported" ? (
            <p style={{ margin: "8px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "#78716c" }}>
              This device can&rsquo;t show push notifications. Open the app on your phone to turn them on there.
            </p>
          ) : status === "denied" ? (
            <p style={{ margin: "8px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "#78716c" }}>
              Notifications are blocked for this site in your browser settings. Allow them there, then come back.
            </p>
          ) : (
            <>
              <p style={{ margin: "6px 0 10px", fontSize: 12.5, lineHeight: 1.5, color: "#78716c" }}>
                Be told on this device when a client writes back — on any of your trips.
              </p>
              <button
                onClick={() => (on ? void unsubscribe() : void subscribe())}
                disabled={busy || status === "checking"}
                style={{ width: "100%", border: 0, cursor: busy ? "default" : "pointer", background: on ? "#eef2f5" : NAVY, color: on ? NAVY : CREAM, borderRadius: 12, padding: "10px 12px", font: "600 13px/1 Inter,sans-serif", opacity: busy || status === "checking" ? 0.6 : 1 }}
              >
                {status === "checking" ? "Checking…" : busy ? "One moment…" : on ? "Turn notifications off" : "Turn on notifications"}
              </button>
            </>
          )}
          {error && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#b4472e" }}>{error}</p>}
        </div>
      )}
    </div>
  );
}
