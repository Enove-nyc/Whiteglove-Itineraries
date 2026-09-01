"use client";

import { useCallback, useEffect, useState } from "react";
import CopyLinkButton from "@/components/CopyLinkButton";
import { Icon } from "@/components/icons/Icon";
import {
  emptyFormTemplate,
  fieldLabel,
  fieldIsSensitive,
  STANDARD_FIELD_LABEL,
  type ClientFormResponse,
  type ClientFormTemplate,
  type FormField,
  type StandardFieldKey,
} from "@/data/client-form";

/**
 * The planner's side of a client's pre-trip form — which fields to ask for,
 * a link to send, and the answers that come back.
 *
 * ANSWERS NEVER TOUCH THE ITINERARY. This screen is the only place they are
 * ever read — the server route behind it (app/api/account/client-form)
 * checks the same Business gate every other planner-only tool here does,
 * and nothing else on the site (the shared itinerary, a proposal, the app)
 * ever asks for them.
 */

const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`);
const STANDARD_KEYS = Object.keys(STANDARD_FIELD_LABEL) as StandardFieldKey[];
const smallButton =
  "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-[var(--gold-light)] px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:border-[var(--gold)] disabled:opacity-50";

export default function ClientFormBuilder() {
  const [tripId, setTripId] = useState<string | null>(null);
  const [tripName, setTripName] = useState("");
  const [template, setTemplate] = useState<ClientFormTemplate>(emptyFormTemplate());
  const [responses, setResponses] = useState<ClientFormResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Which trip's form — carried in the address (/forms?trip=…) when the
      // advisor opened it FROM a specific trip, so this screen builds and reads
      // that trip's form rather than always whichever one is "open". Read off
      // the URL directly (no useSearchParams, so no Suspense boundary needed).
      const wanted = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("trip") : null;
      const res = await fetch(`/api/account/client-form${wanted ? `?trip=${encodeURIComponent(wanted)}` : ""}`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as
        | { template: ClientFormTemplate | null; responses: ClientFormResponse[]; tripId: string; tripName: string; error?: string }
        | null;
      if (!res.ok || !data) {
        setError(data && "error" in data ? (data.error ?? "Could not load.") : "Could not load.");
        return;
      }
      setTripId(data.tripId);
      setTripName(data.tripName);
      setTemplate(data.template ?? emptyFormTemplate());
      setResponses(data.responses ?? []);
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
      const res = await fetch("/api/account/client-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, ...body }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; template?: ClientFormTemplate; shareId?: string; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "That didn't go through.");
        return null;
      }
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function save(next: ClientFormTemplate) {
    setTemplate(next);
    const data = await post({ action: "save", template: next });
    if (data?.template) {
      setNote("Saved.");
      window.setTimeout(() => setNote(""), 2000);
    }
  }

  function toggleStandard(key: StandardFieldKey) {
    const existing = template.fields.find((f) => f.kind === "standard" && f.key === key);
    const next = existing
      ? template.fields.filter((f) => f !== existing)
      : [...template.fields, { id: uid(), kind: "standard" as const, key, required: false }];
    void save({ ...template, fields: next });
  }

  function toggleRequired(id: string) {
    void save({ ...template, fields: template.fields.map((f) => (f.id === id ? { ...f, required: !f.required } : f)) });
  }

  function removeCustom(id: string) {
    void save({ ...template, fields: template.fields.filter((f) => f.id !== id) });
  }

  async function getLink() {
    const data = await post({ action: "share" });
    if (data?.shareId) setShareUrl(`${origin}/form/${data.shareId}`);
  }

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;
  if (!tripId) return <p className="text-sm text-red-700">{error || "Could not load a trip to build a form for."}</p>;

  const customFields = template.fields.filter((f): f is Extract<FormField, { kind: "custom" }> => f.kind === "custom");

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Pre-trip form for</p>
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{tripName || "This trip"}</h2>
      </div>

      <section>
        <p className={`text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gold-ink)]`}>What to ask for</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {STANDARD_KEYS.map((key) => {
            const field = template.fields.find((f) => f.kind === "standard" && f.key === key);
            return (
              <div key={key} className={`flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm ${field ? "border-[var(--gold)] bg-white" : "border-[var(--gold-light)]"}`}>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={Boolean(field)} onChange={() => toggleStandard(key)} disabled={busy} />
                  {STANDARD_FIELD_LABEL[key]}
                  {fieldIsSensitive({ id: "x", kind: "standard", key, required: false }) && (
                    <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-stone-500">private</span>
                  )}
                </label>
                {field && (
                  <label className="flex flex-none items-center gap-1 text-[11px] text-stone-500">
                    <input type="checkbox" checked={field.required} onChange={() => toggleRequired(field.id)} disabled={busy} /> required
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gold-ink)]">Custom questions</p>
        <div className="mt-3 space-y-2">
          {customFields.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--gold-light)] bg-white p-2.5 text-sm">
              <span>{fieldLabel(f)}</span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1 text-[11px] text-stone-500">
                  <input type="checkbox" checked={f.required} onChange={() => toggleRequired(f.id)} disabled={busy} /> required
                </label>
                <button type="button" onClick={() => removeCustom(f.id)} className="text-stone-400 hover:text-red-700" aria-label="Remove">
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="A question of your own"
            className="flex-1 rounded-lg border border-[var(--gold-light)] px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={busy || !customLabel.trim()}
            onClick={() => {
              void save({ ...template, fields: [...template.fields, { id: uid(), kind: "custom", label: customLabel.trim(), required: false }] });
              setCustomLabel("");
            }}
            className={smallButton}
          >
            + Add
          </button>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--gold-light)] pt-5">
        <button
          type="button"
          disabled={busy || template.fields.length === 0}
          onClick={() => void getLink()}
          className="inline-flex min-h-11 items-center rounded-full bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:opacity-90 disabled:opacity-60"
        >
          Get the client&rsquo;s link
        </button>
        {note && <span className="text-xs font-semibold text-emerald-700">{note}</span>}
      </div>
      {shareUrl && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--gold-light)] bg-white p-3">
          <span className="truncate text-xs text-stone-600">{shareUrl}</span>
          <CopyLinkButton value={shareUrl} />
        </div>
      )}

      <section className="border-t border-[var(--gold-light)] pt-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gold-ink)]">Answers so far ({responses.length})</p>
        {responses.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">Nothing back yet.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {responses.map((r) => (
              <div key={r.id} className="rounded-xl border border-[var(--gold-light)] bg-white p-4">
                <p className="font-semibold text-[var(--navy)]">{r.respondentName}</p>
                <dl className="mt-2 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                  {template.fields
                    .filter((f) => r.answers[f.id])
                    .map((f) => (
                      <div key={f.id}>
                        <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-stone-400">{fieldLabel(f)}</dt>
                        <dd className="text-stone-700">{r.answers[f.id]}</dd>
                      </div>
                    ))}
                </dl>
              </div>
            ))}
          </div>
        )}
      </section>

      {error && <p className="text-xs font-semibold text-red-700">{error}</p>}
    </div>
  );
}
