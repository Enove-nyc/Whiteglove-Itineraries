"use client";

import { useCallback, useEffect, useState } from "react";
import CopyLinkButton from "@/components/CopyLinkButton";
import { Icon } from "@/components/icons/Icon";
import {
  emptyProposal,
  emptyProposalOption,
  PROPOSAL_COMPONENT_LABEL,
  PROPOSAL_STATUS_LABEL,
  type Proposal,
  type ProposalComponent,
  type ProposalComponentKind,
  type ProposalOption,
} from "@/data/proposal";
import { itemsInPack, libraryItemToProposalComponent, type LibraryItem, type LibraryPack } from "@/data/library";

/**
 * The planner's side of a proposal — one or more options, each with its own
 * hotels, flights, activities, a price and a photo, sent to a client to
 * compare and approve before the trip becomes the real itinerary.
 *
 * OPERATES ON THE OPEN TRIP, the same as the itinerary builder itself —
 * switch trips there (TripSwitcher) and this follows.
 *
 * NOTHING SENDS UNTIL "SEND" IS PRESSED. Draft edits save on their own
 * (Save draft), but a client never sees a word of it until the planner
 * decides it's ready — the same confirm-before-it-goes-out rule the
 * itinerary's own sharing already keeps.
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

function ComponentRow({
  component,
  onChange,
  onRemove,
}: {
  component: ProposalComponent;
  onChange: (next: ProposalComponent) => void;
  onRemove: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  return (
    <div className="rounded-lg border border-[var(--gold-light)] bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={component.kind}
          onChange={(e) => onChange({ ...component, kind: e.target.value as ProposalComponentKind })}
          className="rounded-md border border-[var(--gold-light)] px-2 py-1.5 text-xs"
        >
          {KIND_OPTIONS.map((k) => (
            <option key={k} value={k}>{PROPOSAL_COMPONENT_LABEL[k]}</option>
          ))}
        </select>
        <input
          value={component.name}
          onChange={(e) => onChange({ ...component, name: e.target.value })}
          placeholder="Name — e.g. Hotel Rossi"
          className={`${inputCls} flex-1`}
        />
        <input
          type="number"
          value={component.price ?? ""}
          onChange={(e) => onChange({ ...component, price: e.target.value ? Number(e.target.value) : undefined })}
          placeholder="Price"
          className="w-24 rounded-lg border border-[var(--gold-light)] px-2 py-2 text-sm"
        />
        <button type="button" onClick={onRemove} className="flex-none text-stone-400 hover:text-red-700" aria-label="Remove">
          <Icon name="trash" className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input
          value={component.description ?? ""}
          onChange={(e) => onChange({ ...component, description: e.target.value })}
          placeholder="A line the client reads"
          className={inputCls}
        />
        {component.kind === "flight" ? (
          <div className="flex gap-2">
            <input value={component.from ?? ""} onChange={(e) => onChange({ ...component, from: e.target.value })} placeholder="From" className={inputCls} />
            <input value={component.to ?? ""} onChange={(e) => onChange({ ...component, to: e.target.value })} placeholder="To" className={inputCls} />
            <input type="date" value={component.date ?? ""} onChange={(e) => onChange({ ...component, date: e.target.value })} className={inputCls} />
          </div>
        ) : component.kind === "hotel" ? (
          <div className="flex gap-2">
            <input type="date" value={component.checkIn ?? ""} onChange={(e) => onChange({ ...component, checkIn: e.target.value })} className={inputCls} />
            <input type="date" value={component.checkOut ?? ""} onChange={(e) => onChange({ ...component, checkOut: e.target.value })} className={inputCls} />
          </div>
        ) : (
          <input value={component.address ?? ""} onChange={(e) => onChange({ ...component, address: e.target.value })} placeholder="Address" className={inputCls} />
        )}
      </div>

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
            if (mediaId) onChange({ ...component, photoMediaId: mediaId });
          }}
        />
        <Icon name="camera" className="h-4 w-4" /> {uploading ? "Uploading…" : component.photoMediaId ? "Change photo" : "Add a photo"}
      </label>
    </div>
  );
}

/** Insert one library item, or a whole pack at once, as fresh components —
 *  each gets its own new id, so the same saved item can be dropped onto
 *  more than one option, or more than once onto the same one. */
