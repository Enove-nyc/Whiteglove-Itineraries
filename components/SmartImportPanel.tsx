"use client";

import { useState } from "react";
import { IMPORTED_KIND_LABEL, type ImportedItem, type ImportedItemKind } from "@/data/smart-import";
import {
  IMPORT_ACCEPT,
  IMPORT_TYPES,
  MAX_IMPORT_BYTES,
  importFingerprint,
  isImportMediaType,
} from "@/data/smart-import-files";
import { ANSWER_LABEL } from "@/lib/assistant-disclosure";

const inputClass =
  "mt-1 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2 text-sm text-[var(--navy)] shadow-sm focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const caption = "text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500";

function summaryLine(item: ImportedItem): string {
  if (item.kind === "flight") {
    const route = [item.from, item.to].filter(Boolean).join(" → ");
    const flight = [item.airline, item.flightNo].filter(Boolean).join(" ");
    return [flight, route, item.date].filter(Boolean).join(" — ") || "Flight";
  }
  if (item.kind === "lodging") {
    const stay = [item.checkIn, item.checkOut].filter(Boolean).join(" → ");
    return [item.name, stay].filter(Boolean).join(" — ") || "Hotel";
  }
  return [item.name, item.date, item.departTime].filter(Boolean).join(" — ") || "Stop";
}

/**
 * Smart Import's preview: paste a confirmation or attach its PDF, see exactly
 * what was read out of it, and add only what looks right. Nothing here is
 * saved until "Add to trip" — see data/smart-import.ts's
 * addImportedItemsToItinerary, called once by the caller for the whole batch,
 * same as the "Saved route" import already does.
 */
