"use client";

import { useCallback, useEffect, useState } from "react";
import { useFocusTrap } from "@/components/useFocusTrap";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons/Icon";
import { IconButton } from "@/components/icons/IconAction";
import type { Promotion } from "@/lib/admin-content";

type PromoSet = { topBanner: Promotion | null; popup: Promotion | null; bottomBanner: Promotion | null };

// The popup used to open on top of the first paint, before the visitor had
// seen a single destination. Now it waits for a sign they have settled in:
// twelve seconds on the page, or the first scroll past the fold — whichever
// comes first. Nothing else may open it.
const POPUP_DELAY_MS = 12_000;
const POPUP_SCROLL_PX = 600;

function track(type: "promotion_view" | "promotion_click", id: string, placement: string) {
  void fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, id, value: placement }),
    keepalive: true,
  }).catch(() => undefined);
}

// A visitor may only see a promotion up to maxViewsPerVisitor times per day
// (0 = unlimited). Returns true if it may still be shown.
function underDailyCap(promo: Promotion): boolean {
  if (!promo.maxViewsPerVisitor || promo.maxViewsPerVisitor <= 0) return true;
  try {
    const key = `wg-promo:${promo.id}:${new Date().toISOString().slice(0, 10)}`;
    return Number(localStorage.getItem(key) || "0") < promo.maxViewsPerVisitor;
  } catch {
    return true;
  }
}

function recordView(promo: Promotion) {
  if (!promo.maxViewsPerVisitor || promo.maxViewsPerVisitor <= 0) return;
  try {
    const key = `wg-promo:${promo.id}:${new Date().toISOString().slice(0, 10)}`;
    localStorage.setItem(key, String(Number(localStorage.getItem(key) || "0") + 1));
  } catch {
    /* ignore */
  }
}

