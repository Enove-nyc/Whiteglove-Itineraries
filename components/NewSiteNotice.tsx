"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useState, useSyncExternalStore } from "react";
import { type BetaNotice, DISMISS_KEY, readDismissed, shouldShow, SHOWN_KEY } from "@/lib/beta-notice";
import { useFocusTrap } from "@/components/useFocusTrap";
import { brandForHost, configuredBrand } from "@/lib/site-brand-core";

/**
 * The site notice: one line, and two actions — Verification and Close.
 *
 * The wording lives in lib/beta-notice.ts, with the reasoning. This file owns
 * how it appears: a real dialog (focus trap, Escape, aria-modal), shown once
 * per wording. Once for real — it is marked seen the moment it reveals, not
 * only when Close is pressed, so a visitor who read it and moved on does not
 * meet it again on the next page. A new wording (a bumped version) shows once
 * more; see SHOWN_KEY in lib/beta-notice.ts.
 *
 * IT DOES NOT OPEN ON ARRIVAL. It waits for the same settling-in signal
 * SitePromotions uses: a while on the page, or the first real scroll —
 * whichever comes first. A dialog over the first paint is the site
 * interrupting somebody who has not read a word of it yet.
 */

const UNKNOWN = "unknown";
// Matches SitePromotions' gate: twelve seconds, or scrolling past the fold.
const NOTICE_DELAY_MS = 12_000;
const NOTICE_SCROLL_PX = 600;

function subscribeDismissal(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

// Both remembered facts in one snapshot string: whether this wording was
// dismissed, and whether it has already been shown once. JSON keeps the two
// values apart safely, whatever the owner types as a version.
function dismissalNow(): string {
  try {
    return `known:${JSON.stringify([
      localStorage.getItem(DISMISS_KEY) ?? "",
      localStorage.getItem(SHOWN_KEY) ?? "",
    ])}`;
  } catch {
    // Private browsing with storage blocked. Showing it once here is the safe
    // end of that, and better than never showing it at all.
    return `known:${JSON.stringify(["", ""])}`;
  }
}

/** The [dismissed, shown] versions read back out of a snapshot string. */
function readSnapshot(snapshot: string): { dismissedVersion: string | null; shownVersion: string | null } {
  try {
    const [dismissed, shown] = JSON.parse(snapshot.slice("known:".length)) as [string, string];
    return { dismissedVersion: readDismissed(dismissed), shownVersion: readDismissed(shown) };
  } catch {
    return { dismissedVersion: null, shownVersion: null };
  }
}

export default function NewSiteNotice({ notice }: { notice: BetaNotice }) {
  const path = usePathname() ?? "/";
  const titleId = useId();
  // "Verification" is a kosher-guide page (/verification), a guide-only path
  // that 307-redirects to the kosher domain — following it from inside the
  // installed itineraries app breaks out of it. So the button is kosher-only.
  // Resolved SSR-correct from the build's brand, corrected to the host after
  // mount, the same way the footer and header settle theirs.
  const built = configuredBrand();
  const isItineraries = useSyncExternalStore(
    () => () => {},
    () => brandForHost(window.location.hostname) === "itineraries",
    () => built === "itineraries",
  );
  // Pressed, this visit. Separate from what is stored, so it goes at once
  // rather than waiting for a storage event that never comes in this tab.
  const [answered, setAnswered] = useState(false);
  // The gate: armed on arrival, opened by time or the first real scroll.
  const [revealed, setRevealed] = useState(false);

  // READ AS AN OUTSIDE THING rather than copied into state in an effect.
  // localStorage is not React's, another tab can change it, and the server
  // cannot see it at all — so its answer is UNKNOWN, a real third state.
  // Without it the dialog would flash on for everybody who had already
  // dismissed it, then vanish on hydration.
  const snapshot = useSyncExternalStore(subscribeDismissal, dismissalNow, () => UNKNOWN);
  const known = snapshot !== UNKNOWN;
  const { dismissedVersion, shownVersion } = known
    ? readSnapshot(snapshot)
    : { dismissedVersion: null, shownVersion: null };
  // Would it arm on this page? Off once this wording has been dismissed OR
  // already shown once — the second is what stops it returning on the next
  // page load when the visitor read it but did not press Close.
  const eligibleHere = known && !answered && shouldShow(notice, { dismissedVersion, path });
  // Off once this wording has already been shown once — the marker that stops
  // it returning on the next page load when the visitor read it but did not
  // press Close.
  const canArm = eligibleHere && shownVersion !== notice.version;
  // Once it has revealed this visit it stays open until answered, even though
  // marking it shown flips canArm to false — otherwise recording "seen" would
  // snap the dialog shut in the same instant it opened. It still respects the
  // off switch and the owner's own screens through eligibleHere.
  const open = revealed && eligibleHere;

  // Nothing is shown until the visitor has settled in — NOTICE_DELAY_MS on
  // the page, or the first scroll past NOTICE_SCROLL_PX. It is marked shown at
  // that moment, so it appears once and does not come back.
  useEffect(() => {
    if (!canArm || revealed) return;
    function reveal() {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      try {
        localStorage.setItem(SHOWN_KEY, notice.version);
      } catch {
        /* storage blocked — it will show once more next visit, which is fine */
      }
      setRevealed(true);
    }
    function onScroll() {
      if (window.scrollY > NOTICE_SCROLL_PX) reveal();
    }
    const timer = window.setTimeout(reveal, NOTICE_DELAY_MS);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [canArm, revealed, notice.version]);

  const close = useCallback(() => {
    setAnswered(true);
    try {
      localStorage.setItem(DISMISS_KEY, notice.version);
    } catch {
      /* nothing to do about it */
    }
  }, [notice.version]);

  const dialogRef = useFocusTrap<HTMLDivElement>(open, close);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--wg-z-modal)] flex items-end justify-center bg-[var(--navy)]/50 p-4 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-xl rounded-2xl border border-[var(--gold)] bg-[#fcf6e9] p-5 text-[var(--navy)] shadow-[0_24px_60px_rgba(23,45,82,.28)] outline-none sm:p-7"
      >
        {/* Every field the owner can edit is rendered. A settings screen with a
            line on it that no page shows is the exact failure data/site-words.ts
            was written to end. */}
        <div className="text-sm leading-6">
          <h2 id={titleId} className="font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--navy)] sm:text-2xl">
            {notice.heading}
          </h2>
          <p className="mt-3">{notice.body}</p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {!isItineraries && (
            <Link
              href="/verification"
              // Following the link answers the notice; this component stays
              // mounted across the navigation, so without this the dialog would
              // still be open over the verification page it just linked to.
              onClick={close}
              className="inline-flex min-h-11 items-center rounded-md border border-[var(--gold)] px-4 text-xs font-bold uppercase tracking-[0.1em] transition hover:bg-[var(--gold)] hover:text-white"
            >
              Verification
            </Link>
          )}
          <button
            type="button"
            onClick={close}
            className="inline-flex min-h-11 items-center rounded-md bg-[var(--navy)] px-4 text-xs font-bold uppercase tracking-[0.1em] text-white transition hover:bg-[var(--gold)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
