"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { setPlanAction } from "@/app/admin/accounts/actions";
import { ACCOUNT_PLANS, type AccountPlan, PLAN_LABELS } from "@/lib/account-plans";
import type { AdminAccountSummary } from "@/lib/account-store";

const inputClass = "w-full rounded-md border border-[var(--gold-light)] bg-white px-2 py-1.5 text-sm text-[var(--navy)] shadow-sm focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";

function fmtDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";
}

/**
 * Which kind of account this is, and a way to change it.
 *
 * Its own form rather than a field in the row's editor: the row's editor saves
 * a name and a number, and this changes what the account IS. Mixing them would
 * mean fixing somebody's phone number and moving them onto Business in one
 * press, without either being the thing that was meant.
 *
 * Saves on choosing rather than on a second button, because there is exactly
 * one field and nothing to get half-finished.
 */
function PlanCell({ account, plan }: { account: string; plan: AccountPlan }) {
  const [state, act, pending] = useActionState(setPlanAction, null);
  return (
    <form action={act} className="whitespace-nowrap">
      <input type="hidden" name="account" value={account} />
      <select
        name="plan"
        defaultValue={plan}
        disabled={pending}
        aria-label={`Plan for ${account}`}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="min-h-9 rounded-md border border-[var(--gold-light)] bg-white px-2 py-1 text-xs text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none disabled:opacity-50"
      >
        {ACCOUNT_PLANS.map((option) => (
          <option key={option} value={option}>
            {PLAN_LABELS[option]}
          </option>
        ))}
      </select>
      {state && !state.ok && <span className="ml-2 text-[10px] font-semibold text-red-700">{state.message}</span>}
    </form>
  );
}

export default function AdminAccountsTable({ accounts }: { accounts: AdminAccountSummary[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(a: AdminAccountSummary) {
    setEditing(a.email);
    setForm({ name: a.name ?? "", email: a.email, phone: a.phone ?? "" });
    setError(null);
  }

  async function save(originalEmail: string) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: originalEmail, newEmail: form.email, name: form.name, phone: form.phone }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Could not save.");
      return;
    }
    setEditing(null);
    router.refresh();
  }

  return (
    <div className="overflow-x-auto border border-[var(--gold-light)] bg-[#FAF8F3]">
      {error && <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">{error}</p>}
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="border-b border-[var(--gold-light)] text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">
          <tr>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Phone</th>
            <th className="px-4 py-3">Plan</th>
            <th className="px-4 py-3">Joined</th>
            <th className="px-4 py-3">Verified</th>
            <th className="px-4 py-3">Saved</th>
            <th className="px-4 py-3 text-right">Edit</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--gold-light)]">
          {accounts.map((a) =>
            editing === a.email ? (
              <tr key={a.email} className="bg-[var(--cream-deep)] text-stone-700">
                <td className="px-4 py-3"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" /></td>
                <td className="px-4 py-3"><input className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" /></td>
                <td className="px-4 py-3"><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" /></td>
                {/* The plan is its own form below, not part of this one — it
                    is the one field here that changes what the account IS. */}
                <td className="px-4 py-3"><PlanCell account={a.email} plan={a.plan} /></td>
                <td className="px-4 py-3 whitespace-nowrap text-stone-400">{fmtDate(a.createdAt)}</td>
                <td className="px-4 py-3">{a.verifiedAt ? <span className="text-emerald-700">Yes</span> : <span className="text-stone-400">No</span>}</td>
                <td className="px-4 py-3 whitespace-nowrap text-xs text-stone-500">{a.routeCount} route · {a.favoriteCount} fav{a.hasItinerary ? " · itinerary" : ""}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2 whitespace-nowrap">
                    <button type="button" disabled={busy} onClick={() => save(a.email)} className="border border-[var(--navy)] bg-[var(--navy)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white transition hover:bg-[var(--gold)] hover:border-[var(--gold)] disabled:opacity-60">{busy ? "Saving…" : "Save"}</button>
                    <button type="button" disabled={busy} onClick={() => { setEditing(null); setError(null); }} className="border border-[var(--gold-light)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-stone-500">Cancel</button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={a.email} className="text-stone-700">
                <td className="px-4 py-3 font-semibold text-[var(--navy)]">{a.name || "—"}</td>
                <td className="px-4 py-3"><a href={`mailto:${a.email}`} className="underline decoration-[var(--gold)] underline-offset-2">{a.email}</a></td>
                <td className="px-4 py-3">{a.phone ? <a href={`tel:${a.phone.replace(/[^+\d]/g, "")}`} className="underline decoration-[var(--gold-light)] underline-offset-2">{a.phone}</a> : "—"}</td>
                <td className="px-4 py-3"><PlanCell account={a.email} plan={a.plan} /></td>
                <td className="px-4 py-3 whitespace-nowrap">{fmtDate(a.createdAt)}</td>
                <td className="px-4 py-3">{a.verifiedAt ? <span className="text-emerald-700">Yes</span> : <span className="text-stone-400">No</span>}</td>
                <td className="px-4 py-3 whitespace-nowrap text-xs text-stone-500">{a.routeCount} route · {a.favoriteCount} fav{a.hasItinerary ? " · itinerary" : ""}</td>
                <td className="px-4 py-3 text-right"><button type="button" onClick={() => startEdit(a)} className="border border-[var(--gold)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white">Edit</button></td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}
