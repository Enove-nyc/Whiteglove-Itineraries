// Content-access layer for DB-backed destination content.
//
// Every function here is designed to FAIL SAFE: if DATABASE_URL is not set,
// or the database is unreachable, or the destination isn't in the DB yet,
// it returns null / an empty result. Callers fall back to the existing
// static `data/*.ts` content, so the live site keeps working before Neon is
// connected and automatically upgrades to DB-backed content afterwards.

import type { Contact, Photo, PracticalPlace } from "@prisma/client";
import type { GalleryPhoto } from "@/components/PhotoGallery";
import { isDisallowedImportSource } from "@/lib/bulk-content";
import { optionalRead } from "@/lib/db-optional";

/**
 * One listing, with pictures of that listing.
 *
 * Separate from the town's pictures on purpose. A town photo says what the
 * place looks like; this says what THIS hotel looks like, which is the
 * question somebody choosing between two of them is actually asking.
 */
export type PublicPlace = PracticalPlace & { photos: GalleryPhoto[] };

export type DestinationContent = {
  contacts: Contact[];
  places: PublicPlace[];
  /** Published pictures only — a draft is one nobody has credited yet. */
  photos: Photo[];
  /** Somewhere else worth reading about this town. Owner-managed. */
  links: Array<{ id: string; label: string; url: string; note: string | null }>;
};

import { DESTINATION_SECTIONS } from "@/lib/destination-sections";

const DB_ENABLED = Boolean(process.env.DATABASE_URL);

function isAllowedPublicSource(sourceUrl: string | null): boolean {
  return !isDisallowedImportSource({
    sourceUrl: sourceUrl ?? "",
    sourceName: "",
    attribution: "",
  });
}

// The order and headings come from lib/destination-sections.ts — the same
// list the admin editor offers and the completeness tracker counts.
//
// This used to be a fourth copy with seven entries, and groupPlacesByCategory
// filters to it: a hospital or a Shabbos note recorded in the admin was
// silently dropped on the way to the page. Nobody would have seen an error;
// the section simply would not have been there.
export const PLACE_CATEGORY_ORDER = DESTINATION_SECTIONS.map((section) => section.key);

export const PLACE_CATEGORY_LABELS: Record<string, { english: string; yiddish?: string }> = Object.fromEntries(
  DESTINATION_SECTIONS.map((section) => [section.key, { english: section.label, yiddish: section.yiddish }]),
);

/**
 * Published contacts + practical places for one destination slug.
 * Returns null when the DB is off/unreachable or the slug isn't stored yet.
 */
/**
 * Everything the public town pages need, read in one go and cached until the
 * database is next written to.
 *
 * WHY ONE READ. There are hundreds of town pages and search engines walk all of
 * them, day and night. When each page read its own rows, every page refresh was
 * a database query, a query arrived every few minutes, and the free-plan
 * database (which only stops counting after five idle minutes) never slept. In
 * October 2026 that used the month's compute allowance. The whole published set
 * is a few hundred kilobytes, so it is cheaper to read it once and share it.
 *
 * Edits still show at once: lib/prisma.ts clears DB_CONTENT_TAG on any write.
 */
type ContentBundle = {
  slugs: Record<string, string>; // slug -> destination id
  contacts: Contact[];
  places: PracticalPlace[];
  photos: Photo[];
  links: Array<{ id: string; label: string; url: string; note: string | null; destinationId: string }>;
};

/** A read that worked but lost an optional part. Thrown so it is not cached for a day. */
class PartialContent extends Error {
  constructor(readonly bundle: ContentBundle) {
    super("part of the published content could not be read");
  }
}

