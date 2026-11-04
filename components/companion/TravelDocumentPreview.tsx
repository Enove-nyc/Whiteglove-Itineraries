"use client";

import { useEffect, useRef, useState } from "react";
import type { PersonalTravelDocument } from "@/lib/personal-travel-wallet";

export async function preparePdfViewer() {
  const pdfjs = await import("pdfjs-dist");
  const worker = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const response = await fetch(worker, { cache: "force-cache" });
  if (!response.ok) throw new Error("The PDF viewer is not available offline yet.");
  return pdfjs;
}

function PdfPage({ blob, pageNumber, onPages }: { blob: Blob; pageNumber: number; onPages: (pages: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    let cancelRender: (() => void) | undefined;
    void (async () => {
      setLoading(true); setError("");
      const pdfjs = await preparePdfViewer();
      const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
      destroy = () => { void task.destroy(); };
      if (cancelled) { destroy(); return; }
      const pdf = await task.promise;
      if (cancelled) return;
      onPages(pdf.numPages);
      const page = await pdf.getPage(Math.min(pageNumber, pdf.numPages));
      if (cancelled || !canvas.current) return;
      const element = canvas.current;
      const natural = page.getViewport({ scale: 1 });
      const width = Math.min(window.innerWidth - 32, 900);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: width / natural.width * ratio });
      element.width = viewport.width; element.height = viewport.height;
      element.style.width = `${viewport.width / ratio}px`;
      element.style.height = `${viewport.height / ratio}px`;
      const render = page.render({ canvas: element, viewport });
      cancelRender = () => render.cancel();
      await render.promise;
      if (!cancelled) setLoading(false);
    })().catch(() => { if (!cancelled) { setLoading(false); setError("This PDF could not be displayed. Keep the original file available too."); } });
    return () => { cancelled = true; cancelRender?.(); destroy?.(); };
  }, [blob, pageNumber, onPages]);
  return <div className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-auto bg-stone-200 p-4">
    {loading ? <p role="status" className="text-sm">Opening your document…</p> : null}
    {error ? <p role="alert" className="rounded-xl bg-white p-4 text-sm text-red-800">{error}</p> : null}
    <canvas ref={canvas} aria-label={`Document page ${pageNumber}`} className="max-w-full bg-white shadow" />
  </div>;
}

export default function TravelDocumentPreview({ document, onClose }: { document: PersonalTravelDocument; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    let active = true;
    let objectUrl = "";
    void Promise.resolve().then(() => { if (active) { objectUrl = URL.createObjectURL(document.blob); setUrl(objectUrl); } });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); element?.close(); };
  }, [document.blob]);
  return <dialog aria-label={document.name} ref={dialog} onCancel={onClose} className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-[#FAF8F3] p-0 text-[#102F35] backdrop:bg-black/70">
    <div className="flex h-full flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-2"><h2 className="min-w-0 truncate text-sm font-semibold">{document.name}</h2><button type="button" autoFocus onClick={onClose} className="min-h-11 shrink-0 rounded-xl px-4 font-semibold">Close document</button></header>
      {document.blob.type === "application/pdf" ? <PdfPage blob={document.blob} pageNumber={page} onPages={setPages} /> : <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-4">{url ? /* A private local blob must never go through the image optimizer. */ <img src={url} alt={document.name} className="h-auto max-w-full object-contain" /> : null}</div>}
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-stone-200 bg-white px-4 py-2">
        {document.blob.type === "application/pdf" ? <div className="flex items-center gap-3"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="min-h-11 px-2 text-sm disabled:opacity-40">Previous</button><span className="text-xs">Page {page} of {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage((value) => value + 1)} className="min-h-11 px-2 text-sm disabled:opacity-40">Next</button></div> : <span className="text-xs">Saved on this device</span>}
        {url ? <a href={url} download={document.name} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold underline">Save a copy</a> : null}
      </footer>
    </div>
  </dialog>;
}
