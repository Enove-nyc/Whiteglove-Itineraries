"use client";

import { useState } from "react";

// The main sections an owner is most likely to lock. Custom prefixes are also
// supported via the input below.
const KNOWN_SECTIONS: Array<{ path: string; label: string }> = [
  { path: "/stops", label: "Destinations directory" },
  { path: "/destinations", label: "Destination pages" },
  { path: "/cemeteries", label: "Cemeteries" },
  { path: "/book", label: "Book flights, hotels & cars" },
  { path: "/my-route", label: "My Route" },
  { path: "/account", label: "Account" },
];

export default function LockedSectionsControl({
  initialPaths,
  available,
}: {
  initialPaths: string[];
  available: boolean;
}) {
  const [paths, setPaths] = useState<string[]>(initialPaths);
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const has = (p: string) => paths.includes(p);
  const toggle = (p: string) => setPaths((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  function addCustom() {
    let value = custom.trim();
    if (!value) return;
    if (!value.startsWith("/")) value = "/" + value;
    if (!paths.includes(value)) setPaths((prev) => [...prev, value]);
    setCustom("");
  }

  const customPaths = paths.filter((p) => !KNOWN_SECTIONS.some((s) => s.path === p));

  async function save() {
    setSaving(true);
    setMessage(null);
    const response = await fetch("/api/admin/locked-paths", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    });
    const data = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) {
      setMessage({ ok: false, text: data?.error || "Could not save." });
      return;
    }
    if (Array.isArray(data?.paths)) setPaths(data.paths);
    setMessage({ ok: true, text: "Locked sections saved." });
  }

  return (
    <section className="border border-[var(--gold-light)] bg-[#FAF8F3] p-6">
      <p className="text-xs font-bold uppercase tracking-[0.17em] text-[var(--gold-ink)]">Lock sections</p>
      <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Require the access code for parts of the site</h2>
      <p className="mt-3 text-sm leading-6 text-stone-600">
        Locked sections ask visitors for the website access password (set under Passwords) before they can be viewed. The rest of the site stays open.
      </p>

      {!available ? (
        <p className="mt-4 text-sm leading-6 text-stone-600">Connect the private database to lock individual sections.</p>
      ) : (
        <>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {KNOWN_SECTIONS.map((s) => (
              <label key={s.path} className="flex items-center gap-3 border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)]">
                <input type="checkbox" checked={has(s.path)} onChange={() => toggle(s.path)} className="h-4 w-4 accent-[var(--navy)]" />
                <span>{s.label} <span className="text-stone-400">{s.path}</span></span>
              </label>
            ))}
          </div>

          {customPaths.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {customPaths.map((p) => (
                <span key={p} className="inline-flex items-center gap-2 rounded-full bg-[var(--cream-deep)] px-3 py-1 text-xs font-semibold text-[var(--navy)]">
                  {p}
                  <button type="button" onClick={() => toggle(p)} className="text-red-600 hover:text-red-800" aria-label={`Remove ${p}`}>×</button>
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
              placeholder="Custom path e.g. /getaways"
              // A placeholder is not a label — it disappears the moment you
              // type, and a screen reader may never announce it at all. This
              // box only renders once the lock store is reachable, which is
              // why the width audit had not reached it before.
              aria-label="Custom path to lock"
              className="flex-1 rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none"
            />
            <button type="button" onClick={addCustom} className="rounded-md border border-[var(--gold)] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--cream-deep)]">Add path</button>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" onClick={save} disabled={saving} className="rounded-md bg-[var(--navy)] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.13em] text-white transition hover:bg-[var(--gold)] disabled:opacity-50">
              {saving ? "Saving…" : "Save locked sections"}
            </button>
            {message && <span className={`text-sm font-semibold ${message.ok ? "text-emerald-700" : "text-red-700"}`}>{message.text}</span>}
          </div>
        </>
      )}
    </section>
  );
}
