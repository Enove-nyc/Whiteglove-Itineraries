"use client";

import { useEffect, useState } from "react";
import { ADDON_STATUS_LABEL, emptyAddonItem, formatAddonCents, type AddonItem } from "@/data/trip-addons";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * The planner's own editor: offer an add-on, see what's been accepted or
 * declined, and get the public link a client answers from. Reads and writes
 * whichever trip is currently open, the same "current trip unless named"
 * convention Payments and the Proposal builder already use.
 */
export default function AddonsEditor() {
  const [tripId, setTripId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [items, setItems] = useState<AddonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(emptyAddonItem());
  const [saving, setSaving] = useState(false);
  const [shareId, setShareId] = useState("");
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/account/addons", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok) setError(data?.error || "Could not load add-ons.");
        else {
          setTripId(data?.tripId || "");
          setCurrency(data?.currency || "USD");
          setItems(Array.isArray(data?.items) ? data.items : []);
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

  async function addItem() {
    if (!draft.name.trim() || !tripId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/account/addons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, name: draft.name, description: draft.description, priceCents: draft.priceCents }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data?.items)) {
        setItems(data.items);
        setDraft(emptyAddonItem());
      } else {
        setError(data?.error || "Could not save that add-on.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(id: string) {
    if (!tripId) return;
    const previous = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      const res = await fetch("/api/account/addons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, action: "delete", id }),
      });
      if (!res.ok) {
        setItems(previous);
        setError("Could not remove that add-on.");
      }
    } catch {
      setItems(previous);
      setError("Could not reach the account service.");
    }
  }

  async function copyLink() {
    if (!tripId) return;
    setCopying(true);
    try {
      const res = await fetch("/api/account/addons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, action: "share" }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.shareId) {
        setShareId(data.shareId);
        const url = `${window.location.origin}/a/${data.shareId}`;
        await navigator.clipboard.writeText(url).catch(() => undefined);
      } else {
        setError(data?.error || "Could not create the link.");
      }
    } finally {
      setCopying(false);
    }
  }

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;
  if (!tripId) return <p className="text-sm text-stone-500">Open a trip in the planner first.</p>;

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm font-semibold text-red-700">{error}</p>}

      {items.length === 0 ? (
        <EmptyState title="No add-ons offered yet" description="Offer an extra below, then share the link with your client." />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--gold-light)] bg-white p-3 text-sm">
              <div>
                <p className="font-semibold text-[var(--navy)]">{i.name}</p>
                {i.description && <p className="text-xs text-stone-500">{i.description}</p>}
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-stone-600">{formatAddonCents(i.priceCents, i.currency)}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    i.status === "accepted" ? "bg-emerald-100 text-emerald-800" : i.status === "declined" ? "bg-stone-200 text-stone-600" : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {ADDON_STATUS_LABEL[i.status]}
                </span>
                <button type="button" onClick={() => removeItem(i.id)} className="font-semibold text-red-700 underline">
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 rounded-xl border border-dashed border-[var(--gold-light)] p-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-stone-600">
          Add-on
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Travel insurance"
            className="rounded-lg border border-[var(--gold-light)] px-3 py-2 text-sm text-[var(--navy)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-stone-600">
          {`Price (${currency})`}
          <input
            type="number"
            min={0}
            value={draft.priceCents / 100}
            onChange={(e) => setDraft((d) => ({ ...d, priceCents: Math.round(Number(e.target.value || 0) * 100) }))}
            className="rounded-lg border border-[var(--gold-light)] px-3 py-2 text-sm text-[var(--navy)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-stone-600 sm:col-span-2">
          Description
          <input
            value={draft.description ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="Covers trip cancellation and medical, up to $50,000"
            className="rounded-lg border border-[var(--gold-light)] px-3 py-2 text-sm text-[var(--navy)]"
          />
        </label>
        <div className="sm:col-span-2">
          <Button type="button" onClick={addItem} disabled={saving || !draft.name.trim()}>
            {saving ? "Saving…" : "Offer add-on"}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" variant="secondary" onClick={copyLink} disabled={copying}>
          {copying ? "Creating…" : "Copy client link"}
        </Button>
        {shareId && <span className="text-xs text-stone-500">Link copied.</span>}
      </div>
    </div>
  );
}
