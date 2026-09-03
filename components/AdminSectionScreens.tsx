"use client";

import { usePathname } from "next/navigation";
import AdminNavLink from "@/components/AdminNavLink";
import { ADMIN_SECTIONS, sectionScreens, toAdminPath } from "@/lib/admin-nav";

/**
 * Every screen in this section, as a grid on the section’s hub.
 *
 * Left nav lists every screen in every section, so a page is not only a
 * typed URL. The hub repeats the same list as a grid.
 */
export default function AdminSectionScreens({ sectionHref }: { sectionHref: string }) {
  const pathname = usePathname();
  const here = toAdminPath(pathname);
  const section = ADMIN_SECTIONS.find((item) => item.href === sectionHref);
  const screens = sectionScreens(sectionHref);
  if (!section || screens.length === 0) return null;

  return (
    <nav aria-label={`${section.label} screens`} className="mt-6">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">In this section</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {screens.map((child) => {
          const current = here === child.href || here.startsWith(`${child.href}/`);
          return (
            <li key={child.href}>
              <AdminNavLink
                href={child.href}
                aria-current={current ? "page" : undefined}
                className={`flex flex-col rounded-lg border px-4 py-3 transition ${
                  current
                    ? "border-[var(--navy)] bg-[var(--navy)] text-white"
                    : "border-[var(--gold-light)] bg-[#FAF8F3] hover:border-[var(--gold)]"
                }`}
              >
                <span className={`block text-sm font-semibold ${current ? "text-white" : "text-[var(--navy)]"}`}>{child.label}</span>
                <span className={`mt-1 block text-xs leading-5 ${current ? "text-stone-200" : "text-stone-500"}`}>{child.blurb}</span>
              </AdminNavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
