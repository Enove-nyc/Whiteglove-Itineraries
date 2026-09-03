"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ADMIN_QUICK_ADD, adminBreadcrumbs, adminHref, adminLabelFor, toAdminPath } from "@/lib/admin-nav";
import { type AdminArea, canOpen } from "@/lib/admin-permissions";

/**
 * Where you are, where you have been, and the thing you probably came to add.
 *
 * Three of the four are one strip because they answer the same question —
 * "how do I get to the screen I want without going back to the dashboard and
 * starting again" — and three separate strips would be the navigation problem
 * this is meant to solve.
 *
 * Recently visited, not recently edited. The admin does not record who
 * changed what, so claiming "edited" would be a guess; where you have been is
 * something the browser genuinely knows, and in practice it is the same list.
 */

const RECENT_KEY = "whiteGloveAdminRecent";
const MAX_RECENT = 6;

type Visit = { href: string; label: string };

const NONE: Visit[] = [];
const CHANGED = "whiteglove-admin-recent";

/**
 * Parsed once per distinct stored value.
 *
 * useSyncExternalStore compares snapshots by identity, so parsing afresh on
 * every read would hand React a new array each time and it would re-render
 * forever.
 */
let cache: { raw: string; value: Visit[] } | null = null;

function readRecent(): Visit[] {
  if (typeof window === "undefined") return NONE;
  const raw = localStorage.getItem(RECENT_KEY) || "[]";
  if (cache && cache.raw === raw) return cache.value;
  let value: Visit[] = NONE;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) value = (parsed as Visit[]).filter((v) => v && typeof v.href === "string");
  } catch {
    /* a corrupt entry is an empty list, not a crash */
  }
  cache = { raw, value };
  return value;
}

/**
 * The list is read from storage rather than copied into state.
 *
 * The effect below only WRITES — updating an external system, which is what
 * an effect is for. Copying the result back into state would be the cascading
 * render the lint rule is about, and it is right: the store is the truth and
 * two copies of it can disagree.
 */
function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export default function AdminTrail({ areas = null }: { areas?: AdminArea[] | null }) {
  const pathname = usePathname();
  const here = toAdminPath(pathname);
  const crumbs = adminBreadcrumbs(pathname);
  const stored = useSyncExternalStore(subscribe, readRecent, () => NONE);
  // Never offer the page you are looking at as somewhere to go back to, nor a
  // screen this person may no longer open — the list is the browser's memory
  // and outlives a narrowed grant.
  const recent = stored.filter((visit) => visit.href !== here && canOpen(areas, visit.href)).slice(0, MAX_RECENT);
  const quickAdd = ADMIN_QUICK_ADD.filter((item) => canOpen(areas, item.href));
  const [addOpen, setAddOpen] = useState(false);

  const to = useCallback((href: string) => adminHref(href, pathname), [pathname]);

  useEffect(() => {
    // Record the visit. Writing to storage is updating an external system,
    // which is what an effect is for; the list itself is read back from the
    // store rather than copied into state.
    const label = adminLabelFor(pathname);
    const next = [{ href: here, label }, ...readRecent().filter((v) => v.href !== here)].slice(0, MAX_RECENT + 1);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(CHANGED));
    } catch {
      /* a full or blocked storage is not worth breaking navigation over */
    }
  }, [here, pathname]);

  useEffect(() => {
    if (!addOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAddOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [addOpen]);

  // A crumb this person cannot open stays in the trail — it is still where
  // they are — but it stops being a link, and "back" skips past it to the
  // nearest one that opens. Otherwise a helper on Finances is offered
  // "← Settings", which refuses them.
  const trail = crumbs.map((crumb) => (crumb.href && canOpen(areas, crumb.href) ? crumb : { label: crumb.label }));
  const back = [...trail].slice(0, -1).reverse().find((crumb) => crumb.href) ?? null;

  return (
    <div className="border-b border-[var(--gold-light)] bg-[#FAF8F3]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
        {/* Back. Named, not an arrow — "Back" alone makes somebody guess where
            to, and the browser button already does the unnamed version. */}
        {back?.href && (
          <Link
            href={to(back.href)}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-semibold text-[var(--navy)]"
          >
            <span aria-hidden="true">←</span> {back.label}
          </Link>
        )}

        <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-stone-500">
            {trail.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-2">
                {index > 0 && <span aria-hidden="true" className="text-[var(--gold-light)]">/</span>}
                {crumb.href ? (
                  <Link href={to(crumb.href)} className="inline-flex min-h-11 items-center hover:text-[var(--navy)] hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  // Only the last crumb is the page you are on. An earlier one
                  // without a link is a screen this person may not open, and
                  // claiming it is the current page would be a lie to a screen
                  // reader.
                  <span
                    aria-current={index === trail.length - 1 ? "page" : undefined}
                    className={`inline-flex min-h-11 items-center ${index === trail.length - 1 ? "font-semibold text-[var(--navy)]" : ""}`}
                  >
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <div className={`relative shrink-0 ${quickAdd.length ? "" : "hidden"}`}>
          <button
            type="button"
            onClick={() => setAddOpen((open) => !open)}
            aria-expanded={addOpen}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-[var(--navy)] bg-[var(--navy)] px-4 text-xs font-bold uppercase tracking-[0.1em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]"
          >
            <span aria-hidden="true">+</span> Add
          </button>
          {addOpen && (
            <div className="absolute right-0 top-full z-40 mt-1 w-64 rounded-md border border-[var(--gold)] bg-[#FAF8F3] py-1 shadow-[0_18px_40px_rgba(16, 47, 53,.18)]">
              {quickAdd.map((item) => (
                <Link
                  key={item.href}
                  href={to(item.href)}
                  onClick={() => setAddOpen(false)}
                  className="flex min-h-11 items-center px-4 text-sm text-[var(--navy)] hover:bg-[var(--cream-deep)]"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {recent.length > 0 && (
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-2 sm:px-6">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">Recently visited</span>
          {recent.map((visit) => (
            <Link
              key={visit.href}
              href={to(visit.href)}
              className="inline-flex min-h-11 items-center text-sm text-stone-600 underline decoration-[var(--gold-light)] underline-offset-4 hover:text-[var(--navy)] hover:decoration-[var(--gold)]"
            >
              {visit.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
