"use client";

import { useEffect, useState } from "react";
import type { ActivityEntry } from "@/data/trip-activity";
import { EmptyState } from "@/components/ui/EmptyState";

const KIND_ICON: Record<ActivityEntry["kind"], string> = {
  proposal_sent: "📨",
  proposal_approved: "✅",
  proposal_changes_requested: "✏️",
  // This product has a kind the kosher copy does not: a client answering a
  // form on their own trip. Ported code has to grow the case, not drop it.
  form_submitted: "Form completed",
  payment_received: "💳",
  addon_accepted: "➕",
  addon_declined: "➖",
  stage_changed: "📋",
};

function when(at: string): string {
  try {
    return new Date(at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return at;
  }
}

/**
 * A trip's own activity feed — what actually happened, most recent first.
 * Read-only: every entry here was logged automatically at the moment the
 * action happened (see lib/account-store.ts), never typed in by hand.
 */
export default function TripActivityFeed() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/account/activity?trip=current", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok) setError(data?.error || "Could not load this trip's activity.");
        else setEntries(Array.isArray(data?.entries) ? data.entries : []);
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

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;
  if (error) return <p className="text-sm font-semibold text-red-700">{error}</p>;
  if (entries.length === 0) {
    return <EmptyState title="Nothing yet" description="A proposal sent, a payment received, an add-on answered — it shows up here as it happens." />;
  }

  return (
    <ul className="flex flex-col gap-2">
      {entries.map((e) => (
        <li key={e.id} className="flex items-start gap-3 rounded-xl border border-[var(--gold-light)] bg-white p-3 text-sm">
          <span className="text-lg leading-none">{KIND_ICON[e.kind] ?? "•"}</span>
          <div>
            <p className="text-[var(--navy)]">{e.message}</p>
            <p className="mt-0.5 text-xs text-stone-500">{when(e.at)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
