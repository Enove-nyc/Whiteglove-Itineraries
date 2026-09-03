"use client";

import { useState } from "react";

// The vacation side is on this list because "Report an update" now sits in the
// notice at the top of every page, including a page about a week on a beach.
// A form whose only choices were kevarim, cemeteries and drivers told that
// visitor the same thing the old front page did: this is not for you.
const TYPES = [
  "A kosher restaurant, hotel or shop",
  "A destination detail — kosher food, Shabbos, getting around",
  "A kever / tzadik",
  "A cemetery (beis hachaim)",
  "A tour operator / planner / agency",
  "A guide or driver",
  "Something else / a correction",
];

const inputClass =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] shadow-sm focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const captionClass = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";

export default function SubmitEntryForm() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const type = String(data.get("type") || "").trim();
    const title = String(data.get("title") || "").trim();
    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const details = String(data.get("details") || "").trim();
    const source = String(data.get("source") || "").trim();
    if (!title || !name || !email || !details) {
      setError("Please fill in the name of the entry, your name, your email, and the details.");
      setBusy(false);
      return;
    }
    try {
      const response = await fetch("/api/content/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: "new",
          targetId: "new-entry",
          title,
          name,
          email,
          issue: `New entry: ${type || "unspecified"}`,
          suggestedInfo: details,
          source,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) setError(result?.error || "Could not submit right now. Please try again.");
      else {
        setDone(true);
        form.reset();
      }
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="border border-[var(--gold-light)] bg-[#FAF8F3] p-8">
        <p className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Thank you — we received it.</p>
        <p className="mt-3 text-sm leading-6 text-stone-600">White Glove will review your submission and add it once verified. If we need more detail, we&apos;ll reach out to the email you gave.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="border border-[var(--gold-light)] bg-[#FAF8F3] p-6 sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className={captionClass}>Kind of entry</span>
          <select name="type" className={inputClass} defaultValue={TYPES[0]}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className={captionClass}>Name of the kever / cemetery / business *</span>
          <input name="title" className={inputClass} required />
        </label>
        <label className="block">
          <span className={captionClass}>Your name *</span>
          <input name="name" className={inputClass} required />
        </label>
        <label className="block">
          <span className={captionClass}>Your email *</span>
          <input name="email" type="email" className={inputClass} required />
        </label>
        <label className="block sm:col-span-2">
          <span className={captionClass}>Details *</span>
          <textarea name="details" rows={5} className={inputClass} placeholder="Location/address, who is buried there, contact numbers, access notes, hours — anything you know." required />
        </label>
        <label className="block sm:col-span-2">
          <span className={captionClass}>Source or link (optional)</span>
          <input name="source" className={inputClass} placeholder="A website or where the information comes from" />
        </label>
      </div>
      <div className="mt-5 flex items-center gap-4">
        <button type="submit" disabled={busy} className="border border-[var(--navy)] bg-[var(--navy)] px-6 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] hover:border-[var(--gold)] disabled:opacity-60">
          {busy ? "Sending…" : "Send it in"}
        </button>
        {error && <span className="text-sm font-semibold text-red-700">{error}</span>}
      </div>
      <p className="mt-4 text-[11px] leading-4 text-stone-400">Submissions are reviewed by White Glove before being published. Please don&apos;t submit a phone number you have not confirmed yourself.</p>
    </form>
  );
}
