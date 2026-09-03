"use client";

import { useState } from "react";
import type { SignInEntry } from "@/lib/signin-log";

// Who has been in, and from where.
//
// One line per entry, newest first. The address is deliberately incomplete —
// enough to tell one visitor from another, not enough to be a record of
// somebody's connection.

const HOW_TONE: Record<SignInEntry["how"], string> = {
  "full code": "border-[var(--gold)] text-[var(--navy)]",
  "five-minute code": "border-amber-400 text-amber-800",
  "admin code": "border-[var(--navy)] text-[var(--navy)]",
  // A named administrator, so the line carries an email rather than nothing.
  "admin account": "border-emerald-500 text-emerald-800",
  account: "border-stone-300 text-stone-600",
  // The same account as a password sign-in; only the way in was different.
  google: "border-sky-400 text-sky-800",
  invited: "border-emerald-400 text-emerald-800",
};

function place(entry: SignInEntry) {
  const where = [entry.city, entry.region, entry.country].filter(Boolean).join(", ");
  return where || "Location not reported";
}

export default function AccessLog({ entries, available }: { entries: SignInEntry[]; available: boolean }) {
  const [rows, setRows] = useState(entries);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(action: "revoke-all" | "clear-log") {
    setBusy(action);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/access-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage({ ok: false, text: data?.error ?? "That did not work." });
        return;
      }
      setMessage({ ok: true, text: data?.message ?? "Done." });
      if (action === "clear-log") setRows([]);
    } catch {
      setMessage({ ok: false, text: "Could not reach the server." });
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="border border-[var(--gold-light)] bg-[#FAF8F3] p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-[var(--gold-ink)]">Who has been in</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Recent sign-ins</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={Boolean(busy) || !available}
            onClick={() => {
              if (confirm("Sign everybody out? Every code already handed out stops working, and anyone still using the site will have to enter one again. This does not affect you.")) {
                void send("revoke-all");
              }
            }}
            className="min-h-[40px] border border-red-300 px-4 text-[11px] font-bold uppercase tracking-[0.1em] text-red-700 transition hover:border-red-500 hover:bg-red-50 disabled:opacity-50"
          >
            Sign everybody out
          </button>
          <button
            type="button"
            disabled={Boolean(busy) || !available || rows.length === 0}
            onClick={() => void send("clear-log")}
            className="min-h-[40px] border border-[var(--gold-light)] px-4 text-[11px] font-bold uppercase tracking-[0.1em] text-stone-600 transition hover:border-[var(--gold)] disabled:opacity-50"
          >
            Empty the log
          </button>
        </div>
      </div>

      <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
        Every time somebody gets in — with a code, or by signing in to an account you let in by name. The address is
        kept without its last part on purpose: enough to tell visitors apart, not a record of anybody&apos;s connection.
      </p>

      {message && (
        <p className={`mt-3 text-sm font-semibold ${message.ok ? "text-emerald-700" : "text-red-700"}`}>{message.text}</p>
      )}

      {!available ? (
        <p className="mt-5 border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          Keeping a log needs the private store connected (UPSTASH_REDIS_REST_URL and _TOKEN). Until then nothing is
          recorded — which is why this is empty rather than because nobody has visited.
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-5 text-sm text-stone-600">Nobody has signed in yet.</p>
      ) : (
        <ul className="mt-5 divide-y divide-[var(--gold-light)] border-t border-[var(--gold-light)]">
          {rows.map((entry, index) => (
            <li key={`${entry.at}-${index}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
              <div className="min-w-0">
                <p className="font-semibold text-[var(--navy)]">
                  {place(entry)}
                  {entry.email && <span className="ml-2 text-sm font-normal text-stone-500">{entry.email}</span>}
                </p>
                <p className="text-xs text-stone-500">
                  {[new Date(entry.at).toLocaleString(), entry.device, entry.ip].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className={`shrink-0 border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${HOW_TONE[entry.how] ?? "border-stone-300 text-stone-600"}`}>
                {entry.how}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
