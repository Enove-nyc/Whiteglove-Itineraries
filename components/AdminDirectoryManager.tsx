"use client";

import DateField from "@/components/DateField";
import { useEffect, useState } from "react";
import DirectoryListingFields from "@/components/DirectoryListingFields";
import { FEATURED_REASONS, featuredReasonLabel } from "@/lib/features";
import type { StoredProvider } from "@/lib/directory-store";

const inputClass = "mt-1 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2 text-sm text-[var(--navy)] shadow-sm focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const caption = "text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500";

const CATEGORIES: Array<[StoredProvider["category"], string]> = [
  ["TOUR_OPERATOR", "Tour operator / organizer"],
  ["VACATION_PLANNER", "Vacation planner / concierge"],
  ["TRAVEL_AGENCY", "Travel agency"],
  ["GUIDE_DRIVER", "Tour guide / private driver"],
];
const CAT_LABEL = Object.fromEntries(CATEGORIES) as Record<string, string>;

const EMPTY = {
  id: "", name: "", category: "TOUR_OPERATOR" as StoredProvider["category"], services: "", tagline: "",
  phone: "", whatsapp: "", email: "", website: "", basedIn: "", regions: "", languages: "", specialties: "",
  description: "", notes: "", featured: false, published: true,
  contactConsent: false, contactConsentNote: "", verifiedAt: "", responseTime: "", featuredReason: "",
};