export default function SitePromotions() {
  const pathname = usePathname();
  const [promos, setPromos] = useState<PromoSet>({ topBanner: null, popup: null, bottomBanner: null });
  const [closedTop, setClosedTop] = useState(false);
  const [closedBottom, setClosedBottom] = useState(false);
  // A qualifying popup (once per session, under its daily cap) is armed here
  // and only shown once the gate below opens. Arming is not showing: nothing
  // is marked seen or counted until the visitor actually sees it.
  const [armedPopup, setArmedPopup] = useState<Promotion | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  // The sponsored popup covers the page, so it has to behave like a dialog:
  // the keyboard stays inside it, Escape dismisses it, and focus goes back to
  // where it was. Before this, Tab walked straight out onto the page behind.
  const closePopup = useCallback(() => setShowPopup(false), []);
  const popupRef = useFocusTrap<HTMLDivElement>(showPopup, closePopup);

  // Don't run promotions inside the admin area or the access gate.
  const suppressed = pathname.startsWith("/admin") || pathname.startsWith("/access");

  // Navigating re-opens dismissed banners and disarms the popup — a reset
  // triggered by a changed prop (the route), done during render per React's
  // own guidance, the same as Navbar closes its dropdowns. In a useEffect it
  // was a cascading render and a lint error.
  const [trackedPathname, setTrackedPathname] = useState(pathname);
  if (trackedPathname !== pathname) {
    setTrackedPathname(pathname);
    setClosedTop(false);
    setClosedBottom(false);
    setArmedPopup(null);
    setShowPopup(false);
  }

  useEffect(() => {
    if (suppressed) return;
    let active = true;
    fetch(`/api/promotions?path=${encodeURIComponent(pathname)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: PromoSet) => {
        if (!active) return;
        setPromos(data);
        // Popup: once per session per promotion, honoring the daily cap. It
        // is only armed here; the gate effect decides when it appears.
        if (data.popup && underDailyCap(data.popup)) {
          const seenKey = `wg-popup-seen:${data.popup.id}`;
          let seen = false;
          try {
            seen = sessionStorage.getItem(seenKey) === "1";
          } catch {
            /* ignore */
          }
          if (!seen) setArmedPopup(data.popup);
        }
        if (data.topBanner) track("promotion_view", data.topBanner.id, "fixed-top-banner");
        if (data.bottomBanner) track("promotion_view", data.bottomBanner.id, "sticky-bottom-banner");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [pathname, suppressed]);

  // The gate. The seen-marker, the daily-cap count and the impression are all
  // recorded here, at the moment the popup is actually on screen — recording
  // them at fetch time counted views nobody had.
  useEffect(() => {
    if (!armedPopup || showPopup) return;
    const promo = armedPopup;
    function reveal() {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      try {
        sessionStorage.setItem(`wg-popup-seen:${promo.id}`, "1");
      } catch {
        /* ignore */
      }
      recordView(promo);
      track("promotion_view", promo.id, "popup");
      // Disarm before showing so closing the popup cannot restart the gate.
      setArmedPopup(null);
      setShowPopup(true);
    }
    function onScroll() {
      if (window.scrollY > POPUP_SCROLL_PX) reveal();
    }
    const timer = window.setTimeout(reveal, POPUP_DELAY_MS);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [armedPopup, showPopup]);

  if (suppressed) return null;

  const { topBanner, popup, bottomBanner } = promos;

  return (
    <>
      {/* Thin fixed banner, directly under the header */}
      {topBanner && !closedTop && (
        <div className="relative z-[var(--wg-z-ad)] w-full border-b border-[var(--gold-light)] bg-[var(--navy)] text-[var(--cream)]">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 sm:px-8">
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--gold-light)]">Sponsored</span>
            <p className="min-w-0 flex-1 truncate text-sm">
              <span className="font-semibold">{topBanner.title}</span>
              {topBanner.description ? <span className="hidden text-slate-300 sm:inline"> — {topBanner.description}</span> : null}
            </p>
            {topBanner.buttonText && (
              <a
                href={topBanner.targetHref}
                onClick={() => track("promotion_click", topBanner.id, "fixed-top-banner")}
                className="shrink-0 border border-[var(--gold-light)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-white transition hover:bg-[var(--gold)] hover:text-[var(--navy)]"
              >
                {topBanner.buttonText}
              </a>
            )}
            {/* On the navy bar IconButton's navy-on-cream colors would vanish,
                so this one is inline: same 44px target, same label + title. */}
            <button
              type="button"
              onClick={() => setClosedTop(true)}
              aria-label="Dismiss"
              title="Dismiss"
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-slate-300 transition hover:text-white"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Entry popup — the creative leads, the words stay short */}
      {popup && showPopup && (
        <div className="fixed inset-0 z-[var(--wg-z-modal)] flex items-center justify-center bg-stone-950/60 px-5 py-8" role="dialog" aria-modal="true" aria-labelledby="promo-popup-title">
          <div ref={popupRef} tabIndex={-1} className="w-full max-w-md overflow-hidden rounded-md border border-[var(--gold-light)] border-t-2 border-t-[var(--gold)] bg-[var(--cream)] shadow-2xl outline-none">
            <div className="flex items-center justify-between gap-4 px-5 pt-3 sm:px-6">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--gold-ink)]">Sponsored</p>
              <IconButton icon="close" label="Close" onClick={closePopup} className="-mr-2" />
            </div>
            {popup.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- an advertiser's remote creative, size unknown
              <img src={popup.imageUrl} alt="" className="mt-2 max-h-72 w-full object-cover" />
            ) : null}
            <div className="px-5 pb-6 sm:px-6">
              <h2 id="promo-popup-title" className="mt-4 font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]">{popup.title}</h2>
              {popup.description && <p className="mt-2 line-clamp-2 text-sm leading-6 text-stone-600">{popup.description}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {popup.buttonText && (
                  <a href={popup.targetHref} onClick={() => track("promotion_click", popup.id, "popup")} className="border border-[var(--gold)] bg-[var(--navy)] px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--gold)]">
                    {popup.buttonText}
                  </a>
                )}
                {popup.pdfUrl ? (
                  <a href={popup.pdfUrl} target="_blank" rel="noreferrer" onClick={() => track("promotion_click", popup.id, "popup")} className="border border-[var(--gold-light)] px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-[var(--navy)]">View PDF</a>
                ) : null}
                <button type="button" onClick={closePopup} className="inline-flex min-h-11 items-center text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 underline decoration-stone-400 underline-offset-4">No thanks</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sticky bottom banner */}
      {bottomBanner && !closedBottom && (
        <div className="fixed inset-x-0 bottom-14 z-[var(--wg-z-ad)] border-t-2 border-t-[var(--gold)] bg-[#FAF8F3] shadow-[0_-6px_20px_rgba(16, 47, 53,0.08)] sm:bottom-0">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-8">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Sponsored</p>
              <p className="truncate text-sm text-[var(--navy)]"><span className="font-semibold">{bottomBanner.title}</span>{bottomBanner.description ? <span className="hidden text-stone-500 sm:inline"> — {bottomBanner.description}</span> : null}</p>
            </div>
            {bottomBanner.buttonText && (
              <a href={bottomBanner.targetHref} onClick={() => track("promotion_click", bottomBanner.id, "sticky-bottom-banner")} className="shrink-0 border border-[var(--gold)] bg-[var(--navy)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-white transition hover:bg-[var(--gold)]">
                {bottomBanner.buttonText}
              </a>
            )}
            <IconButton icon="close" label="Dismiss" onClick={() => setClosedBottom(true)} className="shrink-0" />
          </div>
        </div>
      )}
    </>
  );
}
