// Reading an editable page.
//
// Every read FAILS SAFE. With no DATABASE_URL, an unreachable database, a page
// never edited, or a stored draft rather than a published version, the page
// renders the built-in blocks from data/pages.ts — which are the page exactly
// as it ships. A visitor can never see a blank page because an edit went wrong.

import { editablePages, getPageDef, type PageDef } from "@/data/pages";
import { parseBlocks, type PageBlock } from "@/data/page-blocks";

const DB_ENABLED = Boolean(process.env.DATABASE_URL);

type PublishedPageRow = {
  slug: string;
  title: string;
  body: string;
  blocks: unknown;
  seoTitle: string;
  seoDescription: string;
};

/**
 * Every published page, read in one query and cached until a page is saved.
 *
 * The legal pages, Contact and About are rendered on every visit, and each
 * used to ask the database for its own row each time — enough on its own to
 * keep a free-plan database from ever sleeping. One cached read serves them
 * all; saving any page clears it (lib/prisma.ts busts DB_CONTENT_TAG on writes).
 * Throws on failure so an outage is not remembered: the callers fall back.
 */
async function publishedPages(): Promise<Map<string, PublishedPageRow>> {
  const { cachedRead } = await import("@/lib/cache-tags");
  const rows = await cachedRead(
    async () => {
      const { prisma } = await import("@/lib/prisma");
      return prisma.page.findMany({
        where: { status: "PUBLISHED" },
        select: { slug: true, title: true, body: true, blocks: true, seoTitle: true, seoDescription: true },
      });
    },
    ["published-pages"],
    ["published-pages"],
  );
  return new Map(rows.map((row) => [row.slug, row as PublishedPageRow]));
}

const PREDEFINED_SLUGS = new Set(editablePages.map((p) => p.slug));

export type ResolvedPage = {
  slug: string;
  href: string;
  label: string;
  seoTitle: string;
  seoDescription: string;
  blocks: PageBlock[];
  /** True when the owner's own version is being shown rather than the built-in one. */
  edited: boolean;
};

function fromDef(def: PageDef): ResolvedPage {
  return {
    slug: def.slug,
    href: def.href,
    label: def.label,
    seoTitle: def.seoTitle,
    seoDescription: def.seoDescription,
    blocks: def.blocks,
    edited: false,
  };
}

/** One page for the public site. Null only for a slug that is not editable. */
export async function resolvePage(slug: string): Promise<ResolvedPage | null> {
  const def = getPageDef(slug);
  if (!def) return null;
  if (!DB_ENABLED) return fromDef(def);
  try {
    const row = (await publishedPages()).get(slug);
    if (!row) return fromDef(def);
    const blocks = parseBlocks(row.blocks);
    return {
      slug,
      href: def.href,
      label: def.label,
      seoTitle: row.seoTitle || def.seoTitle,
      seoDescription: row.seoDescription || def.seoDescription,
      blocks: blocks ?? def.blocks,
      edited: Boolean(blocks),
    };
  } catch (error) {
    console.error("[pages] read failed for", slug, "— showing the built-in version", error);
    return fromDef(def);
  }
}

export type AdminPageRow = {
  slug: string;
  href: string;
  label: string;
  title: string;
  status: "PUBLISHED" | "DRAFT" | "NEEDS_REVIEW";
  updatedAt: string | null;
  edited: boolean;
};

/** The heading a page is showing, for the admin list. */
function headingOf(blocks: PageBlock[], fallback: string): string {
  const hero = blocks.find((b) => b.kind === "hero");
  return (hero && hero.kind === "hero" && hero.heading) || fallback;
}

/** Every editable page, with any stored version layered over the built-in one. */
export async function listPagesForAdmin(): Promise<AdminPageRow[]> {
  const base = (def: PageDef): AdminPageRow => ({
    slug: def.slug,
    href: def.href,
    label: def.label,
    title: headingOf(def.blocks, def.label),
    status: "PUBLISHED",
    updatedAt: null,
    edited: false,
  });

  if (!DB_ENABLED) return editablePages.map(base);
  try {
    const { prisma } = await import("@/lib/prisma");
    const rows = await prisma.page.findMany();
    const bySlug = new Map(rows.map((r) => [r.slug, r]));
    return editablePages.map((def) => {
      const row = bySlug.get(def.slug);
      if (!row) return base(def);
      const blocks = parseBlocks(row.blocks);
      return {
        slug: def.slug,
        href: def.href,
        label: def.label,
        title: headingOf(blocks ?? def.blocks, def.label),
        status: (row.status ?? "PUBLISHED") as AdminPageRow["status"],
        updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
        edited: Boolean(blocks),
      };
    });
  } catch {
    return editablePages.map(base);
  }
}

/** One page for the editor — the stored version if there is one, else the built-in. */
export async function getPageForAdmin(
  slug: string,
): Promise<(ResolvedPage & { status: AdminPageRow["status"] }) | null> {
  const def = getPageDef(slug);
  if (!def) return null;
  const fallback = { ...fromDef(def), status: "PUBLISHED" as const };
  if (!DB_ENABLED) return fallback;
  try {
    const { prisma } = await import("@/lib/prisma");
    const row = await prisma.page.findUnique({ where: { slug } });
    if (!row) return fallback;
    const blocks = parseBlocks(row.blocks);
    return {
      slug,
      href: def.href,
      label: def.label,
      seoTitle: row.seoTitle || def.seoTitle,
      seoDescription: row.seoDescription || def.seoDescription,
      blocks: blocks ?? def.blocks,
      edited: Boolean(blocks),
      status: (row.status ?? "PUBLISHED") as AdminPageRow["status"],
    };
  } catch {
    return fallback;
  }
}

/** A standalone, owner-created info page (rendered at /info/[slug]). */
export async function getInfoPage(slug: string): Promise<{ slug: string; title: string; body: string } | null> {
  if (!DB_ENABLED || PREDEFINED_SLUGS.has(slug)) return null;
  try {
    const row = (await publishedPages()).get(slug);
    if (!row) return null;
    return { slug: row.slug, title: row.title, body: row.body };
  } catch {
    return null;
  }
}

/** All owner-created info pages (Page rows that aren't predefined pages). */
export async function listInfoPages() {
  if (!DB_ENABLED) return [] as Array<{ slug: string; title: string; status: string }>;
  try {
    const { prisma } = await import("@/lib/prisma");
    const rows = await prisma.page.findMany({ orderBy: { updatedAt: "desc" } });
    return rows
      .filter((row) => !PREDEFINED_SLUGS.has(row.slug))
      .map((row) => ({ slug: row.slug, title: row.title, status: row.status as string }));
  } catch {
    return [];
  }
}
