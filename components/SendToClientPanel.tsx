"use client";

import { type FormEvent, useEffect, useState } from "react";

/**
 * A Business account handing the finished itinerary to the person it is for.
 *
 * IT DRAWS NOTHING AT ALL FOR ANYBODY ELSE. It asks the branding endpoint who
 * this is and renders only for an account that may use it — no locked box, no
 * upgrade prompt. The planner belongs to whoever is using it, and a panel whose
 * only job is to sell something does not belong in the middle of their work.
 *
 * IT SITS BESIDE SHARING RATHER THAN INSIDE IT, because they are two different
 * acts. Sharing adds somebody to a trip so they can open it, comment and see it
 * in their account. This is delivery: the work is done, and the client gets a
 * link to read and print. Nobody is added to anything and the client needs no
 * account of their own.
 */

const inputClass =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-base text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)] sm:text-sm";
const captionClass = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-600";

export default function SendToClientPanel() {
  const [ready, setReady] = useState<{ allowed: boolean; brandName: string } | null>(null);
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");

  useEffect(() => {
    let live = true;
    fetch("/api/account/branding", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!live || !data) return;
        setReady({ allowed: Boolean(data.allowed), brandName: data.print?.name ?? "" });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (!ready?.allowed) return null;

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSent("");
    try {
      const response = await fetch("/api/account/itinerary/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, note }),
      });
      const data = await response.json().catch(() => null);
      setBusy(false);
      if (!response.ok) {
        setError(data?.error || "That could not be sent.");
        return;
      }
      setSent(`Sent to ${data.to}.`);
      setTo("");
      setNote("");
    } catch {
      setBusy(false);
      setError("Could not reach the server.");
    }
  }

  return (
    <section className="rounded-lg border border-[var(--gold-light)] bg-[#FAF8F3] p-4">
      <h3 className="font-[family-name:var(--font-display)] text-lg text-[var(--navy)]">Send it to your client</h3>
      <p className="mt-1.5 text-xs leading-5 text-stone-600">
        {ready.brandName
          ? `They get a link to read and print it, with your name on it. The email comes from ${ready.brandName} and replies come to you.`
          : "Set up your business name on your account page first — the email goes out as you, and it needs a name to go out as."}
      </p>

      {ready.brandName && (
        <form onSubmit={send} className="mt-3 space-y-3">
          <label className="block">
            <span className={captionClass}>Their email</span>
            <input type="email" required value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} disabled={busy} />
          </label>
          <label className="block">
            <span className={captionClass}>A line to go with it (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={600}
              placeholder="Here is everything for next month — let me know if anything needs moving."
              className={inputClass}
              disabled={busy}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 rounded-md bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send the itinerary"}
          </button>
          {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
          {sent && <p className="text-sm font-semibold text-emerald-700">{sent}</p>}
        </form>
      )}
    </section>
  );
}
