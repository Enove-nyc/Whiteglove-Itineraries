"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AdminPageRow } from "@/lib/pages";

// Every page you can edit, in one list you can search.

const STATUS_TONE: Record<string, string> = {
  PUBLISHED: "bg-emerald-100 text-emerald-900",
  DRAFT: "bg-stone-200 text-stone-700",
  NEEDS_REVIEW: "bg-amber-100 text-amber-900",
};

const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: "Live",
  DRAFT: "Draft",
  NEEDS_REVIEW: "Needs review",
};

function when(iso: string | null): string {
  if (!iso) return "Never edited";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never edited";
  return `Edited ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

export default function PageList({ pages }: { pages: AdminPageRow[] }) {
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<"all" | "PUBLISHED" | "DRAFT">("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pages.filter((p) => {
      if (only !== "all" && p.status !== only) return false;
      if (!q) return true;
      return `${p.label} ${p.title} ${p.href}`.toLowerCase().includes(q);
    });
  }, [pages, query, only]);

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Find a page</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a page name or address"
            className="mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-[#FAF8F3] px-3 py-2.5 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Show</span>
          <select
            value={only}
            onChange={(e) => setOnly(e.target.value as typeof only)}
            className="mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-[#FAF8F3] px-3 py-2.5 text-sm text-[var(--navy)]"
          >
            <option value="all">Every page</option>
            <option value="PUBLISHED">Live pages</option>
            <option value="DRAFT">Drafts</option>
          </select>
        </label>
      </div>

      <p className="mt-3 text-sm text-stone-500">
        {rows.length === pages.length ? `${pages.length} pages` : `${rows.length} of ${pages.length} pages`}
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 border border-dashed border-[var(--gold-light)] p-8 text-center text-sm text-stone-600">
          Nothing matches that.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-[var(--gold-light)] border border-[var(--gold-light)] bg-[#FAF8F3]">
          {rows.map((page) => (
            <li key={page.slug} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--navy)]">
                  {page.title}
                </p>
                <p className="mt-1 text-sm text-stone-500">
                  {page.href} · {when(page.updatedAt)}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] ${STATUS_TONE[page.status]}`}>
                  {STATUS_LABEL[page.status]}
                </span>
                <Link
                  href={`/admin/pages?slug=${page.slug}`}
                  className="min-h-[36px] border border-[var(--navy)] bg-[var(--navy)] px-4 text-[11px] font-bold uppercase leading-9 tracking-[0.1em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]"
                >
                  Edit
                </Link>
                <a
                  href={page.href}
                  target="_blank"
                  rel="noreferrer"
                  className="min-h-[36px] border border-[var(--gold-light)] px-4 text-[11px] font-bold uppercase leading-9 tracking-[0.1em] text-[var(--navy)] transition hover:border-[var(--gold)]"
                >
                  View live
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
