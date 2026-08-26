"use client";

import { useState } from "react";
import {
  fieldLabel,
  fieldIsSensitive,
  missingRequiredFields,
  type ClientFormTemplate,
} from "@/data/client-form";

/**
 * A traveler's own side of a pre-trip form — no account, just the link the
 * planner sent. One submission per visit; nothing here can see what anyone
 * else already answered.
 */
export default function ClientFormFill({ shareId, template }: { shareId: string; template: ClientFormTemplate }) {
  const [name, setName] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const missing = name.trim() ? missingRequiredFields(template, answers) : [];

  async function submit() {
    if (!name.trim()) {
      setError("Say whose answers these are.");
      return;
    }
    if (missing.length > 0) {
      setError(`Still needed: ${missing.join(", ")}`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/client-form/${encodeURIComponent(shareId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respondentName: name, answers }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "That didn't go through. Try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mt-6 rounded-2xl border border-emerald-300 bg-emerald-50 p-6 text-emerald-900">
        <p className="font-semibold">Sent — thank you.</p>
        <p className="mt-1 text-sm">Your advisor has what they need. You can close this page.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      <div>
        <label className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--gold-ink)]" htmlFor="respondent-name">
          Your name
        </label>
        <input
          id="respondent-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[var(--gold-light)] px-3 py-2.5 text-sm"
          placeholder="So your advisor knows whose answers these are"
        />
      </div>

      {template.fields.map((field) => (
        <div key={field.id}>
          <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.1em] text-[var(--gold-ink)]" htmlFor={`f-${field.id}`}>
            {fieldLabel(field)}
            {field.required && <span className="text-red-600">*</span>}
            {fieldIsSensitive(field) && <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-stone-500">private — seen only by your advisor</span>}
          </label>
          <input
            id={`f-${field.id}`}
            value={answers[field.id] ?? ""}
            onChange={(e) => setAnswers({ ...answers, [field.id]: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[var(--gold-light)] px-3 py-2.5 text-sm"
          />
        </div>
      ))}

      {error && <p className="text-xs font-semibold text-red-700">{error}</p>}

      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="inline-flex min-h-11 items-center rounded-full bg-[var(--navy)] px-6 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {busy ? "Sending…" : "Send"}
      </button>
    </div>
  );
}
