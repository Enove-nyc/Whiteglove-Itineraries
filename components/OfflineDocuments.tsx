"use client";

import { useEffect, useState } from "react";

/**
 * "Keep these on this phone" — the traveller's own decision to make their
 * documents readable without signal.
 *
 * WHY THIS IS A BUTTON AND NOT THE DEFAULT. A boarding pass carries a full
 * name and a booking reference, which is enough to change somebody's flight.
 * The route that serves one says `private, no-store` and the service worker
 * has always left it alone. Storing a copy on the device is the right answer
 * at half past five at an airport with no signal, and the wrong one on a
 * borrowed laptop in a hotel lobby — and only the person holding the device
 * knows which of those they are. So it is asked, in words, and it is off until
 * they say otherwise.
 *
 * WHAT THEY AGREE TO IS WRITTEN ON THE SCREEN rather than implied: the files
 * are kept on this device, readable by anyone who can unlock it, until turned
 * off. Nothing about that is surprising once said, and all of it is surprising
 * if it is not.
 *
 * SIGNING OUT EMPTIES IT — see the sign-out path, which sends the same forget
 * message. A pass left behind after somebody signs out is the whole risk this
 * feature carries, and it is not left to the traveller to remember.
 */

type State = "unsupported" | "off" | "working" | "on" | "error";

export default function OfflineDocuments({ ids }: { ids: string[] }) {
  const [state, setState] = useState<State>("off");
  const [message, setMessage] = useState("");
  // A stable key for this page's document set, so the "already kept?" check
  // below re-runs when the documents change but not on every render.
  const idsKey = ids.join(",");

  useEffect(() => {
    let active = true;
    const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "caches" in window;
    const settle: Promise<State> = supported
      ? // Already kept? Ask the cache whether THIS page's own documents are
        // present — not merely whether the cache exists. A traveller who kept
        // one trip's passes then opened another trip's document page must not
        // be told "saved on this device" about passes that were never cached.
        (async () => {
          try {
            if (ids.length === 0) return "off" as State;
            const cache = await caches.open("wg-offline-docs-v1");
            for (const id of ids) {
              const hit = await cache.match(`/api/account/attachments?id=${encodeURIComponent(id)}`);
              if (!hit) return "off" as State;
            }
            return "on" as State;
          } catch {
            return "off" as State;
          }
        })()
      : Promise.resolve("unsupported");
    settle.then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
    // Re-checks when the page's own document set changes (keyed by id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  /** Send one instruction to the service worker and wait for its answer. */
  async function tell(type: string, payload: Record<string, unknown> = {}): Promise<{ ok?: boolean; kept?: number; asked?: number }> {
    const registration = await navigator.serviceWorker.ready;
    const worker = registration.active;
    if (!worker) throw new Error("no worker");
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => resolve(event.data ?? {});
      // A worker that never answers must not leave a spinner running forever.
      const timer = setTimeout(() => reject(new Error("timed out")), 30_000);
      channel.port1.addEventListener("message", () => clearTimeout(timer));
      worker.postMessage({ type, ...payload }, [channel.port2]);
    });
  }

  async function keep() {
    setState("working");
    setMessage("");
    try {
      const urls = ids.map((id) => `/api/account/attachments?id=${encodeURIComponent(id)}`);
      // The page itself as well as the files. Documents on the device with no
      // page to reach them from is not offline access, it is a folder nobody
      // can open — and this page is where they are listed by the day they are
      // needed, which is the whole shape that makes them usable at an airport.
      const result = await tell("wg-offline-keep", { urls, pages: [window.location.pathname] });
      if (!result.ok || !result.kept) {
        setState("error");
        setMessage("Could not save them. Check your connection and try again.");
        return;
      }
      setState("on");
      setMessage(
        result.kept === result.asked
          ? `${result.kept} ${result.kept === 1 ? "file is" : "files are"} on this device.`
          : `${result.kept} of ${result.asked} saved. Try again for the rest.`,
      );
    } catch {
      setState("error");
      setMessage("Could not save them. Check your connection and try again.");
    }
  }

  async function forget() {
    setState("working");
    setMessage("");
    try {
      await tell("wg-offline-forget");
      setState("off");
      setMessage("Removed from this device.");
    } catch {
      setState("error");
      setMessage("Could not remove them. Try again.");
    }
  }

  if (state === "unsupported") return null;

  const on = state === "on";
  const busy = state === "working";

  return (
    <div className="mt-6 border border-[var(--gold-light)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <p className="text-sm font-bold text-[var(--navy)]">
            {on ? "These open without signal" : "Keep these on this phone"}
          </p>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            {on
              ? "This page and your passes are saved on this device and will open at the gate with no connection. They stay until you turn this off or sign out."
              : "An airport at half past five is the likeliest place on the whole trip to have no signal, and the likeliest moment to need a boarding pass. Saving them here means they open anyway."}
          </p>
          {!on && (
            <p className="mt-2 text-xs leading-5 text-stone-600">
              They will be stored on this device and readable by anyone who can unlock it, until you turn this off or
              sign out. Do not do this on a borrowed or shared computer.
            </p>
          )}
          {message && <p className="mt-2 text-sm text-stone-700">{message}</p>}
        </div>
        <button
          type="button"
          onClick={() => void (on ? forget() : keep())}
          disabled={busy || ids.length === 0}
          className={`flex-none px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] disabled:opacity-60 ${
            on ? "border border-[var(--gold-light)] text-[var(--navy)]" : "bg-[var(--navy)] text-[var(--cream)]"
          }`}
        >
          {busy ? "One moment" : on ? "Remove them" : "Save them here"}
        </button>
      </div>
    </div>
  );
}