export default function SmartImportPanel({ onImport, onCancel }: { onImport: (items: ImportedItem[]) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileDataUrl, setFileDataUrl] = useState("");
  /**
   * What has already been added in this sitting, so the same confirmation is
   * not silently added twice. In memory only and for one sitting only, which
   * is exactly as long as the mistake it prevents — nothing about what anybody
   * imported is kept or sent anywhere.
   */
  const [alreadyAdded, setAlreadyAdded] = useState<Set<string>>(new Set());
  const [duplicate, setDuplicate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<ImportedItem[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isImportMediaType(file.type)) {
      setError(`Attach a ${Object.values(IMPORT_TYPES).join(", ")} — the PDF, a screenshot, or a photo of it.`);
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setError("That file is too large — try a screenshot of just the confirmation.");
      return;
    }
    setError("");
    setDuplicate(false);
    setFileName(file.name);
    const reader = new FileReader();
    // A failed read must not leave the button armed with nothing behind it.
    reader.onerror = () => {
      setError("That file could not be read. Try another, or paste the text instead.");
      setFileName("");
      setFileDataUrl("");
    };
    reader.onload = () => setFileDataUrl(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  }

  async function extract() {
    if (!text.trim() && !fileDataUrl) {
      setError("Paste a confirmation, or attach one, first.");
      return;
    }
    setDuplicate(alreadyAdded.has(importFingerprint({ text, base64: fileDataUrl })));
    setLoading(true);
    setError("");
    setItems(null);
    setWarnings([]);
    try {
      const res = await fetch("/api/account/smart-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fileDataUrl ? { fileDataUrl } : { text }),
      });
      const data = (await res.json().catch(() => null)) as { items?: ImportedItem[]; warnings?: string[]; error?: string } | null;
      if (!res.ok || !data) {
        setError(data?.error || "Could not read that just now. Try again in a moment.");
        return;
      }
      setItems(data.items || []);
      setWarnings(data.warnings || []);
      setExcluded(new Set());
      if ((data.items || []).length === 0) {
        setError(data.error || "Could not find a booking to read out of that.");
      }
    } catch {
      setError("Could not reach the import service.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addSelected() {
    if (!items) return;
    const chosen = items.filter((it) => !excluded.has(it.id));
    if (chosen.length === 0) return;
    // Remembered so re-reading the same confirmation in this sitting warns
    // before it is added a second time.
    const print = importFingerprint({ text, base64: fileDataUrl });
    if (print) setAlreadyAdded((prev) => new Set(prev).add(print));
    onImport(chosen);
    onCancel();
  }

  return (
    <div className="mt-4 rounded-xl border border-[var(--gold-light)] bg-[#fcfaf6] p-4">
      <p className="text-sm font-semibold text-[var(--navy)]">Smart Import</p>
      <p className="mt-1 text-xs leading-5 text-stone-600">
        Paste a confirmation email or reservation text, or attach one — the PDF, a screenshot, or a photo of a printed
        voucher — and it reads out the flight, hotel or reservation details. Nothing is added until you choose to keep it
        below.
      </p>
      {/* SAID BEFORE ANYTHING IS READ, not after. What comes back is a model's
          reading of a document, and the planner is about to check it field by
          field — they should know that is what they are checking. The same
          wording the assistant uses, from lib/assistant-disclosure.ts, so the
          site has one phrase for this and not two. */}
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--gold-ink)]">{ANSWER_LABEL}</p>

      {!items && (
        <>
          <label className="mt-3 block">
            <span className={caption}>Paste confirmation text</span>
            <textarea
              rows={6}
              className={`${inputClass} min-h-32`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the confirmation email or reservation text here…"
              disabled={Boolean(fileDataUrl)}
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-stone-500">or</span>
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-[var(--gold-light)] bg-white px-3.5 text-xs font-bold text-[var(--navy)] transition hover:border-[var(--gold)] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--gold)]">
              {fileName || "Attach a PDF, screenshot or photo"}
              <input type="file" accept={IMPORT_ACCEPT} className="sr-only" onChange={onFile} />
            </label>
            {fileDataUrl && (
              <button
                type="button"
                onClick={() => {
                  setFileDataUrl("");
                  setFileName("");
                }}
                className="text-xs font-semibold text-stone-500 underline"
              >
                Remove
              </button>
            )}
          </div>
          {/* Already added once in this sitting. A warning rather than a block:
              a planner may legitimately want the same voucher on two trips,
              and the site should not decide that for them. */}
          {duplicate && (
            <p className="mt-2 text-xs font-semibold text-[var(--gold-ink)]">
              You already added this one. Read it again if you meant to.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-xs font-semibold text-red-700">
              {error}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={extract}
              disabled={loading}
              className="rounded-full bg-[var(--navy)] px-5 py-2.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Reading…" : "Read confirmation"}
            </button>
            <button type="button" onClick={onCancel} className="rounded-full border border-stone-300 px-5 py-2.5 text-xs font-bold text-[var(--navy)]">
              Cancel
            </button>
          </div>
        </>
      )}

      {items && (
        <>
          {items.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              {items.map((it) => (
                <label
                  key={it.id}
                  className="flex items-start gap-3 rounded-lg border border-[var(--gold-light)] bg-white p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={!excluded.has(it.id)}
                    onChange={() => toggle(it.id)}
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className={caption}>{IMPORTED_KIND_LABEL[it.kind as ImportedItemKind]}</span>
                    <span className="font-semibold text-[var(--navy)]">{summaryLine(it)}</span>
                    {it.address && <span className="text-xs text-stone-600">{it.address}</span>}
                    {it.confirmation && <span className="text-xs text-stone-600">Confirmation: {it.confirmation}</span>}
                    {it.notes && <span className="text-xs text-stone-500">{it.notes}</span>}
                    {it.sourceExcerpt && <span className="text-xs italic text-stone-400">“{it.sourceExcerpt}”</span>}
                  </span>
                </label>
              ))}
            </div>
          )}
          {warnings.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              <p className="font-bold">Could not confidently read:</p>
              <ul className="mt-1 list-disc pl-4">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-4 flex gap-2">
            {items.length > 0 && (
              <button
                type="button"
                onClick={addSelected}
                disabled={items.every((it) => excluded.has(it.id))}
                className="rounded-full bg-[var(--navy)] px-5 py-2.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-60"
              >
                Add {items.filter((it) => !excluded.has(it.id)).length} to trip
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setItems(null);
                setWarnings([]);
                setError("");
              }}
              className="rounded-full border border-stone-300 px-5 py-2.5 text-xs font-bold text-[var(--navy)]"
            >
              Try another
            </button>
            <button type="button" onClick={onCancel} className="rounded-full border border-stone-300 px-5 py-2.5 text-xs font-bold text-[var(--navy)]">
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
