"use client";

import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { IconButton } from "@/components/icons/IconAction";
import { useFocusTrap } from "@/components/useFocusTrap";

/**
 * ONE PREVIEW, EVERYWHERE — the eye, and the panel it opens.
 *
 * The builder had four different ways to see what a traveller sees and no two
 * behaved alike: an inline expanding panel with text buttons, a "Preview as
 * client" that CREATED A SHARE LINK and opened a new tab, a set of radio tabs,
 * and an attachment list whose only option was target="_blank". So "let me
 * look at this" meant learning a different control in each place, and one of
 * them had a side effect.
 *
 * THIS ONE NEVER CHANGES ANYTHING. It opens a panel over the page, shows the
 * content, and closes. It does not save, publish, share, mint a token or
 * navigate — a control called Preview that quietly shares a trip is the worst
 * kind of surprise, and that is exactly what the old proposal preview did.
 *
 * IT DOES NOT OPEN A TAB. Everything is rendered in place, so the planner
 * keeps their scroll position and their half-finished form.
 *
 * REACHABLE THE SAME WAY BY EVERYONE. A real <button> with an accessible name,
 * a 44x44 target on a phone, a visible focus ring, Escape to close on a
 * keyboard, a visible Close button for everybody, and focus handed back to the
 * eye that opened it. Hover is not a way in anywhere, because hover is not a
 * thing a phone or a keyboard has.
 */
export function PreviewDialog({
  label,
  title,
  children,
  className = "",
}: {
  /** What is being previewed — "Preview day 3", "Preview this photo". */
  label: string;
  /** The heading inside the panel. Defaults to the label. */
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();

  // Focus goes back to the eye that opened this, not to the top of the page.
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const dialogRef = useFocusTrap<HTMLDivElement>(open, close);

  return (
    <>
      <IconButton
        ref={triggerRef}
        icon="eye"
        label={label}
        onClick={() => setOpen(true)}
        className={className}
      />

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
          // A click on the backdrop closes, the same as Escape. The panel
          // itself stops the click so a click inside never closes it.
          onClick={close}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-[var(--cream)] shadow-xl sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--gold-light)] px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">
                  What your traveller sees
                </p>
                <h2 id={headingId} className="mt-0.5 text-lg font-bold text-[var(--navy)]">
                  {title || label}
                </h2>
              </div>
              {/* A visible Close, not only Escape — Escape is not something a
                  phone offers, and not something every reader knows about. */}
              <button
                type="button"
                onClick={close}
                className="inline-flex min-h-11 shrink-0 items-center rounded-md border border-[var(--gold-light)] bg-white px-4 text-sm font-semibold text-[var(--navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
              >
                Close
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-5">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
