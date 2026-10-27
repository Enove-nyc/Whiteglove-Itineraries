// Public read layer for cemeteries that merges the built-in static list
// (data/cemeteries.ts, which carries the rich arrival notes + nearby places)
// with owner-added cemeteries and tzaddikim stored in the database.
//
// FAIL SAFE: with the DB off/unreachable it returns the static content only, so
// the cemetery pages always work.

import { cachedRead } from "@/lib/cache-tags";
import { cemeteries as staticCemeteries, getCemetery as getStaticCemetery, type Cemetery } from "@/data/cemeteries";
import type { GalleryPhoto } from "@/components/PhotoGallery";
import { optionalRead } from "@/lib/db-optional";

const DB_ENABLED = Boolean(process.env.DATABASE_URL);

/**
 * A beis hachaim as its page shows it: the built-in record, plus anything
 * stored against it.
 *
 * Pictures are separate from `Cemetery` rather than added to it, because
 * `Cemetery` is the shape of the built-in file and pictures only ever come
 * from the database. Kept as the gallery's own shape so nothing here has to
 * know Prisma's row.
 */
export type CemeteryView = Cemetery & { photos: GalleryPhoto[] };

export type CemeteryListItem = {
  slug: string;
  city: string;
  yiddishCity: string;
  name: string;
  yiddishName: string;
  country: string;
  burialCount: number;
  /** Who is buried there, for searching and for sorting by tzaddik. */
  burials: string[];
  ownerAdded: boolean;
};

const staticSlugs = new Set(staticCemeteries.map((c) => c.slug));

function staticListItem(c: Cemetery): CemeteryListItem {
  return {
    slug: c.slug,
    city: c.city,
    yiddishCity: c.yiddishCity,
    name: c.name,
    yiddishName: c.yiddishName,
    country: c.country,
    burialCount: c.burials.length,
    burials: c.burials.map((b) => [b.knownAs, b.name, b.yiddishName].filter(Boolean).join(" ")),
    ownerAdded: false,
  };
}

/** Busted by every write that can change a beis hachaim or its kevarim. */
export const CEMETERIES_PUBLIC_TAG = "cemeteries-public";

/**
 * The same list, cached until a content write busts the tag.
 *
 * The heaviest read on the site — 176 batei hachaim plus a burial-count query
 * across every one of them — and it feeds /heritage, /cemeteries and /stops.
 * getCemeteryList stays uncached for the admin, which has to see a save before
 * anything invalidates a tag.
 *
 * Goes through lib/cache-tags.ts rather than importing next/cache directly,
 * for the reason at the top of that file: this module is imported by
 * plain-Node tests with no Next.js runtime.
 */
export async function getPublicCemeteryList(): Promise<CemeteryListItem[]> {
  return cachedRead(getCemeteryList, ["cemetery-list"], [CEMETERIES_PUBLIC_TAG]);
}

/** The cemetery directory list: built-in cemeteries plus owner-added ones. */
export async function getCemeteryList(): Promise<CemeteryListItem[]> {
  const base = staticCemeteries.map(staticListItem);
  if (!DB_ENABLED) return base;
  try {
    const { prisma } = await import("@/lib/prisma");
    const [rows, storedOnBuiltIn] = await Promise.all([
      prisma.cemetery.findMany({
        where: { slug: { notIn: [...staticSlugs] } },
        select: {
          slug: true, city: true, yiddishCity: true, name: true, yiddishName: true, country: true,
          _count: { select: { burials: true } },
        },
        orderBy: [{ country: "asc" }, { city: "asc" }],
      }),
      // A person added to a built-in beis hachaim shows on its page, so the
      // count beside it in the directory has to know about him too — otherwise
      // the card says two kevarim and the page lists three.
      prisma.cemetery.findMany({
        where: { slug: { in: [...staticSlugs] } },
        select: { slug: true, burials: { select: { name: true } } },
      }),
    ]);

    const extraBySlug = new Map(storedOnBuiltIn.map((r) => [r.slug, r.burials.map((b) => b.name.toLowerCase())]));
    const withExtras = base.map((item) => {
      const extras = extraBySlug.get(item.slug);
      if (!extras?.length) return item;
      const known = new Set(
        (staticCemeteries.find((c) => c.slug === item.slug)?.burials ?? []).map((b) => b.name.toLowerCase()),
      );
      const added = extras.filter((name) => !known.has(name)).length;
      return added ? { ...item, burialCount: item.burialCount + added } : item;
    });

    const added = rows.map((r) => ({
      slug: r.slug, city: r.city, yiddishCity: r.yiddishCity, name: r.name,
      yiddishName: r.yiddishName, country: r.country, burialCount: r._count.burials, burials: [], ownerAdded: true,
    }));
    return [...withExtras, ...added];
  } catch {
    return base;
  }
}

type StoredBurial = {
  name: string;
  yiddishName: string;
  knownAs: string | null;
  seforim: string | null;
  yahrzeit: string | null;
  note: string | null;
};

