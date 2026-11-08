"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useFocusTrap } from "@/components/useFocusTrap";

/**
 * ASKING "ARE YOU SURE" WITHOUT window.confirm.
 *
 * A pre-launch walkthrough reported that Delete on a trip "does nothing: no
 * dialog, no deletion", and the handler behind it was correct — clicked cold
 * it asks, deletes, and the row goes. The dialog was the part that failed.
 *
 * `window.confirm` is the browser's, not ours, and the browser is allowed to
 * stop showing it. Chrome offers "prevent this page from creating additional
 * dialogs" the moment a page opens a second one in quick succession, and once
 * that is ticked every later confirm() returns FALSE with nothing drawn — for
 * the life of that tab. The code then reads a decline the person never made.
 * A walkthrough that deletes a few things in a row is exactly how somebody
 * ticks it, and after that every destructive button on the site is dead and
 * silent. It is also blocked outright in a sandboxed frame, and it freezes the
 * page while it is open.
 *
 * So the question is asked in the page. It cannot be suppressed, it says what
 * will happen in the site's own voice rather than the browser's, and — not
 * least — an automated pass can actually press it, which is how this one was
 * checked.
 *
 * CANCEL IS THE FIRST CONTROL IN THE DOM, deliberately. useFocusTrap focuses
 * whatever is first, and on a dialog that is about to delete somebody's trip
 * the safe button is the one that should catch a reflexive Return.
 */
export type ConfirmRequest = {
  /** The question, as a question. "Delete “Rome week”?" */
  title: string;
  /** What it costs. One sentence; shown under the title. */
  body?: string;
  /** The word on the button that goes through with it. Defaults to "Delete". */
  confirmLabel?: string;
  /** Run when they go through with it. */
  onConfirm: () => void;
};

export function useConfirm(): { dialog: ReactNode; ask: (request: ConfirmRequest) => void } {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const close = useCallback(() => setRequest(null), []);
  const ask = useCallback((next: ConfirmRequest) => setRequest(next), []);
  const ref = useFocusTrap<HTMLDivElement>(Boolean(request), close);

  const dialog = request ? (
    <div
      className="fixed inset-0 z-[var(--wg-z-modal,200)] flex items-end justify-center bg-[var(--navy)]/50 p-4 backdrop-blur-[2px] sm:items-center"
      onClick={(event) => {
        // The backdrop cancels; a click inside the box must not.
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wg-confirm-title"
        className="w-full max-w-md rounded-2xl border border-[var(--gold-light)] bg-white p-6 shadow-[0_24px_60px_rgba(16,47,53,.20)]"
      >
        <h2 id="wg-confirm-title" className="font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--navy)]">
          {request.title}
        </h2>
        {request.body && <p className="mt-2 text-sm leading-6 text-stone-600">{request.body}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="min-h-11 rounded-md border border-[var(--gold-light)] px-4 text-xs font-bold uppercase tracking-[0.12em] text-stone-600 transition hover:border-[var(--navy)] hover:text-[var(--navy)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              const go = request.onConfirm;
              close();
              go();
            }}
            className="min-h-11 rounded-md border border-red-700 bg-red-700 px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-red-800 hover:bg-red-800"
          >
            {request.confirmLabel ?? "Delete"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { dialog, ask };
}
