"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The app's own settings — Gold or Business, on the account page's app card.
 *
 * ONE SWITCH FOR NOW: the kosher-and-Shabbos layer, off until an account turns
 * it on. The app is a general itinerary tool; an agency that plans kosher
 * travel flips this and every trip they hand out carries candle-lighting, when
 * Shabbos ends, and the kosher places near it. Everyone else keeps a plain
 * planner and never sees any of it.
 */
export default function CompanionSettings() {
  const [ready, setReady] = useState(false);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/account/app-prefs", { cache: "no-store" });
      if (r.ok) {
        const d = await r.json();
        setOn(Boolean(d?.prefs?.kosherFeatures));
      }
    } catch {
      /* leave it off */
    } finally {
      setReady(true);
    }
  }, []);
  // Async wrapper rather than a bare call from the effect body: a bare call
  // enters it synchronously, which the rule counts as a setState during the
  // effect. Same shape the rest of this repo uses.
  useEffect(() => {
    let active = true;
    void (async () => {
      if (active) await load();
    })();
    return () => {
      active = false;
    };
  }, [load]);

  async function toggle() {
    if (busy) return;
    const next = !on;
    setOn(next); // optimistic
    setBusy(true);
    try {
      const r = await fetch("/api/account/app-prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kosherFeatures: next }),
      });
      if (r.ok) {
        const d = await r.json();
        setOn(Boolean(d?.prefs?.kosherFeatures));
      } else {
        setOn(!next); // put it back
      }
    } catch {
      setOn(!next);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  return (
    <div className="mt-4 flex flex-wrap items-start justify-between gap-4 border-t border-[var(--gold-light)] pt-4">
      <div className="min-w-0 max-w-md">
        <p className="text-sm font-semibold text-[var(--navy)]">Kosher &amp; Shabbos in the app</p>
        <p className="mt-1 text-xs leading-5 text-stone-600">
          Off by default. Turn it on to show each day&apos;s candle-lighting, when Shabbos ends, and
          the kosher places near the trip — in the app, and on any trip you share from it.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Kosher and Shabbos features in the app"
        onClick={toggle}
        disabled={busy}
        className={`relative h-6 w-11 flex-none rounded-full border transition disabled:opacity-60 ${
          on ? "border-[var(--navy)] bg-[var(--navy)]" : "border-stone-300 bg-stone-200"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`}
        />
      </button>
    </div>
  );
}