const burialKey = (name: string) => name.trim().toLowerCase();

/**
 * Built-in tzaddikim, with stored ones layered over the top.
 *
 * WHY THIS EXISTS. A burial saved in the admin against a built-in beis hachaim
 * was kept only if its name was NOT already listed in code. That made every
 * built-in tzaddik permanently read-only: an owner could type the English
 * seforim for Reb Elimelech into the admin, save it, get a success message,
 * and nothing would change on the page — the built-in record always won and
 * the stored one was dropped on the floor.
 *
 * A stored burial now replaces the built-in one of the same name, and keeps
 * its position in the list rather than jumping to the end. Anything not
 * matching a built-in name is appended, which is what this used to do and is
 * still right for somebody genuinely new.
 *
 * Field by field rather than wholesale: an override that leaves the yahrzeit
 * blank should not erase a yahrzeit the built-in record already has. Clearing
 * a field that only the built-in supplies is not possible this way, which is
 * the same trade the contacts merge below makes.
 */
export function mergeBurials(builtIn: Cemetery["burials"], stored: StoredBurial[]): Cemetery["burials"] {
  if (!stored.length) return builtIn;

  const overrides = new Map(stored.map((b) => [burialKey(b.name), b]));
  const used = new Set<string>();

  const merged = builtIn.map((b) => {
    const key = burialKey(b.name);
    const override = overrides.get(key);
    if (!override) return b;
    used.add(key);
    return {
      name: override.name || b.name,
      yiddishName: override.yiddishName || b.yiddishName,
      knownAs: override.knownAs ?? b.knownAs,
      seforim: override.seforim ?? b.seforim,
      yahrzeit: override.yahrzeit ?? b.yahrzeit,
      note: override.note ?? b.note,
    };
  });

  const added = stored
    .filter((b) => !used.has(burialKey(b.name)))
    .map((b) => ({
      name: b.name,
      yiddishName: b.yiddishName,
      knownAs: b.knownAs ?? undefined,
      seforim: b.seforim ?? undefined,
      yahrzeit: b.yahrzeit ?? undefined,
      note: b.note ?? undefined,
    }));

  // Nothing stored applied to this beis hachaim at all — hand back the very
  // same array so the caller can tell by identity that nothing changed.
  if (used.size === 0 && added.length === 0) return builtIn;
  return [...merged, ...added];
}

type StoredContact = { label: string; name?: string | null; phone: string | null; email: string | null; note: string | null };
type ViewContact = NonNullable<Cemetery["accessContacts"]>[number];

const contactKey = (label: string) => label.trim().toLowerCase();

/**
 * Built-in contacts, with stored ones layered over the top.
 *
 * Matching is by label, so re-saving "Shomer" replaces the built-in "Shomer"
 * rather than adding a second one. A stored contact with neither a phone nor an
 * email means "this contact is gone" and hides the built-in entry — otherwise a
 * number that has stopped working could never be taken off the page, and a
 * traveler standing at a locked gate would keep calling it.
 */
function mergeContacts(builtIn: ViewContact[], stored: StoredContact[]): ViewContact[] {
  if (!stored.length) return builtIn;
  const overrides = new Map(stored.map((c) => [contactKey(c.label), c]));
  const out: ViewContact[] = [];

  for (const contact of builtIn) {
    const override = overrides.get(contactKey(contact.label));
    if (!override) {
      out.push(contact);
      continue;
    }
    overrides.delete(contactKey(contact.label));
    const phone = override.phone?.trim() || undefined;
    const email = override.email?.trim() || undefined;
    if (!phone && !email) continue; // retired
    // The stored name wins when there is one, and the built-in one stands when
    // the owner has only corrected the number.
    out.push({ label: override.label, name: override.name ?? contact.name, phone, email, note: override.note ?? contact.note });
  }

  // Anything stored that didn't match a built-in label is a new contact.
  for (const contact of overrides.values()) {
    const phone = contact.phone?.trim() || undefined;
    const email = contact.email?.trim() || undefined;
    if (!phone && !email) continue;
    out.push({ label: contact.label, name: contact.name ?? undefined, phone, email, note: contact.note ?? "" });
  }
  return out;
}

/** One cemetery for its detail page. For a built-in cemetery, returns the rich
 *  static record with any owner-added tzaddikim appended; for an owner-added
 *  cemetery, builds the record from the database. */
/**
 * Every stored beis hachaim with its burials, contacts and pictures, read in one
 * go and cached until the database is next written to (lib/prisma.ts clears
 * DB_CONTENT_TAG on any write).
 *
 * Each cemetery page used to read its own row on an hourly timer. With search
 * engines walking every page, that was a query every few minutes, and the
 * free-plan database — which only stops counting after five idle minutes —
 * never slept. One shared read lets it.
 *
 * Only text fields are used from these rows, so the cache's JSON round trip
 * (which turns dates into strings) loses nothing that is read.
 */
