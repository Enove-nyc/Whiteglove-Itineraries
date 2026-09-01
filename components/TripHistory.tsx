"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons/Icon";
import type { ActivityEntry, ActivityKind } from "@/data/trip-activity";

/**
 * A trip's own history, read-only — proposal sent, form returned, payment
 * settled, an add-on answered — newest first.
 *
 * NOTHING HAPPENS HERE. Every line was written where the thing itself happened
 * (a proposal going out, a client answering, a charge settling — see
 * lib/account-store.ts); this screen only reads them back, so an advisor can
 * see what has moved on a trip without opening four other screens to piece it
 * together. Which trip is carried in the address (/history?trip=…) when opened
 * from a specific one, exactly as Proposals and Forms do.
 */

const ICON: Record<ActivityKind, IconName> = {
  proposal_sent: "send",
  proposal_approved: "check",
  proposal_changes_requested: "reply",
  form_submitted: "list",
  payment_received: "wallet",
  addon_accepted: "check",
  addon_declined: "close",
  stage_changed: "flag",
};

function whenLabel(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function TripHistory() {
  const [tripName, setTripName] = useState("");
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Read the trip off the URL directly (no useSearchParams, so no Suspense
      // boundary), the same way Proposals and Forms resolve which trip.
      const wanted = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("trip") : null;
      const res = await fetch(`/api/account/trip-activity${wanted ? `?trip=${encodeURIComponent(wanted)}` : ""}`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as
        | { tripId: string; tripName: string; activity: ActivityEntry[]; error?: string }
        | null;
      if (!res.ok || !data) {
        setError(data && "error" in data ? (data.error ?? "Could not load.") : "Could not load.");
        return;
      }
      setTripName(data.tripName);
      setEntries(data.activity ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  // Async wrapper rather than a bare call from the effect body — the same shape
  // the rest of this repo's loaders use.
  useEffect(() => {
    let active = true;
    void (async () => {
      if (active) await load();
    })();
    return () => {
      active = false;
    };
  }, [load]);

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;
  if (error) return <p className="text-sm text-red-700">{error}</p>;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">History for</p>
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{tripName || "This trip"}</h2>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-stone-500">
          Nothing has happened on this trip yet. Sending a proposal, a client answering a form, or a payment coming in
          will all show up here.
        </p>
      ) : (
        <ol className="relative space-y-4 border-l border-[var(--gold-light)] pl-6">
          {entries.map((entry) => (
            <li key={entry.id} className="relative">
              <span className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full border border-[var(--gold-light)] bg-white text-[var(--gold-ink)]">
                <Icon name={ICON[entry.kind]} className="h-3.5 w-3.5" />
              </span>
              <p className="text-sm text-[var(--navy)]">{entry.message}</p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">{whenLabel(entry.at)}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
