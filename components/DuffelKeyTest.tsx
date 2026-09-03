"use client";

import { useState } from "react";

// Is the flight search actually working?
//
// Built after "Duffel could not complete this flight search right now" appeared
// on the booking page with nothing behind it. That message covered a wrong
// token, an account still in test mode, and Duffel being down, and there was no
// screen anywhere that could tell them apart.
//
// Deliberately not run automatically on page load, unlike the Routes check: a
// flight search takes real seconds and counts against the account.

type Result = {
  keySet?: boolean;
  ok?: boolean;
  mode?: string;
  status?: number;
  offers?: number;
  cheapest?: string | null;
  route?: string;
  error?: string;
  advice?: string;
  warning?: string;
};

const code = "rounded bg-[var(--cream)] px-1 font-mono text-[12px]";

export default function DuffelKeyTest() {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/duffel-test", { cache: "no-store" });
      setResult(await res.json());
    } catch {
      setResult({ ok: false, error: "Could not reach the server." });
    } finally {
      setBusy(false);
    }
  }

  // A test token works but sells nothing, so it is neither green nor red.
  const tone = !result
    ? "border-[var(--gold)] bg-[#FAF8F3]"
    : result.ok && result.mode === "live"
      ? "border-emerald-400 bg-emerald-50 text-emerald-900"
      : result.ok
        ? "border-amber-400 bg-amber-50 text-amber-900"
        : "border-amber-400 bg-amber-50 text-amber-900";

  return (
    <section className="border border-[var(--gold-light)] bg-[#FAF8F3] p-6">
      <p className="text-xs font-bold uppercase tracking-[0.17em] text-[var(--gold-ink)]">Flight search</p>
      <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Is the Duffel token working?</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
        This runs a real search — London to New York, three weeks out, both as whole cities — and shows exactly what
        Duffel said. It also reports whether the token is a <strong>test</strong> one, which returns invented flights
        that look real on the admin search and cannot be ticketed. Visitors never see this; public /book uses partner
        links.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="min-h-[44px] border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] hover:border-[var(--gold)] disabled:opacity-60"
        >
          {busy ? "Searching… (up to 25 seconds)" : "Run a real search"}
        </button>
      </div>

      {result && (
        <div className={`mt-5 border-l-4 px-4 py-3 text-sm leading-6 ${tone}`}>
          {result.ok ? (
            <>
              <strong>{result.mode === "test" ? "Working, but in test mode." : "Working."}</strong>{" "}
              {result.route} returned <strong>{result.offers}</strong> offer{result.offers === 1 ? "" : "s"}
              {result.cheapest ? `, from ${result.cheapest}` : ""}.
              {result.advice ? <p className="mt-2">{result.advice}</p> : null}
            </>
          ) : (
            <>
              <strong>{result.keySet === false ? "No token set." : "Not working."}</strong>
              {result.status ? ` Duffel returned HTTP ${result.status}.` : ""}
              {result.error ? <p className="mt-2">{result.error}</p> : null}
              {result.advice ? <p className="mt-2">{result.advice}</p> : null}
            </>
          )}
        </div>
      )}

      <p className="mt-4 text-xs leading-5 text-stone-500">
        The variable is <code className={code}>DUFFEL_ACCESS_TOKEN</code>, set in Vercel under Settings → Environment
        Variables. Duffel issues a separate token for test and for live; environment variables are read when the site
        builds, so a new token does nothing until you redeploy. Get a real token from the Duffel dashboard — a
        placeholder will not search.
      </p>
    </section>
  );
}
