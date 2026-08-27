"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { emptyLibraryItem, emptyLibraryPack, itemsInPack, type LibraryItem, type LibraryPack } from "@/data/library";
import { PROPOSAL_COMPONENT_LABEL, type ProposalComponentKind } from "@/data/proposal";
import type { AttractionResult } from "@/lib/attraction-search";

/**
 * A planner's own content library — hotels, activities, tours, contacts,
 * saved once and reused on any trip afterward instead of retyping them.
 *
 * "SEARCH WHITE GLOVE'S OWN LISTINGS" pulls from the same database the
 * kosher site and the itinerary builder's own autofill already read
 * (/api/attractions/search) — a place already in the site's records
 * doesn't need to be typed a second time. Nothing here is REQUIRED to come
 * from that search: a planner's own negotiated hotel rate or a private
 * guide's number is just as welcome, typed by hand.
 */

const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`);
const KIND_OPTIONS: ProposalComponentKind[] = ["hotel", "flight", "transport", "activity", "package", "other"];
const inputCls = "w-full rounded-lg border border-[var(--gold-light)] px-3 py-2 text-sm";
const labelCls = "text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gold-ink)]";
const smallButton =
  "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-[var(--gold-light)] px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:border-[var(--gold)] disabled:opacity-50";

async function uploadPhoto(file: File): Promise<string | null> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
  const res = await fetch("/api/account/proposal/photo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl }),
  });
  const data = (await res.json().catch(() => null)) as { mediaId?: string } | null;
  return res.ok ? (data?.mediaId ?? null) : null;
}

function DestinationSearch({ onPick }: { onPick: (result: AttractionResult) => void }) {
  const [q, setQ] = useState("");
  /**
   * THE ANSWER, AND THE QUESTION IT ANSWERS, kept together.
   *
   * This was two pieces of state — a results array and a `searching` flag —
   * cleared and raised synchronously at the top of an effect, which is the
   * setState the lint rule refuses. Moving those two calls behind the debounce
   * timer would have been the easy fix and the wrong one: results for a query
   * you had already deleted would linger for 300ms, under whatever you typed
   * next.
   *
   * Storing WHICH query the rows belong to makes both derivable, and makes
   * them more correct than they were. Rows are shown only when they answer
   * what is in the box right now — so stale rows cannot appear under a new
   * query even for a frame — and "Searching…" is simply the state of not yet
   * having the answer to it, rather than a flag something has to remember to
   * lower.
   */
  const [answered, setAnswered] = useState<{ query: string; rows: AttractionResult[] }>({ query: "", rows: [] });
  const trimmed = q.trim();
  const tooShort = trimmed.length < 2;
  const results = !tooShort && answered.query === trimmed ? answered.rows : [];
  const searching = !tooShort && answered.query !== trimmed;

  useEffect(() => {
    // Nothing runs here synchronously any more: the short-query case simply
    // has no effect to run, because it is answered by `results` above.
    if (tooShort) return;
    let live = true;
    const t = window.setTimeout(() => {
      fetch(`/api/attractions/search?q=${encodeURIComponent(trimmed)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => live && setAnswered({ query: trimmed, rows: Array.isArray(d?.results) ? d.results : [] }))
        // A failed lookup answers the query with nothing, rather than leaving
        // "Searching…" on screen for ever with no way to clear it.
        .catch(() => live && setAnswered({ query: trimmed, rows: [] }));
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [trimmed, tooShort]);

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search White Glove's own listings — a shul, a kosher eatery, an attraction…"
        className={inputCls}
      />
      {searching && <p className="mt-1 text-xs text-stone-400">Searching…</p>}
      {results.length > 0 && (
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-[var(--gold-light)] bg-white p-1.5">
          {results.map((r) => (
            <li key={r.slug}>
              <button
                type="button"
                onClick={() => onPick(r)}
                className="w-full rounded-md px-2.5 py-2 text-left text-sm hover:bg-[var(--cream-deep)]"
              >
                <span className="font-semibold text-[var(--navy)]">{r.name}</span>{" "}
                <span className="text-stone-400">· {r.kind} · {r.city}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemEditor({ item, onSave, onCancel }: { item: LibraryItem; onSave: (item: LibraryItem) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(item);
  const [uploading, setUploading] = useState(false);
  const [showSearch, setShowSearch] = useState(!item.name);

  return (
    <div className="rounded-2xl border border-[var(--gold-light)] bg-white p-5">
      {showSearch && (
        <div className="mb-4 border-b border-[var(--gold-light)] pb-4">
          <DestinationSearch
            onPick={(r) => {
              setDraft({
                ...draft,
                name: r.name,
                kind: r.kind.toLowerCase().includes("hotel") ? "hotel" : r.kind.toLowerCase().includes("eat") ? "activity" : "activity",
                description: r.summary,
                address: r.address,
                destination: r.city,
                sourceSlug: r.slug,
              });
              setShowSearch(false);
            }}
          />
          <button type="button" onClick={() => setShowSearch(false)} className="mt-2 text-xs font-semibold text-stone-500 underline">
            Or start blank instead
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as ProposalComponentKind })} className="rounded-md border border-[var(--gold-light)] px-2 py-1.5 text-xs">
          {KIND_OPTIONS.map((k) => (
            <option key={k} value={k}>{PROPOSAL_COMPONENT_LABEL[k]}</option>
          ))}
        </select>
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name" className={`${inputCls} flex-1`} />
        {!showSearch && (
          <button type="button" onClick={() => setShowSearch(true)} className={smallButton}>
            <Icon name="search" className="h-3.5 w-3.5" /> Search listings
          </button>
        )}
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input value={draft.destination ?? ""} onChange={(e) => setDraft({ ...draft, destination: e.target.value })} placeholder="Destination — e.g. Rome" className={inputCls} />
        <input value={draft.address ?? ""} onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder="Address" className={inputCls} />
        <input value={draft.phone ?? ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="Phone" className={inputCls} />
        <input type="number" value={draft.price ?? ""} onChange={(e) => setDraft({ ...draft, price: e.target.value ? Number(e.target.value) : undefined })} placeholder="Typical price" className={inputCls} />
      </div>
      <textarea value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="A line to reuse in a proposal" rows={2} className={`${inputCls} mt-2`} />

      <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs text-stone-500">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          disabled={uploading}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setUploading(true);
            const mediaId = await uploadPhoto(file);
            setUploading(false);
            if (mediaId) setDraft({ ...draft, photoMediaId: mediaId });
          }}
        />
        <Icon name="camera" className="h-4 w-4" /> {uploading ? "Uploading…" : draft.photoMediaId ? "Change photo" : "Add a photo"}
      </label>

      <div className="mt-4 flex gap-2">
        <button type="button" disabled={!draft.name.trim()} onClick={() => onSave(draft)} className="inline-flex min-h-10 items-center rounded-full bg-[var(--navy)] px-4 text-xs font-bold uppercase tracking-[0.1em] text-white disabled:opacity-50">
          Save to library
        </button>
        <button type="button" onClick={onCancel} className="inline-flex min-h-10 items-center rounded-full border border-[var(--gold-light)] px-4 text-xs font-bold uppercase tracking-[0.1em] text-[var(--navy)]">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function LibraryManager() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [packs, setPacks] = useState<LibraryPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<LibraryItem | null>(null);
  const [newPackName, setNewPackName] = useState("");
  const [expandedPack, setExpandedPack] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/account/library", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { items?: LibraryItem[]; packs?: LibraryPack[]; error?: string } | null;
      if (!res.ok || !data) {
        setError(data?.error ?? "Could not load your library.");
        return;
      }
      setItems(data.items ?? []);
      setPacks(data.packs ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  // Async wrapper rather than a bare call from the effect body: a bare call
  // enters it synchronously, which the rule counts as a setState during the
  // effect. Same shape the rest of this repo uses.
  useEffect(() => {
    let active = true;
    void (async () => {
      if (active) await load();
    })();
    return () => {
      active = false;
    };
  }, [load]);

  async function post(body: Record<string, unknown>) {
    setError("");
    const res = await fetch("/api/account/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; items?: LibraryItem[]; packs?: LibraryPack[]; error?: string } | null;
    if (!res.ok || !data?.ok) {
      setError(data?.error ?? "That didn't go through.");
      return false;
    }
    setItems(data.items ?? []);
    setPacks(data.packs ?? []);
    return true;
  }

  async function saveItem(item: LibraryItem) {
    const withId = { ...item, id: item.id || uid() };
    if (await post({ action: "save-item", item: withId })) setEditing(null);
  }

  const grouped = new Map<string, LibraryItem[]>();
  for (const item of items) {
    const key = item.destination?.trim() || "Not filed under a destination";
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Saved content</h2>
          {!editing && (
            <button type="button" onClick={() => setEditing(emptyLibraryItem())} className={smallButton}>
              + Add an item
            </button>
          )}
        </div>

        {editing && <div className="mt-4"><ItemEditor item={editing} onSave={(i) => void saveItem(i)} onCancel={() => setEditing(null)} /></div>}

        {items.length === 0 && !editing && <p className="mt-4 text-sm text-stone-500">Nothing saved yet — hotels, activities and contacts you add here are ready to drop into any proposal.</p>}

        <div className="mt-4 space-y-6">
          {[...grouped.entries()].map(([destination, group]) => (
            <div key={destination}>
              <p className={labelCls}>{destination}</p>
              <div className="mt-2 space-y-2">
                {group.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 rounded-lg border border-[var(--gold-light)] bg-white p-3">
                    {item.photoMediaId && (
                      // eslint-disable-next-line @next/next/no-img-element -- a planner-uploaded thumbnail
                      <img src={`/api/media?id=${encodeURIComponent(item.photoMediaId)}`} alt="" className="h-10 w-10 flex-none rounded-md object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--navy)]">
                        {item.name} <span className="font-normal text-stone-400">· {PROPOSAL_COMPONENT_LABEL[item.kind]}</span>
                      </p>
                      {item.description && <p className="truncate text-xs text-stone-500">{item.description}</p>}
                    </div>
                    <button type="button" onClick={() => setEditing(item)} className="flex-none text-stone-400 hover:text-[var(--navy)]" aria-label="Edit">
                      <Icon name="pencil" className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => window.confirm(`Remove "${item.name}" from your library?`) && void post({ action: "delete-item", id: item.id })}
                      className="flex-none text-stone-400 hover:text-red-700"
                      aria-label="Delete"
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-[var(--gold-light)] pt-6">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Destination packs</h2>
        <p className="mt-1 text-sm text-stone-600">A named group of saved items — &ldquo;Rome Family Trip&rdquo; — added to a proposal all at once.</p>

        <div className="mt-4 flex gap-2">
          <input value={newPackName} onChange={(e) => setNewPackName(e.target.value)} placeholder="Pack name — e.g. Rome Family Trip" className={inputCls} />
          <button
            type="button"
            disabled={!newPackName.trim()}
            onClick={async () => {
              if (await post({ action: "save-pack", pack: { ...emptyLibraryPack(newPackName.trim()), id: uid() } })) setNewPackName("");
            }}
            className={smallButton}
          >
            + New pack
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {packs.map((pack) => {
            const packItems = itemsInPack(pack, items);
            const open = expandedPack === pack.id;
            return (
              <div key={pack.id} className="rounded-xl border border-[var(--gold-light)] bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <button type="button" onClick={() => setExpandedPack(open ? null : pack.id)} className="text-left">
                    <p className="font-semibold text-[var(--navy)]">{pack.name}</p>
                    <p className="text-xs text-stone-500">{packItems.length} item{packItems.length === 1 ? "" : "s"}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => window.confirm(`Delete the pack "${pack.name}"? The items in it stay in your library.`) && void post({ action: "delete-pack", id: pack.id })}
                    className="flex-none text-stone-400 hover:text-red-700"
                    aria-label="Delete pack"
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </div>
                {open && (
                  <div className="mt-3 space-y-1.5 border-t border-[var(--gold-light)] pt-3">
                    {items.map((item) => {
                      const inPack = pack.itemIds.includes(item.id);
                      return (
                        <label key={item.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={inPack}
                            onChange={() =>
                              void post({
                                action: "save-pack",
                                pack: { ...pack, itemIds: inPack ? pack.itemIds.filter((id) => id !== item.id) : [...pack.itemIds, item.id] },
                              })
                            }
                          />
                          {item.name}
                        </label>
                      );
                    })}
                    {items.length === 0 && <p className="text-xs text-stone-500">Add items to your library first.</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {error && <p className="text-xs font-semibold text-red-700">{error}</p>}
    </div>
  );
}
