"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { byCategory, type PackingItem, type PackingList } from "@/data/packing-list";
import { PACKING_BASICS } from "@/data/packing-basics";
import { Button } from "@/components/ui/Button";

/**
 * NO GEAR LINKS HERE, AND THAT IS DELIBERATE. The kosher copy of this panel
 * links a line to the travel-gear shelf where one names a product outright.
 * The gear shelf is a settled decision of that product with exactly two homes
 * — its own page and its packing list — and it does not exist on this one. A
 * general travel planner that started hanging affiliate links off a packing
 * list would be doing the thing the owner turned down there: looking like a
 * travel-gear website instead of a planner.
 *
 * TWO LISTS, ONE SCREEN. A visitor with no trip — signed out, or signed in and
 * not started yet — gets the starter list from data/packing-basics.ts, checked
 * off in the browser and kept nowhere. Somebody with a trip in the planner gets
 * the list generated from that trip, saved to their account as they tick it.
 * The rows are drawn by the same code either way, so the page a visitor first
 * meets is the page they keep.
 */
/** The rows, drawn the same way whichever list they came from. */
function Rows({ items, onToggle }: { items: PackingItem[]; onToggle: (id: string, checked: boolean) => void }) {
  return (
    <div className="flex flex-col gap-5">
      {byCategory(items).map((group) => (
        <div key={group.category}>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">{group.category}</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {group.items.map((item) => (
              <li key={item.id}>
                <label className="flex items-center gap-2 text-sm text-[var(--navy)]">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(e) => onToggle(item.id, e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--gold-light)]"
                  />
                  <span className={item.checked ? "text-stone-400 line-through" : ""}>{item.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function PackingListPanel({ signedIn = false }: { signedIn?: boolean }) {
  const [tripId, setTripId] = useState("");
  const [list, setList] = useState<PackingList | null>(null);
  const [stale, setStale] = useState(false);
  // Nothing to load when there is no account to ask.
  const [loading, setLoading] = useState(signedIn);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  /** Ticks on the starter list. Browser-only: there is no account to save to. */
  const [ticked, setTicked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/account/packing?trip=current", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!active) return;
        if (res.status === 404) {
          // No trip yet — not an error, and not something to say out loud.
          // The starter list below is the answer.
        } else if (!res.ok) {
          setError(data?.error || "Could not load the packing list.");
        } else {
          setTripId(data?.tripId || "");
          setList(data?.list ?? null);
          setStale(Boolean(data?.stale));
        }
      } catch {
        if (active) setError("Could not reach the account service.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [signedIn]);

  async function generate() {
    if (!tripId) return;
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/account/packing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, action: "generate" }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.list) {
        setList(data.list);
        setStale(false);
      } else {
        setError(data?.error || "Could not generate a packing list right now.");
      }
    } finally {
      setGenerating(false);
    }
  }

  async function toggle(itemId: string, checked: boolean) {
    if (!list) return;
    setList({ ...list, items: list.items.map((i) => (i.id === itemId ? { ...i, checked } : i)) });
    await fetch("/api/account/packing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tripId, action: "toggle", itemId, checked }),
    }).catch(() => undefined);
  }

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;

  // No trip behind this screen: the starter list, and the way to a tailored one.
  if (!tripId) {
    const items: PackingItem[] = PACKING_BASICS.map((b) => ({ ...b, checked: Boolean(ticked[b.id]) }));
    return (
      <div className="flex flex-col gap-5">
        {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
        <Rows items={items} onToggle={(id, checked) => setTicked((t) => ({ ...t, [id]: checked }))} />
        <p className="text-sm text-stone-600">
          Build a trip in the{" "}
          <Link href="/itinerary" className="font-semibold text-[var(--gold-ink)] underline underline-offset-2">
            itinerary planner
          </Link>{" "}
          and this list is made for it — the countries, the season and what you have planned.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm font-semibold text-red-700">{error}</p>}

      {!list ? (
        <div className="flex flex-col gap-5">
          <Rows items={PACKING_BASICS.map((b) => ({ ...b, checked: Boolean(ticked[b.id]) }))} onToggle={(id, checked) => setTicked((t) => ({ ...t, [id]: checked }))} />
          <div>
            <Button type="button" onClick={generate} disabled={generating}>
              {generating ? "Generating…" : "Make this list for my trip"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {stale && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              This trip has changed since the list was made — regenerate it to catch up.
            </div>
          )}
          <Rows items={list.items} onToggle={(id, checked) => void toggle(id, checked)} />
          <div>
            <Button type="button" variant="secondary" onClick={generate} disabled={generating}>
              {generating ? "Regenerating…" : "Regenerate"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
