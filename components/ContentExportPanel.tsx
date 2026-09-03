"use client";

import { useState } from "react";

// Get the whole corpus out of here and keep it somewhere else.
//
// Built because there was no export of any kind. The built-in content is safe —
// it is in the repository on GitHub, versioned, and independent of the hosting.
// Everything added through the admin was in one Postgres database with no copy,
// which for a corpus of researched kevarim is a bad place to leave it.

const code = "rounded bg-[var(--cream)] px-1 font-mono text-[12px]";

export default function ContentExportPanel() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/admin/export", { cache: "no-store" });
      if (!res.ok) {
        setNote(res.status === 401 ? "Please sign in as an administrator again." : "The export could not be built.");
        return;
      }
      const blob = await res.blob();
      // The filename comes from the server so copies are timestamped and never
      // overwrite each other.
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "white-glove-content.json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      setNote(`Saved ${name} — ${(blob.size / 1024 / 1024).toFixed(1)} MB. Put a copy somewhere that is not this website.`);
    } catch {
      setNote("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border border-[var(--gold-light)] bg-[#FAF8F3] p-6">
      <p className="text-xs font-bold uppercase tracking-[0.17em] text-[var(--gold-ink)]">Your data</p>
      <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Take a copy of everything</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
        One file with every beis hachaim, kever, shomer number, thing to do, place to stay and page — the built-in
        content and everything you have added, together. Keep it somewhere with no connection to this website.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={download}
          disabled={busy}
          className="min-h-[44px] border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] hover:border-[var(--gold)] disabled:opacity-60"
        >
          {busy ? "Building the file…" : "Download everything"}
        </button>
        {note && <span className="text-sm font-semibold text-[var(--navy)]">{note}</span>}
      </div>

      <div className="mt-5 border-l-4 border-[var(--gold)] bg-[var(--cream)] px-4 py-3 text-sm leading-6 text-[var(--navy)]">
        <strong>Keep this file private.</strong> It contains the shomer and access phone numbers. It does not contain
        passwords, API keys, visitor accounts or the corrections people have sent in — those are deliberately left out.
      </div>

      <div className="mt-5 text-sm leading-6 text-stone-600">
        <p className="font-semibold text-[var(--navy)]">Where your content lives, so you know what is at risk</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>The repository on GitHub</strong> — every kever, thing to do and place to stay that ships with the
            site, in <code className={code}>data/*.ts</code>. Versioned, and already independent of the hosting. This
            would survive the website being deleted.
          </li>
          <li>
            <strong>The Postgres database</strong> — everything you add or edit in this admin. This is the part that
            existed in only one place, and the part this download is for.
          </li>
          <li>
            <strong>Redis</strong> — sign-ins, sessions, the site lock and the visitor counters. Not content, and not
            exported.
          </li>
        </ul>
      </div>
    </section>
  );
}
