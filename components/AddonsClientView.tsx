"use client";

import { useState } from "react";
import { formatAddonCents, type AddonItem } from "@/data/trip-addons";

/**
 * A client's own side of a trip's add-ons — accept or decline each extra
 * offered on top of the trip. No account: everything here goes through the
 * add-ons' own public link (app/api/addons/[shareId]/route.ts), the same
 * way a proposal already works.
 */
export default function AddonsClientView({ shareId, items: initial }: { shareId: string; items: AddonItem[] }) {
  const [items, setItems] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function answer(id: string, accepted: boolean) {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/addons/${encodeURIComponent(shareId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, accepted }),
      });
      const data = (await res.json().catch(() => null)) as { items?: AddonItem[]; error?: string } | null;
      if (!res.ok || !data?.items) {
        setError(data?.error ?? "That didn't go through. Try again.");
        return;
      }
      setItems(data.items);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return <p className="mt-6 text-sm text-stone-600">No add-ons have been offered on this trip.</p>;
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {error && <p className="text-xs font-semibold text-red-700">{error}</p>}
      {items.map((i) => (
        <div key={i.id} className="rounded-2xl border border-[var(--gold-light)] bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-[family-name:var(--font-display)] text-lg text-[var(--navy)]">{i.name}</h3>
              {i.description && <p className="mt-1 text-sm text-stone-600">{i.description}</p>}
            </div>
            <p className="whitespace-nowrap font-[family-name:var(--font-display)] text-lg text-[var(--navy)]">{formatAddonCents(i.priceCents, i.currency)}</p>
          </div>

          {i.status === "offered" ? (
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                disabled={busyId === i.id}
                onClick={() => void answer(i.id, true)}
                className="inline-flex min-h-11 items-center rounded-full border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:opacity-90 disabled:opacity-60"
              >
                Accept
              </button>
              <button
                type="button"
                disabled={busyId === i.id}
                onClick={() => void answer(i.id, false)}
                className="inline-flex min-h-11 items-center rounded-full border border-[var(--gold-light)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:border-[var(--gold)] disabled:opacity-60"
              >
                Decline
              </button>
            </div>
          ) : (
            <p className={`mt-4 text-sm font-semibold ${i.status === "accepted" ? "text-emerald-700" : "text-stone-500"}`}>
              {i.status === "accepted" ? "Accepted" : "Declined"}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
