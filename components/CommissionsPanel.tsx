"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  emptyCommissionRecord,
  expectedCommissionCents,
  formatCommissionCents,
  outstandingCommissionCents,
  receivedCommissionCents,
  supplierCostCents,
  tripRevenueCents,
  type CommissionRecord,
} from "@/data/trip-commission";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

type Summary = { tripId: string; tripName: string; client: string; records: CommissionRecord[] };

/**
 * The agency-wide view: one row per trip that has at least one commission
 * record, with the whole agency's expected/received/outstanding underneath.
 * A trip with three supplier bookings is one row here, same as the pipeline.
 */
export default function CommissionsPanel() {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/account/commissions", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok) setError(data?.error || "Could not load commissions.");
        else setSummaries(Array.isArray(data?.summaries) ? data.summaries : []);
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
  if (summaries.length === 0) {
    return (
      <EmptyState
        title="No commission records yet"
        description="Log a supplier booking from a trip's Payments page to start tracking what the agency is owed."
      />
    );
  }

  const allRecords = summaries.flatMap((s) => s.records);
  // Assumes one currency across the agency's commission ledger — summing
  // mismatched currencies as if they were the same money would be wrong,
  // and this codebase has no conversion rates to do it properly. Shown in
  // whichever currency the first record was logged in.
  const agencyCurrency = allRecords[0]?.currency;
  const totals = {
    revenue: tripRevenueCents(allRecords),
    cost: supplierCostCents(allRecords),
    expected: expectedCommissionCents(allRecords),
    received: receivedCommissionCents(allRecords),
    outstanding: outstandingCommissionCents(allRecords),
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: "Trip revenue", value: totals.revenue },
          { label: "Supplier cost", value: totals.cost },
          { label: "Expected commission", value: totals.expected },
          { label: "Received", value: totals.received },
          { label: "Outstanding", value: totals.outstanding },
        ].map((t) => (
          <div key={t.label} className="wg-card border border-[var(--gold-light)] bg-white p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">{t.label}</p>
            <p className="mt-1 text-lg font-semibold text-[var(--navy)]">{formatCommissionCents(t.value, agencyCurrency)}</p>
          </div>
        ))}
      </div>

      <ul className="flex flex-col gap-3">
        {summaries.map((s) => {
          const expected = expectedCommissionCents(s.records);
          const outstanding = outstandingCommissionCents(s.records);
          const currency = s.records[0]?.currency;
          return (
            <li key={s.tripId} className="wg-card flex flex-wrap items-center justify-between gap-3 border border-[var(--gold-light)] bg-white p-4">
              <div>
                <p className="font-semibold text-[var(--navy)]">{s.client || s.tripName}</p>
                {s.client && <p className="text-xs text-stone-500">{s.tripName}</p>}
                <p className="mt-1 text-xs text-stone-500">
                  {s.records.length} supplier {s.records.length === 1 ? "booking" : "bookings"}
                </p>
              </div>
              <div className="flex items-center gap-4 text-right">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">Expected</p>
                  <p className="text-sm font-semibold text-[var(--navy)]">{formatCommissionCents(expected, currency)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">Outstanding</p>
                  <p className={`text-sm font-semibold ${outstanding > 0 ? "text-red-700" : "text-[var(--navy)]"}`}>
                    {formatCommissionCents(outstanding, currency)}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * One trip's own commission ledger — logging what a supplier owes the
 * agency for a booking on this trip. Lives on the trip's Payments page,
 * a separate section from the client balance above it (a different
 * money — see data/trip-commission.ts).
 */
export function TripCommissionEditor() {
  const [tripId, setTripId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [records, setRecords] = useState<CommissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(emptyCommissionRecord());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/account/commissions?trip=current", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok) setError(data?.error || "Could not load commission records.");
        else {
          setTripId(data?.tripId || "");
          setCurrency(data?.currency || "USD");
          setRecords(Array.isArray(data?.records) ? data.records : []);
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

  async function addRecord() {
    if (!draft.supplier.trim() || !tripId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/account/commissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, ...draft }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data?.records)) {
        setRecords(data.records);
        setDraft(emptyCommissionRecord());
      } else {
        setError(data?.error || "Could not save that record.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function removeRecord(id: string) {
    if (!tripId) return;
    const previous = records;
    setRecords((prev) => prev.filter((r) => r.id !== id));
    try {
      const res = await fetch("/api/account/commissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, action: "delete", id }),
      });
      if (!res.ok) {
        setRecords(previous);
        setError("Could not remove that record.");
      }
    } catch {
      setRecords(previous);
      setError("Could not reach the account service.");
    }
  }

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;
  if (!tripId) return <p className="text-sm text-stone-500">Open a trip in the planner first.</p>;

  const expected = expectedCommissionCents(records);
  const outstanding = outstandingCommissionCents(records);

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
      {records.length > 0 && (
        <ul className="flex flex-col gap-2">
          {records.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--gold-light)] bg-white p-3 text-sm">
              <div>
                <p className="font-semibold text-[var(--navy)]">{r.supplier}</p>
                {r.description && <p className="text-xs text-stone-500">{r.description}</p>}
              </div>
              <div className="flex items-center gap-3 text-xs text-stone-600">
                <span>Expected {formatCommissionCents(r.expectedCommissionCents, r.currency)}</span>
                <span>Received {formatCommissionCents(r.receivedCommissionCents, r.currency)}</span>
                <button type="button" onClick={() => removeRecord(r.id)} className="font-semibold text-red-700 underline">
                  Remove
                </button>
              </div>
            </li>
          ))}
          <li className="flex justify-end gap-4 pt-1 text-xs text-stone-600">
            <span>Expected total {formatCommissionCents(expected, records[0]?.currency)}</span>
            <span className={outstanding > 0 ? "font-semibold text-red-700" : ""}>Outstanding {formatCommissionCents(outstanding, records[0]?.currency)}</span>
          </li>
        </ul>
      )}

      <div className="grid gap-3 rounded-xl border border-dashed border-[var(--gold-light)] p-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-stone-600">
          Supplier
          <input
            value={draft.supplier}
            onChange={(e) => setDraft((d) => ({ ...d, supplier: e.target.value }))}
            placeholder="Hotel Bristol"
            className="rounded-lg border border-[var(--gold-light)] px-3 py-2 text-sm text-[var(--navy)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-stone-600">
          Description
          <input
            value={draft.description ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="5 nights, deluxe room"
            className="rounded-lg border border-[var(--gold-light)] px-3 py-2 text-sm text-[var(--navy)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-stone-600">
          {`Trip revenue (${currency})`}
          <input
            type="number"
            min={0}
            value={draft.revenueCents / 100}
            onChange={(e) => setDraft((d) => ({ ...d, revenueCents: Math.round(Number(e.target.value || 0) * 100) }))}
            className="rounded-lg border border-[var(--gold-light)] px-3 py-2 text-sm text-[var(--navy)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-stone-600">
          {`Supplier cost (${currency})`}
          <input
            type="number"
            min={0}
            value={draft.costCents / 100}
            onChange={(e) => setDraft((d) => ({ ...d, costCents: Math.round(Number(e.target.value || 0) * 100) }))}
            className="rounded-lg border border-[var(--gold-light)] px-3 py-2 text-sm text-[var(--navy)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-stone-600">
          {`Expected commission (${currency})`}
          <input
            type="number"
            min={0}
            value={draft.expectedCommissionCents / 100}
            onChange={(e) => setDraft((d) => ({ ...d, expectedCommissionCents: Math.round(Number(e.target.value || 0) * 100) }))}
            className="rounded-lg border border-[var(--gold-light)] px-3 py-2 text-sm text-[var(--navy)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-stone-600">
          {`Received so far (${currency})`}
          <input
            type="number"
            min={0}
            value={draft.receivedCommissionCents / 100}
            onChange={(e) => setDraft((d) => ({ ...d, receivedCommissionCents: Math.round(Number(e.target.value || 0) * 100) }))}
            className="rounded-lg border border-[var(--gold-light)] px-3 py-2 text-sm text-[var(--navy)]"
          />
        </label>
        <div className="sm:col-span-2">
          <Button type="button" onClick={addRecord} disabled={saving || !draft.supplier.trim()}>
            {saving ? "Saving…" : "Add supplier booking"}
          </Button>
        </div>
      </div>

      <p className="text-xs text-stone-500">
        See the whole agency&apos;s commission picture on the <Link href="/commissions" className="underline">Commissions</Link> page.
      </p>
    </div>
  );
}