async function loadContentBundle(): Promise<ContentBundle> {
  const { prisma } = await import("@/lib/prisma");
  let partial = false;
  const optional = async <T,>(what: string, read: () => Promise<T>, fallback: T): Promise<T> => {
    const marker = Symbol("failed");
    const value = await optionalRead<T | typeof marker>(what, read, marker);
    if (value === marker) {
      partial = true;
      return fallback;
    }
    return value as T;
  };

  const destinations = await prisma.destination.findMany({ select: { id: true, slug: true } });
  const baseContacts = await prisma.contact.findMany({
    where: { destinationId: { not: null } },
    orderBy: { label: "asc" },
    select: {
      id: true,
      label: true,
      phone: true,
      email: true,
      note: true,
      source: true,
      status: true,
      destinationId: true,
      cemeteryId: true,
    },
  });
  const places = await prisma.practicalPlace.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  const photos = await optional(
    "pictures for the town pages",
    () =>
      prisma.photo.findMany({
        where: { status: "PUBLISHED", OR: [{ destinationId: { not: null } }, { placeId: { not: null } }] },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
    [] as Photo[],
  );
  const contactDates = await optional(
    "contact dates for the town pages",
    () =>
      prisma.contact.findMany({
        where: { destinationId: { not: null } },
        select: { id: true, lastVerified: true },
      }),
    [] as Array<{ id: string; lastVerified: Date | null }>,
  );
  const contactNames = await optional(
    "names on the contacts for the town pages",
    () =>
      prisma.contact.findMany({
        where: { destinationId: { not: null } },
        select: { id: true, name: true },
      }),
    [] as Array<{ id: string; name: string | null }>,
  );
  const links = await optional(
    "useful links for the town pages",
    () =>
      prisma.destinationLink.findMany({
        where: { status: "PUBLISHED" },
        orderBy: [{ position: "asc" }, { label: "asc" }],
        select: { id: true, label: true, url: true, note: true, destinationId: true },
      }),
    [] as ContentBundle["links"],
  );

  const checkedById = new Map(contactDates.map((row) => [row.id, row.lastVerified]));
  const nameById = new Map(contactNames.map((row) => [row.id, row.name]));
  const bundle: ContentBundle = {
    slugs: Object.fromEntries(destinations.map((d) => [d.slug, d.id])),
    contacts: baseContacts.map((contact) => ({
      ...contact,
      name: nameById.get(contact.id) ?? null,
      lastVerified: checkedById.get(contact.id) ?? null,
    })),
    places,
    photos,
    links,
  };
  if (partial) throw new PartialContent(bundle);
  return bundle;
}

// The cache stores JSON, which would turn every Date into a string. Dates are
// written as {"$date": "..."} and turned back on the way out.
function encodeBundle(bundle: ContentBundle): string {
  return JSON.stringify(bundle, function (this: Record<string, unknown>, key, value) {
    const raw = this[key];
    return raw instanceof Date ? { $date: raw.toISOString() } : value;
  });
}

function decodeBundle(text: string): ContentBundle {
  return JSON.parse(text, (_key, value) =>
    value && typeof value === "object" && typeof value.$date === "string" && Object.keys(value).length === 1
      ? new Date(value.$date)
      : value,
  ) as ContentBundle;
}

let lastDecoded: { text: string; bundle: ContentBundle } | null = null;

/** Null when the database is off or unreadable — the caller shows the built-in content. */
async function contentBundle(): Promise<ContentBundle | null> {
  if (!DB_ENABLED) return null;
  try {
    const { cachedRead } = await import("@/lib/cache-tags");
    const text = await cachedRead(async () => encodeBundle(await loadContentBundle()), ["published-content-bundle"], [
      "published-content-bundle",
    ]);
    if (lastDecoded?.text !== text) lastDecoded = { text, bundle: decodeBundle(text) };
    return lastDecoded.bundle;
  } catch (error) {
    if (error instanceof PartialContent) return error.bundle;
    console.error("[content] could not read the published content - using static fallback", error);
    return null;
  }
}

/** Exposed for tests: the date-preserving round trip the cache relies on. */
export const __bundleCodec = { encode: encodeBundle, decode: decodeBundle };

export async function getPublishedDestinationContent(
  slug: string,
): Promise<DestinationContent | null> {
  const bundle = await contentBundle();
  if (!bundle) return null;
  const destinationId = bundle.slugs[slug];
  if (!destinationId) return null;

  const allPlaces = bundle.places.filter((place) => place.destinationId === destinationId);
  const allowedIds = new Set(
    allPlaces.filter((place) => isAllowedPublicSource(place.sourceUrl)).map((place) => place.id),
  );
  const pictures = bundle.photos.filter(
    (photo) => photo.destinationId === destinationId || (photo.placeId !== null && allowedIds.has(photo.placeId)),
  );
  const byPlace = new Map<string, GalleryPhoto[]>();
  for (const photo of pictures) {
    if (!photo.placeId) continue;
    const list = byPlace.get(photo.placeId) ?? [];
    list.push(photo);
    byPlace.set(photo.placeId, list);
  }

  return {
    links: bundle.links
      .filter((link) => link.destinationId === destinationId)
      .map(({ id, label, url, note }) => ({ id, label, url, note })),
    contacts: bundle.contacts.filter((contact) => contact.destinationId === destinationId),
    places: allPlaces.map((place) => ({ ...place, photos: byPlace.get(place.id) ?? [] })),
    photos: pictures.filter((photo) => photo.destinationId === destinationId),
  };
}

export async function publishedCategoriesBySlug(): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  const bundle = await contentBundle();
  if (!bundle) return map;
  const slugById = new Map(Object.entries(bundle.slugs).map(([slug, id]) => [id, slug]));
  for (const place of bundle.places) {
    if (!isAllowedPublicSource(place.sourceUrl)) continue;
    const slug = slugById.get(place.destinationId);
    if (!slug) continue;
    const set = map.get(slug) ?? new Set<string>();
    set.add(place.category);
    map.set(slug, set);
  }
  return map;
}

export function groupPlacesByCategory(places: PracticalPlace[]) {
  const groups = new Map<string, PracticalPlace[]>();
  for (const place of places) {
    const list = groups.get(place.category) ?? [];
    list.push(place);
    groups.set(place.category, list);
  }
  return PLACE_CATEGORY_ORDER.filter((category) => groups.has(category)).map(
    (category) => ({
      category,
      label: PLACE_CATEGORY_LABELS[category],
      places: groups.get(category)!,
    }),
  );
}
