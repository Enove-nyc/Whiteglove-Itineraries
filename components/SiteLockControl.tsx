"use client";

import { useState } from "react";

export default function SiteLockControl({ initialLocked, configured }: { initialLocked: boolean; configured: boolean }) {
  const [locked, setLocked] = useState(initialLocked);
  const [message, setMessage] = useState("");
  async function update(next: boolean) {
    if (!configured) { setMessage("Add the private analytics connection first. Then this switch can lock or open the site for everyone."); return; }
    setMessage("Saving...");
    const response = await fetch("/api/admin/site-lock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locked: next }) });
    const data = await response.json().catch(() => null);
    if (!response.ok) { setMessage(data?.error || "The setting could not be saved."); return; }
    setLocked(next); setMessage(next ? "The public site is now password protected." : "The public site is now open.");
  }
  return <div className="border border-[var(--gold-light)] bg-[#FAF8F3] p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.17em] text-[var(--gold-ink)]">Launch control</p><h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Website access</h2><p className="mt-2 text-sm leading-6 text-stone-600">{locked ? "Visitors need your site password before they can enter." : "Visitors can enter the website normally."}</p></div><button type="button" onClick={() => update(!locked)} className={`min-w-32 px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] ${locked ? "bg-[var(--navy)] text-white" : "border border-[var(--gold)] text-[var(--navy)]"}`}>{locked ? "Unlock site" : "Lock site"}</button></div>{message && <p className="mt-4 text-sm text-stone-600">{message}</p>}</div>;
}
