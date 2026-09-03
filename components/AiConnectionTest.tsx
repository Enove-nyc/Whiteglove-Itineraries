"use client";

import { useState } from "react";

type Result = { configured?: boolean; ok?: boolean; provider?: string; message?: string; sample?: string; error?: string };

export default function AiConnectionTest() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function test() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/ai-test", { method: "POST" });
      setResult(await res.json());
    } catch {
      setResult({ ok: false, message: "Could not reach the server. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  const tone = result ? (result.ok ? "text-emerald-700" : "text-red-700") : "";

  return (
    <section className="border border-[var(--gold-light)] bg-[#FAF8F3] p-6">
      <p className="text-xs font-bold uppercase tracking-[0.17em] text-[var(--gold-ink)]">AI assistant</p>
      <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Travel-assistant connection</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
        The &ldquo;Ask the assistant&rdquo; box and the itinerary AI suggestions need a key. Add a free{" "}
        <code className="rounded bg-[var(--cream)] px-1">GEMINI_API_KEY</code> (Google AI Studio, no credit card) — or a paid{" "}
        <code className="rounded bg-[var(--cream)] px-1">ANTHROPIC_API_KEY</code> — in your host&apos;s Environment Variables and redeploy. Then test it here.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={test}
          disabled={busy}
          className="border border-[var(--navy)] bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] hover:border-[var(--gold)] disabled:opacity-60"
        >
          {busy ? "Testing…" : "Test AI connection"}
        </button>
        {result && (
          <span className={`text-sm font-semibold ${tone}`}>
            {result.error || result.message}
            {result.provider ? <span className="ml-2 font-normal text-stone-500">({result.provider})</span> : null}
          </span>
        )}
      </div>
    </section>
  );
}
