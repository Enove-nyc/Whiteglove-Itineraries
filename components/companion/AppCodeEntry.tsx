"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * A client's way into the app: the per-trip code their travel advisor sent them.
 *
 * The code is the trip's share token. Entering it opens that one trip as the app
 * at /i/<code>/app — no account, no other trip reachable. An unknown code lands
 * on the shared-trip page's own "not available" notice rather than an error, so
 * this can navigate optimistically without a round-trip to check first.
 */
export default function AppCodeEntry() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  function open(event: React.FormEvent) {
    event.preventDefault();
    const value = code.trim();
    if (!value) return;
    setBusy(true);
    router.push(`/i/${encodeURIComponent(value)}/app`);
  }

  return (
    <form onSubmit={open} className="flex flex-wrap items-center gap-2">
      <label htmlFor="app-code" className="sr-only">
        Code from your travel advisor
      </label>
      <input
        id="app-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="Enter your code"
        className="min-w-0 flex-1 rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm font-semibold tracking-[0.14em] text-[var(--navy)] outline-none focus:border-[var(--gold)]"
      />
      <button
        type="submit"
        disabled={busy || !code.trim()}
        className="inline-flex min-h-11 items-center rounded-md border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)] disabled:opacity-50"
      >
        {busy ? "Opening…" : "Open my trip"}
      </button>
    </form>
  );
}