function LibraryPicker({
  library,
  onInsert,
  onClose,
}: {
  library: { items: LibraryItem[]; packs: LibraryPack[] };
  onInsert: (components: ProposalComponent[]) => void;
  onClose: () => void;
}) {
  if (library.items.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-[var(--gold-light)] bg-white p-3 text-xs text-stone-500">
        Nothing in your library yet — <a href="/library" target="_blank" className="font-semibold text-[var(--navy)] underline">add some</a> to reuse it here.
      </div>
    );
  }
  return (
    <div className="mt-3 max-h-64 space-y-3 overflow-y-auto rounded-lg border border-[var(--gold-light)] bg-white p-3">
      {library.packs.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-stone-400">Packs</p>
          {library.packs.map((pack) => (
            <button
              key={pack.id}
              type="button"
              onClick={() => {
                onInsert(itemsInPack(pack, library.items).map((i) => libraryItemToProposalComponent(i, uid())));
                onClose();
              }}
              className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--cream-deep)]"
            >
              {pack.name} <span className="text-stone-400">· {pack.itemIds.length} items</span>
            </button>
          ))}
        </div>
      )}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-stone-400">Saved items</p>
        {library.items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              onInsert([libraryItemToProposalComponent(item, uid())]);
              onClose();
            }}
            className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--cream-deep)]"
          >
            {item.name} <span className="text-stone-400">· {PROPOSAL_COMPONENT_LABEL[item.kind]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function OptionEditor({
  option,
  index,
  library,
  onChange,
  onRemove,
}: {
  option: ProposalOption;
  index: number;
  library: { items: LibraryItem[]; packs: LibraryPack[] };
  onChange: (next: ProposalOption) => void;
  onRemove: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  return (
    <div className="rounded-2xl border border-[var(--gold-light)] bg-[#fcfaf6] p-5">
      <div className="flex items-start justify-between gap-3">
        <input
          value={option.name}
          onChange={(e) => onChange({ ...option, name: e.target.value })}
          className="w-full max-w-xs border-b border-[var(--gold-light)] bg-transparent font-[family-name:var(--font-display)] text-lg text-[var(--navy)] focus:outline-none"
        />
        <button type="button" onClick={onRemove} className="flex-none text-stone-400 hover:text-red-700" aria-label={`Remove option ${index + 1}`}>
          <Icon name="trash" className="h-4 w-4" />
        </button>
      </div>

      <textarea
        value={option.summary ?? ""}
        onChange={(e) => onChange({ ...option, summary: e.target.value })}
        placeholder="A short summary the client sees under the name"
        rows={2}
        className={`${inputCls} mt-3`}
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className={labelCls}>Total price</span>
          <input
            type="number"
            value={option.totalPrice ?? ""}
            onChange={(e) => onChange({ ...option, totalPrice: e.target.value ? Number(e.target.value) : undefined })}
            className="w-28 rounded-lg border border-[var(--gold-light)] px-2 py-1.5 text-sm"
          />
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-stone-500">
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
              if (mediaId) onChange({ ...option, photoMediaId: mediaId });
            }}
          />
          <Icon name="camera" className="h-4 w-4" /> {uploading ? "Uploading…" : option.photoMediaId ? "Change hero photo" : "Add a hero photo"}
        </label>
      </div>

      <div className="mt-4 space-y-2.5">
        {option.components.map((c) => (
          <ComponentRow
            key={c.id}
            component={c}
            onChange={(next) => onChange({ ...option, components: option.components.map((x) => (x.id === c.id ? next : x)) })}
            onRemove={() => onChange({ ...option, components: option.components.filter((x) => x.id !== c.id) })}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            onChange({
              ...option,
              components: [...option.components, { id: uid(), kind: "hotel", name: "" }],
            })
          }
          className={smallButton}
        >
          + Add a hotel, flight, activity…
        </button>
        <button type="button" onClick={() => setShowLibrary((s) => !s)} className={smallButton}>
          <Icon name="suitcase" className="h-3.5 w-3.5" /> Insert from your library
        </button>
      </div>
      {showLibrary && (
        <LibraryPicker
          library={library}
          onInsert={(components) => onChange({ ...option, components: [...option.components, ...components] })}
          onClose={() => setShowLibrary(false)}
        />
      )}
    </div>
  );
}

export default function ProposalBuilder() {
  const [tripId, setTripId] = useState<string | null>(null);
  const [tripName, setTripName] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [library, setLibrary] = useState<{ items: LibraryItem[]; packs: LibraryPack[] }>({ items: [], packs: [] });
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  useEffect(() => {
    fetch("/api/account/library", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setLibrary({ items: d.items ?? [], packs: d.packs ?? [] }))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // The trip this proposal is for, carried in the address
      // (/proposal?trip=…) when opened from a specific trip — so it builds and
      // reads THAT trip's proposal rather than whichever one is "open".
      const wanted = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("trip") : null;
      const res = await fetch(`/api/account/proposal${wanted ? `?trip=${encodeURIComponent(wanted)}` : ""}`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as
        | { proposal: Proposal | null; tripId: string; tripName: string; error?: string }
        | null;
      if (!res.ok || !data) {
        setError(data && "error" in data ? (data.error ?? "Could not load.") : "Could not load.");
        return;
      }
      setTripId(data.tripId);
      setTripName(data.tripName);
      setProposal(data.proposal ?? emptyProposal());
    } catch {
      setError("Could not reach the server.");
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
    if (!tripId) return null;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/account/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, ...body }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; proposal?: Proposal; shareId?: string; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "That didn't go through.");
        return null;
      }
      return data;
    } catch {
      setError("Could not reach the server.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!proposal) return;
    const data = await post({ action: "save", proposal });
    if (data?.proposal) {
      setProposal(data.proposal);
      setNote("Saved.");
      window.setTimeout(() => setNote(""), 2000);
    }
  }

  async function send() {
    if (!proposal) return;
    await save();
    const data = await post({ action: "send" });
    if (data?.proposal) {
      setProposal(data.proposal);
      if (data.shareId) setShareUrl(`${origin}/p/${data.shareId}`);
    }
  }

  async function preview() {
    const data = await post({ action: "share" });
    if (data?.shareId) window.open(`${origin}/p/${data.shareId}`, "_blank");
  }

  async function convert() {
    const data = await post({ action: "convert" });
    if (data?.ok) setNote("Converted — open the planner to see it on the itinerary.");
  }

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;
  if (!proposal || !tripId) return <p className="text-sm text-red-700">{error || "Could not load a trip to build a proposal for."}</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Proposal for</p>
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{tripName || "This trip"}</h2>
        </div>
        <span className="rounded-full border border-[var(--gold-light)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)]">
          {PROPOSAL_STATUS_LABEL[proposal.status]}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className={labelCls}>Open through</span>
        <input
          type="date"
          value={proposal.expiresAt ?? ""}
          onChange={(e) => setProposal({ ...proposal, expiresAt: e.target.value || undefined })}
          className="rounded-lg border border-[var(--gold-light)] px-3 py-1.5 text-sm"
        />
      </div>

      <div className="space-y-5">
        {proposal.options.map((option, i) => (
          <OptionEditor
            key={option.id}
            option={option}
            index={i}
            library={library}
            onChange={(next) => setProposal({ ...proposal, options: proposal.options.map((o) => (o.id === option.id ? next : o)) })}
            onRemove={() => setProposal({ ...proposal, options: proposal.options.filter((o) => o.id !== option.id) })}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() =>
          setProposal({
            ...proposal,
            options: [...proposal.options, { ...emptyProposalOption(`Option ${String.fromCharCode(65 + proposal.options.length)}`), id: uid() }],
          })
        }
        className={smallButton}
      >
        + Add another option
      </button>

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--gold-light)] pt-5">
        <button type="button" disabled={busy} onClick={() => void save()} className="inline-flex min-h-11 items-center rounded-full border border-[var(--gold)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white disabled:opacity-60">
          Save draft
        </button>
        <button type="button" disabled={busy} onClick={() => void preview()} className="inline-flex min-h-11 items-center rounded-full border border-[var(--gold-light)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:border-[var(--gold)] disabled:opacity-60">
          Preview as client
        </button>
        <button
          type="button"
          disabled={busy || proposal.options.length === 0}
          onClick={() => void send()}
          className="inline-flex min-h-11 items-center rounded-full bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:opacity-90 disabled:opacity-60"
        >
          Send to client
        </button>
        {proposal.status === "approved" && (
          <button type="button" disabled={busy} onClick={() => void convert()} className="inline-flex min-h-11 items-center rounded-full bg-[var(--gold)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:opacity-90 disabled:opacity-60">
            Convert to itinerary
          </button>
        )}
      </div>

      {shareUrl && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--gold-light)] bg-white p-3">
          <span className="truncate text-xs text-stone-600">{shareUrl}</span>
          <CopyLinkButton value={shareUrl} />
        </div>
      )}

      {proposal.comments.length > 0 && (
        <div className="space-y-1.5 border-t border-[var(--gold-light)] pt-5">
          <p className={labelCls}>Notes with the client</p>
          {proposal.comments.map((c, i) => (
            <p key={i} className="text-sm text-stone-700">
              <span className="font-semibold text-[var(--navy)]">{c.from === "planner" ? "You" : "Client"}:</span> {c.text}
            </p>
          ))}
        </div>
      )}

      {note && <p className="text-xs font-semibold text-emerald-700">{note}</p>}
      {error && <p className="text-xs font-semibold text-red-700">{error}</p>}
    </div>
  );
}
