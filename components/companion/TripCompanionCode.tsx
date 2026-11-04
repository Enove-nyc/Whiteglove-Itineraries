"use client";

import { useState } from "react";

export default function TripCompanionCode({ tripId }: { tripId: string }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  async function open() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/account/companion-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId }), cache: "no-store" });
      const data = await response.json() as { code?: string; error?: string };
      if (!response.ok || !data.code) throw new Error(data.error || "Could not open this trip.");
      setCode(data.code);
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Could not open this trip."); }
    finally { setBusy(false); }
  }
  return <div className="mt-3">
    {!code ? <button type="button" onClick={() => void open()} disabled={busy} className="min-h-11 rounded-xl bg-[#102F35] px-5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Opening…" : "Open the trip companion"}</button> : <>
      <p className="break-all font-mono text-sm font-semibold">{code}</p>
      <p className="mt-2 text-sm leading-6 text-stone-600">This code opens your itinerary and group chat. Share it only with the people on this trip. Personal wallet files stay private on each device.</p>
      <div className="mt-2 flex flex-wrap gap-4"><a href={`/i/${encodeURIComponent(code)}/app`} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Open this trip</a><button type="button" onClick={() => { void navigator.clipboard.writeText(code).then(() => setCopied(true)).catch(() => setError("Select and copy the code shown above.")); }} className="min-h-11 text-sm underline">{copied ? "Copied" : "Copy trip code"}</button></div>
    </>}
    {error ? <p role="alert" className="mt-2 text-sm text-red-800">{error}</p> : null}
  </div>;
}
