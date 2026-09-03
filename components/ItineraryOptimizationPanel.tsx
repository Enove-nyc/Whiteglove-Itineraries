"use client";

import { useEffect, useState } from "react";
import { activeSuggestions, type OptimizationResult } from "@/data/itinerary-optimization";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default function ItineraryOptimizationPanel() {
  const [tripId, setTripId] = useState("");
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/account/optimize?trip=current", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok) {
          setError(data?.error || "Could not load this itinerary's suggestions.");
        } else {
          setTripId(data?.tripId || "");
          setResult(data?.result ?? null);
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
  }, []);

  async function generate() {
    if (!tripId) return;
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/account/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, action: "generate" }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.result) {
        setResult(data.result);
        setStale(false);
      } else {
        setError(data?.error || "Could not review this itinerary right now.");
      }
    } finally {
      setGenerating(false);
    }
  }

  async function dismiss(suggestionId: string) {
    if (!result) return;
    setResult({ ...result, suggestions: result.suggestions.map((s) => (s.id === suggestionId ? { ...s, dismissed: true } : s)) });
    await fetch("/api/account/optimize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tripId, action: "dismiss", suggestionId, dismissed: true }),
    }).catch(() => undefined);
  }

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;
  if (!tripId) return <p className="text-sm text-stone-500">Open a trip in the planner first.</p>;

  const active = result ? activeSuggestions(result) : [];

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm font-semibold text-red-700">{error}</p>}

      {!result ? (
        <EmptyState
          title="No review yet"
          description="Ask the AI to look over this trip's pacing and flow — nothing here changes the itinerary itself."
          action={
            <Button type="button" onClick={generate} disabled={generating}>
              {generating ? "Reviewing…" : "Review this itinerary"}
            </Button>
          }
        />
      ) : (
        <>
          {stale && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              This itinerary has changed since it was last reviewed — review it again to catch up.
            </div>
          )}
          {active.length === 0 ? (
            <p className="text-sm leading-6 text-stone-600">Nothing to flag — this trip&apos;s pacing looks reasonable.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {active.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3 rounded-xl border border-[var(--gold-light)] bg-white p-3 text-sm">
                  <p className="text-[var(--navy)]">{s.message}</p>
                  <button type="button" onClick={() => void dismiss(s.id)} className="whitespace-nowrap text-xs font-semibold text-stone-500 underline">
                    Dismiss
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div>
            <Button type="button" variant="secondary" onClick={generate} disabled={generating}>
              {generating ? "Reviewing…" : "Review again"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
