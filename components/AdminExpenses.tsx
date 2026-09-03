"use client";

import DateField from "@/components/DateField";
import { useEffect, useMemo, useState } from "react";
import type { Expense } from "@/lib/expenses";

type Totals = { byCurrency: Record<string, number>; byCategory: Record<string, number>; byMonth: Record<string, number> };

const inputClass = "mt-1 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2 text-sm text-[var(--navy)] shadow-sm focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const caption = "text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500";

function money(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

const CATEGORIES = ["Flights", "Hotels", "Food", "Transport", "Marketing", "Software", "Fees", "Other"];

export default function AdminExpenses() {
  const [items, setItems] = useState<Expense[]>([]);
  const [totals, setTotals] = useState<Totals>({ byCurrency: {}, byCategory: {}, byMonth: {} });
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [form, setForm] = useState({ date: today, description: "", amount: "", currency: "USD", category: "Other", notes: "" });

  async function load() {
    const res = await fetch("/api/admin/expenses", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (data) {
      setItems(data.items ?? []);
      setTotals(data.totals ?? { byCurrency: {}, byCategory: {}, byMonth: {} });
      setAvailable(data.available !== false);
    }
  }
  // Async wrapper rather than calling load() from the effect body: a bare call
  // enters it synchronously, which the rule counts as a setState during the
  // effect. Same shape the rest of this repo uses.
  useEffect(() => {
    let active = true;
    (async () => {
      if (active) await load();
    })();
    return () => {
      active = false;
    };
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.description.trim() || !form.amount) {
      setError("Add a description and amount.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/admin/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Could not save.");
      return;
    }
    setForm({ date: today, description: "", amount: "", currency: form.currency, category: form.category, notes: "" });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/admin/expenses?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  async function uploadReceipt(id: string, file: File) {
    setError(null);
    if (file.type !== "application/pdf") {
      setError("The receipt must be a PDF file.");
      return;
    }
    if (file.size > 700 * 1024) {
      setError("That PDF is too large (max ~700 KB). Compress it and try again.");
      return;
    }
    const dataUrl: string = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(file);
    }).catch(() => "");
    if (!dataUrl) {
      setError("Could not read that file.");
      return;
    }
    const res = await fetch("/api/admin/expenses/receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: file.name, dataUrl }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not upload the receipt.");
      return;
    }
    load();
  }

  if (!available) {
    return <div className="border border-[var(--gold-light)] bg-[#FAF8F3] p-6 text-sm text-stone-600">The private store isn&apos;t connected, so expenses can&apos;t be saved yet.</div>;
  }

  return (
    <div>
      {/* Totals */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="border border-[var(--gold-light)] bg-[var(--cream-deep)] p-5">
          <p className={caption}>Total spent</p>
          {Object.keys(totals.byCurrency).length === 0 ? <p className="mt-2 text-2xl text-stone-400">—</p> : Object.entries(totals.byCurrency).map(([cur, cents]) => <p key={cur} className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">{money(cents, cur)}</p>)}
        </div>
        <div className="border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
          <p className={caption}>By category</p>
          <ul className="mt-2 space-y-1 text-sm text-stone-700">
            {Object.entries(totals.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([cat, cents]) => <li key={cat} className="flex justify-between gap-3"><span>{cat}</span><span className="font-semibold text-[var(--navy)]">{money(cents, Object.keys(totals.byCurrency)[0] || "USD")}</span></li>)}
            {Object.keys(totals.byCategory).length === 0 && <li className="text-stone-400">No expenses yet.</li>}
          </ul>
        </div>
        <div className="border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
          <p className={caption}>By month</p>
          <ul className="mt-2 space-y-1 text-sm text-stone-700">
            {Object.entries(totals.byMonth).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6).map(([m, cents]) => <li key={m} className="flex justify-between gap-3"><span>{m}</span><span className="font-semibold text-[var(--navy)]">{money(cents, Object.keys(totals.byCurrency)[0] || "USD")}</span></li>)}
            {Object.keys(totals.byMonth).length === 0 && <li className="text-stone-400">No expenses yet.</li>}
          </ul>
        </div>
      </div>

      {/* Add form */}
      <form onSubmit={add} className="mt-6 border border-[var(--gold-light)] bg-[#FAF8F3] p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">Add an expense</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block"><span className={caption}>Date</span><DateField value={form.date} onChange={(v) => setForm({ ...form, date: v })} className={inputClass} ariaLabel="Date" /></label>
          <label className="block lg:col-span-2"><span className={caption}>Description *</span><input required className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What was it for?" /></label>
          <label className="block"><span className={caption}>Amount *</span><input type="number" required step="0.01" min="0" className={inputClass} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
          <label className="block"><span className={caption}>Currency</span><input className={inputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={6} /></label>
          <label className="block"><span className={caption}>Category</span><select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
          <label className="block lg:col-span-2"><span className={caption}>Notes</span><input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        </div>
        <div className="mt-4 flex items-center gap-4">
          <button type="submit" disabled={busy} className="border border-[var(--navy)] bg-[var(--navy)] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] hover:border-[var(--gold)] disabled:opacity-60">{busy ? "Saving…" : "Add expense"}</button>
          {error && <span className="text-sm font-semibold text-red-700">{error}</span>}
        </div>
      </form>

      {/* List */}
      <div className="mt-6 overflow-x-auto border border-[var(--gold-light)] bg-[#FAF8F3]">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-[var(--gold-light)] text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">
            <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Category</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Receipt</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-[var(--gold-light)]">
            {items.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-stone-400">No expenses yet — add your first above.</td></tr>
            ) : items.map((e) => (
              <tr key={e.id} className="text-stone-700">
                <td className="px-4 py-3 whitespace-nowrap">{e.date}</td>
                <td className="px-4 py-3"><span className="font-semibold text-[var(--navy)]">{e.description}</span>{e.notes ? <span className="block text-xs text-stone-500">{e.notes}</span> : null}</td>
                <td className="px-4 py-3 whitespace-nowrap text-xs">{e.category}</td>
                <td className="px-4 py-3 whitespace-nowrap text-right font-semibold text-[var(--navy)]">{money(e.amountCents, e.currency)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-xs">
                  {e.receiptName ? (
                    <a href={`/api/admin/expenses/receipt?id=${encodeURIComponent(e.id)}`} target="_blank" rel="noreferrer" className="text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2" title={e.receiptName}>📄 View</a>
                  ) : (
                    <label className="cursor-pointer text-stone-500 underline decoration-dotted underline-offset-2 hover:text-[var(--navy)]">
                      Add PDF
                      <input type="file" accept="application/pdf" className="hidden" onChange={(ev) => { const file = ev.target.files?.[0]; if (file) void uploadReceipt(e.id, file); ev.target.value = ""; }} />
                    </label>
                  )}
                </td>
                <td className="px-4 py-3 text-right"><button type="button" onClick={() => remove(e.id)} className="text-xs text-stone-400 hover:text-red-700">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
