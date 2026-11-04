"use client";

import { useEffect, useId, useState } from "react";
import TravelDocumentPreview, { preparePdfViewer } from "@/components/companion/TravelDocumentPreview";
import { listPersonalDocuments, personalWalletScope, removePersonalDocument, savePersonalDocument, type PersonalTravelDocument } from "@/lib/personal-travel-wallet";

/** Private device files. They never become attachments on the shared trip. */
export default function PersonalTravelWallet({ tripKey }: { tripKey: string }) {
  const inputId = useId();
  const [scope, setScope] = useState("");
  const [ready, setReady] = useState(false);
  const [documents, setDocuments] = useState<PersonalTravelDocument[]>([]);
  const [kind, setKind] = useState("Boarding pass");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<PersonalTravelDocument | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void personalWalletScope(tripKey).then(async (key) => ({ key, rows: await listPersonalDocuments(key) })).then(({ key, rows }) => {
      if (active) { setScope(key); setDocuments(rows); setReady(true); }
    }).catch(() => { if (active) { setReady(true); setError("This device’s wallet could not be opened. Try again with device storage enabled."); } });
    return () => { active = false; };
  }, [tripKey]);

  async function add(file: File) {
    setBusy(true); setError(""); setNotice("");
    try {
      const document: PersonalTravelDocument = { id: crypto.randomUUID(), scope, name: file.name, kind, savedAt: new Date().toISOString(), blob: file };
      await savePersonalDocument(document);
      setDocuments((rows) => [document, ...rows]);
      if (file.type === "application/pdf") {
        try { await preparePdfViewer(); }
        catch { setNotice("Saved on this device. Open it once with a connection to prepare the PDF viewer for offline use."); return; }
      }
      setNotice("Saved on this device. You can open it without a connection.");
    } catch (problem) { setError(problem instanceof Error ? problem.message : "The file was not saved."); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true); setError("");
    try { await removePersonalDocument(id); setDocuments((rows) => rows.filter((row) => row.id !== id)); setRemoveId(null); }
    catch { setError("The file could not be removed. Please try again."); }
    finally { setBusy(false); }
  }
  return <section aria-labelledby={`${inputId}-heading`} className="rounded-2xl border border-stone-200 bg-white p-4 text-[#102F35]">
    <h2 id={`${inputId}-heading`} className="text-lg font-semibold">Your personal wallet</h2>
    <p className="mt-2 text-sm leading-6 text-stone-600">Boarding passes, hotel confirmations and entry tickets. Files stay on this device, work offline and are private to you. They are not shared with the trip group or synced to another phone. Signing out or clearing app data removes them.</p>
    <label htmlFor={`${inputId}-kind`} className="mt-4 block text-sm font-semibold">Document type</label>
    <select id={`${inputId}-kind`} value={kind} onChange={(event) => setKind(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3">
      {["Boarding pass", "Hotel confirmation", "Entry ticket", "Other travel document"].map((label) => <option key={label}>{label}</option>)}
    </select>
    <label htmlFor={inputId} className="mt-3 block text-sm font-semibold">Add a PDF or photo · up to 15 MB</label>
    <input id={inputId} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy || !scope} className="mt-2 min-h-11 w-full min-w-0 text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-[#102F35] file:px-4 file:text-white" onChange={(event) => {
      const file = event.target.files?.[0]; event.target.value = ""; if (file) void add(file);
    }} />
    <p role="status" className="mt-2 text-sm leading-6">{busy ? "Saving changes…" : notice}</p>
    {error ? <p role="alert" className="mt-2 text-sm text-red-800">{error}</p> : null}
    {documents.length ? <ul className="mt-3 divide-y divide-stone-200">{documents.map((document) => <li key={document.id} className="py-3">
      <p className="text-xs font-semibold text-stone-600">{document.kind}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 break-all"><button type="button" onClick={() => setPreview(document)} className="inline-flex min-h-11 items-center text-left font-semibold underline underline-offset-4">{document.name}</button><button type="button" disabled={busy} onClick={() => setRemoveId(document.id)} className="min-h-11 px-2 text-sm underline">Remove</button></div>
      {removeId === document.id ? <div className="mt-2 rounded-xl bg-stone-50 p-3 text-sm"><p>Remove this file from your wallet?</p><div className="mt-1 flex gap-4"><button type="button" disabled={busy} onClick={() => void remove(document.id)} className="min-h-11 font-semibold text-red-800">Remove file</button><button type="button" onClick={() => setRemoveId(null)} className="min-h-11">Keep it</button></div></div> : null}
    </li>)}</ul> : ready ? <p className="mt-2 text-sm text-stone-600">{error ? "" : "No personal documents saved for this trip yet."}</p> : <p role="status" className="mt-2 text-sm text-stone-600">Opening your wallet…</p>}
    {preview ? <TravelDocumentPreview key={preview.id} document={preview} onClose={() => setPreview(null)} /> : null}
  </section>;
}
