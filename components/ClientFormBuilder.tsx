"use client";

import { useCallback, useEffect, useState } from "react";
import CopyLinkButton from "@/components/CopyLinkButton";
import { Icon } from "@/components/icons/Icon";
import { useFocusTrap } from "@/components/useFocusTrap";
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

/** "4 March 2026", or nothing when the stamp is unreadable. */
function whenSent(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t)
    ? ""
    : new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * One client's answers, read on purpose rather than left lying open.
 *
 * Every response used to render in full, one under the next — so a passport
 * number, a date of birth and a Known Traveler Number for every traveller sat
 * open on the screen the whole time this page was. That is a lot of somebody
 * else's documents to have showing while you share a screen, hand the laptop
 * over, or simply walk away from it. A response is a row now; its answers open
 * when you ask for them, and the fields the data file already marks sensitive
 * stay covered until you press Show.
 *
 * This is a courtesy, not a wall — the real protection is architectural (see
 * data/client-form.ts and this file's header). It just stops the screen
 * volunteering a passport number nobody asked to see.
 */
function ResponseModal({
  response,
  fields,
  onClose,
}: {
  response: ClientFormResponse;
  fields: FormField[];
  onClose: () => void;
}) {
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const answered = fields.filter((f) => response.answers[f.id]);

  return (
    <div
      className="fixed inset-0 z-[var(--wg-z-modal,200)] flex items-end justify-center bg-[var(--navy)]/50 p-4 backdrop-blur-[2px] sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Answers from ${response.respondentName}`}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--gold-light)] bg-white p-6 shadow-[0_24px_60px_rgba(23,45,82,.20)] sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]">
              {response.respondentName}
            </h3>
            {whenSent(response.submittedAt) && (
              <p className="mt-1 text-xs text-stone-500">Sent {whenSent(response.submittedAt)}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500 transition hover:text-[var(--navy)]"
          >
            Close
          </button>
        </div>

        <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {answered.map((f) => {
            const sensitive = fieldIsSensitive(f);
            const reveal = shown[f.id];
            return (
              <div key={f.id}>
                <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-stone-400">
                  {fieldLabel(f)}
                  {sensitive && <span className="ml-1.5 text-stone-400">· private</span>}
                </dt>
                <dd className="text-stone-700">
                  {sensitive && !reveal ? (
                    <button
                      type="button"
                      onClick={() => setShown((c) => ({ ...c, [f.id]: true }))}
                      className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2"
                    >
                      Show
                    </button>
                  ) : (
                    response.answers[f.id]
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    </div>
  );
}

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
  // Whose answers are open, if anyone's. Nothing is read until it is asked for.
  const [openResponse, setOpenResponse] = useState<string | null>(null);
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

  // Async wrapper: a bare call enters load() synchronously, which the rule
  // counts as a setState during the effect.
  useEffect(() => {
    let active = true;
    // Async wrapper rather than a bare call from the effect body: a bare call
    // enters it synchronously, which the rule counts as a setState during the
    // effect. Same shape the rest of this repo uses.
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
          <ul className="mt-3 divide-y divide-[var(--gold-light)] rounded-xl border border-[var(--gold-light)] bg-white">
            {responses.map((r) => {
              const answered = template.fields.filter((f) => r.answers[f.id]).length;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setOpenResponse(r.id)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-[var(--cream-deep)]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-[var(--navy)]">{r.respondentName}</span>
                      <span className="mt-0.5 block truncate text-xs text-stone-500">
                        {[
                          `${answered} ${answered === 1 ? "answer" : "answers"}`,
                          whenSent(r.submittedAt),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gold-ink)]">Read</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {openResponse && responses.some((r) => r.id === openResponse) && (
        <ResponseModal
          response={responses.find((r) => r.id === openResponse)!}
          fields={template.fields}
          onClose={() => setOpenResponse(null)}
        />
      )}

      {error && <p className="text-xs font-semibold text-red-700">{error}</p>}
    </div>
  );
}
