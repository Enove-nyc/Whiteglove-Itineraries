"use client";

import { useState } from "react";
import type { SavedPlace } from "@/data/route-utils";
import { useRequireSignIn } from "@/components/SignInGate";
import { useSignedIn } from "@/lib/use-signed-in";

// The same rule as SavePlaceButtons: a route belongs to an account.
//
// Signed out, this used to write to the browser and then send the whole route
// to an endpoint that answered 401 — so the button said "Added to My Route"
// while nothing was kept anywhere it could be got back from.

const routeKey = "whiteGloveMyRoute";

function readRoute() {
  try {
    return JSON.parse(localStorage.getItem(routeKey) || "[]") as SavedPlace[];
  } catch {
    return [];
  }
}

export default function SaveTripItemButton({ item, label = "Add to Route" }: { item: SavedPlace; label?: string }) {
  const signedIn = useSignedIn();
  const requireSignIn = useRequireSignIn();
  const [saved, setSaved] = useState(() => typeof window !== "undefined" && readRoute().some((place) => place.id === item.id));
  const [failed, setFailed] = useState(false);

  async function save() {
    const previous = readRoute();
    const wasSaved = saved;
    const next = wasSaved ? previous.filter((place) => place.id !== item.id) : [...previous, item];
    // Optimistic — show it and write the browser copy at once. If the POST does
    // not confirm, undo both so the button never claims a save the account did
    // not keep, and offer a retry instead of lying about it.
    localStorage.setItem(routeKey, JSON.stringify(next));
    window.dispatchEvent(new Event("whiteglove-route"));
    setSaved(!wasSaved);
    setFailed(false);
    try {
      const res = await fetch("/api/account/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: "route", action: "replace", items: next }),
      });
      if (!res.ok) throw new Error("save failed");
    } catch {
      localStorage.setItem(routeKey, JSON.stringify(previous));
      window.dispatchEvent(new Event("whiteglove-route"));
      setSaved(wasSaved);
      setFailed(true);
    }
  }

  // Still asking — hold the space rather than flash the wrong button.
  if (signedIn === null) return <span className="inline-block h-11 w-[170px]" aria-hidden="true" />;

  return (
    <button
      type="button"
      onClick={() => requireSignIn(save, "Sign in to add to Route")}
      className={`inline-flex min-h-11 items-center border px-4 py-3 text-xs font-bold uppercase tracking-[0.1em] transition ${saved ? "border-[var(--navy)] bg-[var(--navy)] text-white" : "border-[var(--gold)] text-[var(--navy)] hover:bg-[var(--cream-deep)]"}`}
    >
      {failed ? "Didn’t save — try again" : saved ? "Added to Route" : label}
    </button>
  );
}