export default function AdminDirectoryManager() {
  const [providers, setProviders] = useState<StoredProvider[]>([]);
  const [available, setAvailable] = useState(true);
  const [form, setForm] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/directory", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (data) { setProviders(data.providers ?? []); setAvailable(data.available !== false); }
  }
  // Async wrapper rather than calling load() from the effect body: a bare call
  // enters it synchronously, which the rule counts as a setState during the
  // effect. Same shape the rest of this repo uses.
  useEffect(() => {
    let active = true;
    (async () => {
      if (active) await load();
    })();
    return () => {
      active = false;
    };
  }, []);

  function edit(p: StoredProvider) {
    setForm({ ...EMPTY, ...p, services: p.services ?? "", tagline: p.tagline ?? "", phone: p.phone ?? "", whatsapp: p.whatsapp ?? "", email: p.email ?? "", website: p.website ?? "", basedIn: p.basedIn ?? "", regions: p.regions ?? "", languages: p.languages ?? "", specialties: p.specialties ?? "", description: p.description ?? "", notes: p.notes ?? "", featured: Boolean(p.featured), published: p.published !== false, contactConsent: Boolean(p.contactConsent), contactConsentNote: p.contactConsentNote ?? "", verifiedAt: p.verifiedAt ?? "", responseTime: p.responseTime ?? "", featuredReason: p.featuredReason ?? "" });
    setMsg(null); setError(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setMsg(null);
    if (!form.name.trim()) { setError("Add a business name."); return; }
    setBusy(true);
    const res = await fetch("/api/admin/directory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error || "Could not save."); return; }
    setMsg(form.id ? "Saved." : "Provider added to the directory.");
    setForm({ ...EMPTY });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/admin/directory?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (form.id === id) setForm({ ...EMPTY });
    load();
  }

  if (!available) {
    return <div className="border border-[var(--gold-light)] bg-[#fcfaf6] p-6 text-sm text-stone-600">The private store isn&apos;t connected, so directory listings can&apos;t be saved yet.</div>;
  }

  return (
    <div>
      <form onSubmit={save} className="border border-[var(--gold-light)] bg-[#fcfaf6] p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">{form.id ? "Edit provider" : "Add a provider"}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {/* The same component the public form uses. One definition of what
              a listing is made of, so a submission arrives as the boxes you
              would have typed and accepting it is one press rather than a
              transcription job. */}
          <div className="sm:col-span-2">
            <DirectoryListingFields
              draft={{
                name: form.name, category: form.category, tagline: form.tagline, description: form.description,
                phone: form.phone, whatsapp: form.whatsapp, email: form.email, website: form.website,
                basedIn: form.basedIn, regions: form.regions, languages: form.languages,
                specialties: form.specialties, responseTime: form.responseTime,
              }}
              onChange={(key, value) => setForm((f) => ({ ...f, [key]: value }))}
              idPrefix="admin-dir"
            />
          </div>
          <label className="block sm:col-span-2"><span className={caption}>Services offered</span><input className={inputClass} value={form.services} onChange={(e) => setForm({ ...form, services: e.target.value })} placeholder="Airport pickup, kever transport, hotel booking, guided tours…" /></label>
          <label className="block sm:col-span-2"><span className={caption}>Private notes (not shown to visitors)</span><input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          <label className="block"><span className={caption}>Date you last checked this listing</span><DateField value={form.verifiedAt} onChange={(v) => setForm({ ...form, verifiedAt: v })} className={inputClass} ariaLabel="Date you last checked this listing" /></label>

          {/* Permission to publish their number. Off unless somebody asked. */}
          <div className="sm:col-span-2 border border-[var(--gold-light)] bg-[#fcfaf6] p-4">
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" className="h-4 w-4" checked={form.contactConsent} onChange={(e) => setForm({ ...form, contactConsent: e.target.checked })} />
              <span className="text-sm font-semibold text-[var(--navy)]">They agreed their phone number may be published</span>
            </label>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              Off unless somebody asked them. Many of these are one person with a mobile, and having been given a
              number is not the same as agreeing it goes on a public page. Left off, the number is kept here and the
              directory says a number is held but not publishable.
            </p>
            <label className="mt-3 block"><span className={caption}>How they gave it</span><input className={inputClass} value={form.contactConsentNote} onChange={(e) => setForm({ ...form, contactConsentNote: e.target.value })} placeholder="asked by phone, 4 March" /></label>
            {form.contactConsent && !form.contactConsentNote.trim() && (
              <p className="mt-2 text-xs font-semibold text-amber-800">Worth writing down how it was given, so the answer to &ldquo;who said we could&rdquo; is not somebody&apos;s memory.</p>
            )}
          </div>

          <div className="sm:col-span-2 border border-[var(--gold-light)] bg-[#fcfaf6] p-4">
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" className="h-4 w-4" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} />
              <span className="text-sm font-semibold text-[var(--navy)]">Featured — shown first in its category</span>
            </label>
            {form.featured && (
              <>
                <label className="mt-3 block">
                  <span className={caption}>Why (your record — visitors are not told which)</span>
                  <select className={inputClass} value={form.featuredReason} onChange={(e) => setForm({ ...form, featuredReason: e.target.value })}>
                    <option value="">Choose one…</option>
                    {FEATURED_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </label>
                {!form.featuredReason && (
                  <p className="mt-2 text-xs font-semibold text-amber-800">
                    Worth recording. The badge is the same either way, so this is the only place it is written down.
                  </p>
                )}
                <p className="mt-2 text-xs leading-5 text-stone-500">
                  The directory tells visitors that some featured listings are sponsored, without naming them.
                </p>
              </>
            )}
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} /><span className="text-sm text-[var(--navy)]">Published (visible on /directory)</span></label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button type="submit" disabled={busy} className="border border-[var(--navy)] bg-[var(--navy)] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] hover:border-[var(--gold)] disabled:opacity-60">{busy ? "Saving…" : form.id ? "Save changes" : "Add provider"}</button>
          {form.id && <button type="button" onClick={() => setForm({ ...EMPTY })} className="border border-[var(--gold-light)] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]">Cancel edit</button>}
          {msg && <span className="text-sm font-semibold text-emerald-700">{msg}</span>}
          {error && <span className="text-sm font-semibold text-red-700">{error}</span>}
        </div>
      </form>

      <div className="mt-6 overflow-x-auto border border-[var(--gold-light)] bg-[#fcfaf6]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-[var(--gold-light)] text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">
            <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-[var(--gold-light)]">
            {providers.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-stone-400">No providers yet — add your first above.</td></tr>
            ) : providers.map((p) => (
              <tr key={p.id} className="text-stone-700">
                <td className="px-4 py-3"><span className="font-semibold text-[var(--navy)]">{p.name}</span>{p.featured ? <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gold-ink)]" title={featuredReasonLabel(p.featuredReason)}>★ Featured — {featuredReasonLabel(p.featuredReason)}</span> : null}{p.basedIn ? <span className="block text-xs text-stone-500">{p.basedIn}</span> : null}</td>
                <td className="px-4 py-3 whitespace-nowrap text-xs">{CAT_LABEL[p.category] ?? p.category}</td>
                <td className="px-4 py-3 text-xs text-stone-600">
                  {[p.phone, p.email].filter(Boolean).join(" · ") || "—"}
                  {/* Whether that number is actually reaching the page. */}
                  {p.phone && (
                    p.contactConsent
                      ? <span className="block text-[11px] text-emerald-700">Published — they agreed{p.contactConsentNote ? ` (${p.contactConsentNote})` : ""}</span>
                      : <span className="block text-[11px] text-amber-800">Held, not published — no permission recorded</span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-xs">{p.published !== false ? <span className="text-emerald-700">Published</span> : <span className="text-stone-400">Hidden</span>}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap"><button type="button" onClick={() => edit(p)} className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">Edit</button><button type="button" onClick={() => remove(p.id)} className="ml-4 text-xs text-stone-400 hover:text-red-700">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