async function readCemeteryRows() {
  const { prisma } = await import("@/lib/prisma");
  return prisma.cemetery.findMany({
    include: {
      burials: { orderBy: { name: "asc" } },
      contacts: { orderBy: { label: "asc" } },
    },
  });
}

type CemeteryRow = Awaited<ReturnType<typeof readCemeteryRows>>[number];
type CemeteryBundle = { rows: Record<string, CemeteryRow>; photos: Record<string, GalleryPhoto[]> };

/** Read fine except the pictures. Thrown so it is not cached for a day. */
class PartialCemeteries extends Error {
  constructor(readonly bundle: CemeteryBundle) {
    super("the beis hachaim pictures could not be read");
  }
}

async function loadCemeteryBundle(): Promise<CemeteryBundle> {
  const { prisma } = await import("@/lib/prisma");
  const rows = await readCemeteryRows();
  const pictures = await optionalRead(
    "pictures for the batei hachaim",
    async () =>
      prisma.photo.findMany({
        where: { cemeteryId: { not: null }, status: "PUBLISHED" },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, url: true, caption: true, credit: true, sourceUrl: true, cemeteryId: true },
      }),
    null,
  );
  const photos: Record<string, GalleryPhoto[]> = {};
  for (const { cemeteryId, ...photo } of pictures ?? []) {
    if (!cemeteryId) continue;
    (photos[cemeteryId] ??= []).push(photo);
  }
  const bundle: CemeteryBundle = { rows: Object.fromEntries(rows.map((row) => [row.slug, row])), photos };
  if (pictures === null) throw new PartialCemeteries(bundle);
  return bundle;
}

async function cemeteryBundle(): Promise<CemeteryBundle> {
  try {
    return await cachedRead(loadCemeteryBundle, ["cemetery-view-bundle"], [CEMETERIES_PUBLIC_TAG]);
  } catch (error) {
    if (error instanceof PartialCemeteries) return error.bundle;
    throw error;
  }
}

export async function getCemeteryView(slug: string): Promise<CemeteryView | null> {
  const staticRecord = getStaticCemetery(slug);

  if (!DB_ENABLED) return staticRecord ? { ...staticRecord, photos: [] } : null;

  try {
    // One shared, cached read for every beis hachaim (see cemeteryBundle).
    // Pictures are read separately inside it and allowed to fail, so a missing
    // Photo table can never hide the kevarim the owner added.
    const bundle = await cemeteryBundle();
    const row = bundle.rows[slug] ?? null;
    const photos = row ? (bundle.photos[row.id] ?? []) : [];

    if (staticRecord) {
      if (!row) return { ...staticRecord, photos: [] };

      // Tzaddikim: stored ones layered over the built-in list, the same way
      // contacts are below and for the same reason. A stored burial whose name
      // matched a built-in one used to be dropped here, so a built-in tzaddik
      // could never be corrected — his seforim could be saved in the admin and
      // would silently never appear. Matching is by name, so re-saving "Rabbi
      // Elimelech Weisblum" replaces him rather than listing him twice.
      const burials = mergeBurials(staticRecord.burials, row.burials);

      // Contacts saved against a built-in cemetery used to be dropped on the
      // floor here, which meant a shomer's phone number could be added but
      // never corrected — the built-in one is in code and always won. A stored
      // contact now takes precedence over the built-in one with the same
      // label, so editing a number is simply saving it again. Clearing both
      // the phone and the email removes the built-in contact from the page,
      // which is the only way to retire a number that no longer works.
      const accessContacts = mergeContacts(staticRecord.accessContacts ?? [], row.contacts);

      if (burials === staticRecord.burials && accessContacts === staticRecord.accessContacts) {
        return { ...staticRecord, photos };
      }
      return { ...staticRecord, burials, accessContacts, photos };
    }

    if (!row) return null;
    // Owner-added cemetery — build the static shape from the DB row.
    return {
      photos,
      slug: row.slug,
      city: row.city,
      yiddishCity: row.yiddishCity,
      name: row.name,
      yiddishName: row.yiddishName,
      country: row.country,
      address: row.address ?? "",
      coordinates: row.coordinates ?? undefined,
      arrivalNotes: row.arrivalNotes ?? [],
      accessNote: row.accessNote ?? undefined,
      accessContacts: row.contacts.map((c) => ({
        label: c.label, phone: c.phone ?? undefined, email: c.email ?? undefined, note: c.note ?? "",
      })),
      burials: row.burials.map((b) => ({
        name: b.name, yiddishName: b.yiddishName, knownAs: b.knownAs ?? undefined,
        seforim: b.seforim ?? undefined, yahrzeit: b.yahrzeit ?? undefined, note: b.note ?? undefined,
      })),
      sourceUrl: row.sourceUrl ?? "",
    };
  } catch {
    return staticRecord ? { ...staticRecord, photos: [] } : null;
  }
}
