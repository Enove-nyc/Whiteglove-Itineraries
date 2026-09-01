"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { ItinAttachment } from "@/data/itinerary";
import {
  ATTACHMENT_KINDS,
  KIND_LABELS,
  MAX_ATTACHMENT_BYTES,
  MAX_PER_ITEM,
  type AttachmentKind,
  describeSize,
  opensInTheBrowser,
} from "@/lib/attachments";
import { PreviewDialog } from "@/components/PreviewDialog";

/**
 * The boarding pass, the ticket, the booking — kept on the stop it belongs to.
 *
 * Everything about the trip was in one place except the pieces of paper the
 * trip actually needs, and the traveller stood at the gate going through their
 * email for the pass.
 *
 * WHAT THE SCREEN SAYS OUT LOUD, because a box that accepts files is exactly
 * where a passport ends up: this is not for identity documents. The kinds on
 * offer are the four things a traveller genuinely hands over, and there is no
 * fifth.
 *
 * SIGNING IN IS REQUIRED, and the reason is given rather than the demand. A
 * 600KB pass in a browser's own storage breaks the trip it was meant to help,
 * so there is nowhere to put it without an account.
 */

const smallButton =
  "inline-flex min-h-11 items-center rounded-full border border-[var(--gold-light)] bg-white px-3.5 text-xs font-bold text-[var(--navy)] transition hover:border-[var(--gold)] hover:bg-[var(--cream-deep)] disabled:opacity-60";

export default function StopAttachments({
  attachments = [],
  signedIn,
  onChange,
}: {
  attachments?: ItinAttachment[];
  signedIn: boolean;
  onChange: (next: ItinAttachment[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<AttachmentKind>("boarding-pass");
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      // Read in the browser and post as a data URL, the same way a picture is
      // sent in. The size is checked again on the server from the data itself.
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read that file."));
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/account/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, kind, dataUrl, existingCount: attachments.length }),
      });
      const data = (await res.json().catch(() => null)) as { attachment?: ItinAttachment; error?: string } | null;
      if (!res.ok || !data?.attachment) {
        setError(data?.error ?? "Could not keep that file. Try again.");
        return;
      }
      onChange([...attachments, data.attachment]);
      setOpen(false);
    } catch {
      setError("Could not read that file.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/account/attachments?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Could not take that off.");
        return;
      }
      onChange(attachments.filter((a) => a.id !== id));
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 border-t border-[var(--gold-light)] pt-3">
      {attachments.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {attachments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <a
                href={`/api/account/attachments?id=${encodeURIComponent(a.id)}`}
                target="_blank"
                rel="noreferrer noopener"
                className="min-w-0 font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2"
              >
                <span aria-hidden="true">📎</span> {KIND_LABELS[a.kind as AttachmentKind]?.label ?? "File"} — {a.name}
              </a>
              <span className="flex items-center gap-2 text-stone-400">
                <span>{describeSize(a.bytes)}</span>
                {/* Look at it without leaving the trip. Only a photo or a PDF
                    has anything to show in a panel; anything else keeps its
                    download link and no eye. */}
                {opensInTheBrowser(a.contentType) && (
                  <PreviewDialog label={`Preview ${a.name}`} title={a.name}>
                    {a.contentType.startsWith("image/") ? (
                      /* eslint-disable-next-line @next/next/no-img-element -- an
                         account-scoped attachment served by our own route, not a
                         fixed-size asset next/image can optimise. */
                      <img
                        src={`/api/account/attachments?id=${encodeURIComponent(a.id)}`}
                        alt={a.name}
                        className="mx-auto max-h-[70vh] w-auto max-w-full"
                      />
                    ) : (
                      <object
                        data={`/api/account/attachments?id=${encodeURIComponent(a.id)}`}
                        type="application/pdf"
                        aria-label={a.name}
                        className="h-[70vh] w-full"
                      >
                        <p className="text-sm leading-6 text-stone-600">
                          This browser will not show the PDF here.{" "}
                          <a
                            href={`/api/account/attachments?id=${encodeURIComponent(a.id)}`}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="font-semibold underline"
                          >
                            Open it in a new tab
                          </a>
                          .
                        </p>
                      </object>
                    )}
                  </PreviewDialog>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(a.id)}
                  className="text-stone-400 transition hover:text-red-700 disabled:opacity-60"
                >
                  Take off
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--gold-ink)] transition hover:text-[var(--navy)]"
        >
          + Boarding pass or ticket
        </button>
      ) : !signedIn ? (
        <p className="text-xs leading-5 text-stone-600">
          Keeping a boarding pass with your trip needs an account — there is nowhere else to put it that survives
          closing the browser.{" "}
          <Link href="/login" className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">
            Sign in
          </Link>{" "}
          and it will be here.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="attachment-kind">
              Kind of file
            </label>
            <select
              id="attachment-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as AttachmentKind)}
              className="min-h-11 rounded-md border border-[var(--gold-light)] bg-white px-2 text-xs text-[var(--navy)]"
            >
              {ATTACHMENT_KINDS.map((value) => (
                <option key={value} value={value}>
                  {KIND_LABELS[value].label}
                </option>
              ))}
            </select>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              disabled={busy || attachments.length >= MAX_PER_ITEM}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
              className="text-xs text-stone-600 file:mr-2 file:min-h-11 file:rounded-full file:border file:border-[var(--gold-light)] file:bg-white file:px-3.5 file:text-xs file:font-bold file:text-[var(--navy)]"
            />
            <button type="button" onClick={() => setOpen(false)} className={smallButton}>
              Cancel
            </button>
          </div>
          <p className="text-xs leading-5 text-stone-500">
            {KIND_LABELS[kind].hint} PDF or a picture, up to {describeSize(MAX_ATTACHMENT_BYTES)}. Only you can open
            it — it is never in a shared link or the printed copy.{" "}
            <strong className="font-semibold text-stone-600">Not for passports or identity documents.</strong>
          </p>
          {busy && <p className="text-xs font-semibold text-[var(--navy)]">Keeping it…</p>}
        </div>
      )}

      {error && <p className="mt-2 text-xs font-semibold text-red-700">{error}</p>}
    </div>
  );
}
