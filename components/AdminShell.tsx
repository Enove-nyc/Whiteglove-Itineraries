"use client";

import Link from "next/link";
import { CANONICAL_ORIGIN } from "@/lib/canonical-origin";
import { usePathname } from "next/navigation";
import { useState } from "react";
import AdminSearch from "@/components/AdminSearch";
import AdminTrail from "@/components/AdminTrail";
import { ADMIN_SECTIONS, activeSection, adminHref, toAdminPath } from "@/lib/admin-nav";
import { type AdminArea, canOpen } from "@/lib/admin-permissions";

/**
 * The frame every admin screen sits in.
 *
 * Five places down the left, every screen under each of them listed so a
 * page is one click away without already knowing which section holds it, and
 * a search box for listings, candidates and screens. No visitor navigation
 * and no public footer — this is a workplace, not a page of the website.
 *
 * On a phone the nav collapses to a button; the content is what matters on a
 * small screen, and the nav is one tap away.
 *
 * `areas` narrows all of that to what this person may open — `null` for the
 * owner and anyone unrestricted, which is everybody until somebody is
 * deliberately narrowed. Hiding is not the protection; the gate in each area's
 * folder is. This only stops a helper being shown doors that refuse them.
 */
export default function AdminShell({ areas = null, children }: { areas?: AdminArea[] | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  // The login screen is its own thing — no nav, nothing to navigate to.
  // On the admin hostname the bare path is the screen, so the path the browser
  // reports and the paths written in lib/admin-nav.ts are not the same string.
  // Everything that compares the two uses the canonical form; everything that
  // WRITES a link uses adminHref, so the links read the way the hostname does.
  const here = toAdminPath(pathname);
  const to = (href: string) => adminHref(href, pathname);

  if (here === "/admin/login") return <>{children}</>;

  const section = activeSection(here);

  // A section survives if its own front page is open to this person or any
  // screen inside it is. Settings is the case that matters: somebody given
  // only the money area may open Finances, which lives under Settings, while
  // the settings front page itself is closed to them — so the section is
  // listed and points at the screen they can actually use rather than at a
  // refusal.
  const groupHrefs = new Set(["/admin", "/admin/pages", "/admin/directory", "/admin/advertisements", "/admin/settings"]);
  const promoted = new Set(ADMIN_SECTIONS.filter((s) => !groupHrefs.has(s.href)).map((s) => s.href));
  const sections = ADMIN_SECTIONS.map((s) => {
    const children = (s.children ?? []).filter((c) => canOpen(areas, c.href) && !promoted.has(c.href));
    const own = canOpen(areas, s.href);
    if (!own && !children.length) return null;
    return { ...s, target: own ? s.href : children[0].href, children };
  }).filter((s) => s !== null);

  const navLinks = (
    <nav aria-label="Admin sections" className="space-y-1">
      {sections.map((s) => {
        const current = s.href === section.href;
        return (
          <div key={s.href}>
            <Link
              href={to(s.target)}
              onClick={() => setNavOpen(false)}
              aria-current={current ? "page" : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 transition ${
                current ? "bg-[var(--navy)] text-white" : "text-[var(--navy)] hover:bg-[var(--cream-deep)]"
              }`}
            >
              <span aria-hidden="true" className={current ? "text-[var(--gold-light)]" : "text-[var(--gold-ink)]"}>
                {s.icon}
              </span>
              <span className="block min-w-0 text-sm font-semibold">{s.label}</span>
            </Link>

            {s.children.length > 1 && (
              <ul className="mb-2 ml-6 mt-1 space-y-0.5 border-l border-[var(--gold-light)] pl-3">
                {s.children.map((c) => (
                  <li key={c.href}>
                    <Link
                      href={to(c.href)}
                      onClick={() => setNavOpen(false)}
                      aria-current={here === c.href ? "page" : undefined}
                      className={`block rounded px-2 py-1.5 text-sm transition ${
                        here === c.href
                          ? "font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4"
                          : "text-stone-600 hover:text-[var(--navy)]"
                      }`}
                    >
                      {c.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    // wg-admin scopes the control-sizing rule in globals.css. The admin is
    // dozens of screens built at different times; sizing them one by one is
    // how three of them end up at 42px again next month.
    <div className="wg-admin min-h-screen bg-[var(--cream)]">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:border focus:border-[var(--navy)] focus:bg-white focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to the page
      </a>

      <header className="sticky top-0 z-30 border-b border-[var(--gold-light)] bg-[#FAF8F3]">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setNavOpen((v) => !v)}
            aria-expanded={navOpen}
            aria-controls="admin-nav"
            className="min-h-11 rounded-md border border-[var(--gold-light)] px-3 text-sm text-[var(--navy)] lg:hidden"
          >
            {navOpen ? "Close" : "Menu"}
          </button>

          <Link href={to("/admin")} className="inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-[0.18em] text-[var(--navy)]">
            White Glove
          </Link>
          <span aria-hidden="true" className="hidden text-[var(--gold-light)] sm:inline">
            /
          </span>
          <span className="hidden text-xs font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)] sm:inline">
            {section.label}
          </span>

          <AdminSearch areas={areas} pathname={pathname} />

          <a
            href={CANONICAL_ORIGIN}
            className="hidden text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4 sm:inline"
          >
            View site
          </a>
        </div>
      </header>

      {/* Where you are, where you have been, and the thing you probably
          came to add. Under the header so it is on every screen without
          each screen having to remember to draw it. */}
      <AdminTrail areas={areas} />

      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-6 sm:px-6">
        <aside
          id="admin-nav"
          className={`${navOpen ? "block" : "hidden"} w-full shrink-0 lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:w-64 lg:overflow-y-auto`}
        >
          {navLinks}
        </aside>

        <main id="admin-main" className={`min-w-0 flex-1 ${navOpen ? "hidden lg:block" : "block"}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
