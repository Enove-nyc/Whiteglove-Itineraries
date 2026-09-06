// Admin-side content mutations (Prisma writes) and reads for the editor.
//
// These are plain server-side functions. The Next.js server actions that call
// them handle auth + revalidation. Each throws a friendly error when the DB
// isn't connected, so the admin UI can show a clear "connect the database"
// message instead of a stack trace.

import { randomUUID } from "node:crypto";
import type { ContentStatus, Photo, PlaceCategory, VerificationStatus, ProviderCategory } from "@prisma/client";
import type { SubmittedPlace } from "@/lib/admin-content";
import { ATTRACTIONS_PUBLIC_TAG } from "@/lib/attractions-view";
import { bustTag } from "@/lib/cache-tags";
import { DIRECTORY_PUBLIC_TAG } from "@/lib/directory";
import { PRACTICAL_PLACES_PUBLIC_TAG } from "@/lib/mikvaos";
import { remember } from "@/lib/recycle-store";
import { recordChange } from "@/lib/changes-store";
import { invalidateSiteSearchIndex } from "@/lib/site-search-index";
import { CEMETERIES_PUBLIC_TAG } from "@/lib/cemeteries-view";
import { assertVerifiedListing } from "@/lib/listing-verification";

const DB_OFF_MESSAGE =
  "The content database is not connected yet. Add DATABASE_URL (see docs/DATABASE.md) to edit content.";

export function isDbEnabled() {
  return Boolean(process.env.DATABASE_URL);
}

async function db() {
  if (!isDbEnabled()) throw new Error(DB_OFF_MESSAGE);
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

// ---- Reads for the admin editor -------------------------------------

/** All destinations with light counts, for the picker list. */
export async function listDestinationsForAdmin() {
  const prisma = await db();
  return prisma.destination.findMany({
    orderBy: [{ country: "asc" }, { city: "asc" }],
    select: {
      id: true,
      slug: true,
      city: true,
      yiddishCity: true,
      country: true,
      kind: true,
      status: true,
      _count: { select: { places: true, contacts: true } },
    },
  });
}

/** One destination with everything needed to edit it. */
export async function getDestinationForAdmin(slug: string) {
  const prisma = await db();
  return prisma.destination.findUnique({
    where: { slug },
    include: {
      contacts: { orderBy: { label: "asc" } },
      // Each listing brings its own pictures, so the editor can show them on
      // the listing they belong to rather than in one pile at the top.
      places: {
        orderBy: [{ category: "asc" }, { name: "asc" }],
        include: { photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
      },
      photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
}

// ---- Destination core fields ----------------------------------------

export type DestinationFields = {
  city: string;
  yiddishCity: string;
  country: string;
  overview: string | null;
  summary: string | null;
  safetyNote: string | null;
  status: ContentStatus;
};

export type NewDestinationFields = {
  slug: string;
  city: string;
  yiddishCity: string;
  country: string;
  sourceUrl: string | null;
};

/** Create a private destination shell without silently duplicating a town. */
export async function createDestination(fields: NewDestinationFields) {
  const prisma = await db();
  const duplicate = await prisma.destination.findFirst({
    where: {
      OR: [
        { slug: fields.slug },
        {
          city: { equals: fields.city, mode: "insensitive" },
          country: { equals: fields.country, mode: "insensitive" },
        },
      ],
    },
    select: { slug: true, city: true, country: true },
  });
  if (duplicate) {
    throw new Error(`${duplicate.city}, ${duplicate.country} already exists as ${duplicate.slug}.`);
  }

  const row = await prisma.destination.create({
    data: {
      slug: fields.slug,
      city: fields.city,
      yiddishCity: fields.yiddishCity || fields.city,
      country: fields.country,
      sourceUrl: fields.sourceUrl,
      status: "NEEDS_REVIEW",
      verification: "NEEDS_VERIFICATION",
    },
  });
  await recordChange({
    kind: "town",
    rowId: row.slug,
    title: row.city,
    before: null,
    after: { city: row.city, country: row.country, status: row.status },
  });
  await contentChanged();
  return row;
}

export async function updateDestinationFields(slug: string, fields: DestinationFields) {
  const prisma = await db();
  // Read what it says before writing over it. A shorter overview pasted over a
  // longer one is the quiet way to lose a morning's work.
  const before = await prisma.destination.findUnique({
    where: { slug },
    select: { city: true, yiddishCity: true, country: true, overview: true, summary: true, safetyNote: true, status: true },
  });
  const data = {
    city: fields.city,
    yiddishCity: fields.yiddishCity,
    country: fields.country,
    overview: fields.overview,
    summary: fields.summary,
    safetyNote: fields.safetyNote,
    status: fields.status,
  };
  const row = await prisma.destination.update({
    where: { slug },
    data: { ...data, lastVerified: new Date() },
  });
  await recordChange({ kind: "town", rowId: slug, title: fields.city || slug, before, after: data });
  await contentChanged();
  return row;
}

// ---- Contacts (shomer / access) -------------------------------------

export type ContactFields = {
  label: string;
  phone: string | null;
  email: string | null;
  note: string | null;
};

/**
 * Run a write that sets Contact.lastVerified, and fall back to the same write
 * without it.
 *
 * The column is added by the "set up database" button, so between deploying
 * the schema and pressing it the two disagree and Postgres answers P2022. That
 * must not turn into a failed save: the owner would lose what he typed over a
 * date, which is the least important thing in the record. Saving without the
 * stamp is the honest degradation — no date is exactly what the contact had
 * before the column existed.
 */
async function withOptionalStamp<T>(stamped: () => Promise<T>, plain: () => Promise<T>): Promise<T> {
  try {
    return await stamped();
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code !== "P2022") throw error;
    console.error("[content-admin] Contact.lastVerified is missing — saved without the date. Run the database setup.");
    return plain();
  }
}

export async function createContact(destinationId: string, fields: ContactFields) {
  const prisma = await db();
  // Saved here as VERIFIED, so the day it was saved IS the day somebody last
  // confirmed it. Stamping it means the date is a record of what happened
  // rather than something anybody had to remember to type.
  return withOptionalStamp(
    () => prisma.contact.create({ data: { ...fields, status: "VERIFIED", lastVerified: new Date(), destinationId } }),
    () => prisma.contact.create({ data: { ...fields, status: "VERIFIED", destinationId } }),
  );
}

export async function updateContact(id: string, fields: ContactFields) {
  const prisma = await db();
  const existing = await prisma.contact.findUnique({
    where: { id },
    select: { label: true, phone: true, email: true, note: true, status: true },
  });
  // The change log gets what it always got — status is read for the stamp
  // below, not to be diffed.
  const before = existing
    ? { label: existing.label, phone: existing.phone, email: existing.email, note: existing.note }
    : null;
  // ONLY A VERIFIED CONTACT GETS A DATE. lib/verification.ts is explicit that
  // a date only ever appears beside "Verified" — a date beside "being checked"
  // would be a date on a thing nobody has checked. Saving an unverified
  // contact is editing a note, not confirming a phone number answers.
  const stamp = existing?.status === "VERIFIED";
  const row = await withOptionalStamp(
    () => prisma.contact.update({ where: { id }, data: stamp ? { ...fields, lastVerified: new Date() } : fields }),
    () => prisma.contact.update({ where: { id }, data: fields }),
  );
  await recordChange({ kind: "contact", rowId: id, title: fields.label, before, after: fields as unknown as Record<string, unknown> });
  return row;
}

export async function deleteContact(id: string) {
  const prisma = await db();
  // Read it before it goes. A phone number that took a call to get should not
  // be unrecoverable because "Remove" sits next to "Edit".
  const row = await prisma.contact.findUnique({
    where: { id },
    include: { destination: { select: { city: true } } },
  });
  const gone = await prisma.contact.delete({ where: { id } });
  if (row) {
    const { destination, ...record } = row;
    await remember({
      kind: "contact",
      rowId: id,
      title: row.label,
      detail: [destination?.city, row.phone].filter(Boolean).join(" · ") || undefined,
      payload: record as unknown as Record<string, unknown>,
    });
  }
  return gone;
}

// ---- Practical places (lodging/food/minyan/mikvah/transport/etc.) ----

export type PlaceFields = {
  category: PlaceCategory;
  name: string;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  hours: string | null;
  notes: string | null;
  status: ContentStatus;
  /** How far this listing has been checked — not the same as whether it is live. */
  verification: VerificationStatus;
  sourceUrl: string | null;
  lastVerified: Date | null;
};

/**
 * A picture, with where it came from.
 *
 * `credit` is not decoration. A photograph belongs to whoever took it, and the
 * site cannot publish one on the strength of having found it — so a photo with
 * no credit stays a draft and the admin says why.
 */
export type PhotoFields = {
  url: string;
  caption: string | null;
  credit: string | null;
  sourceUrl: string | null;
  status: ContentStatus;
};

/**
 * What a picture is of.
 *
 * One of the three, never more than one. A picture of a hotel room belongs to
 * that hotel, not also to the town — and letting it be both would mean every
 * gallery had to decide which it was showing.
 */
export type PhotoOwner =
  | { kind: "destination"; id: string }
  | { kind: "vacation-destination"; id: string }
  | { kind: "cemetery"; id: string }
  | { kind: "place"; id: string };

function ownerWhere(owner: PhotoOwner) {
  if (owner.kind === "destination") return { destinationId: owner.id };
  if (owner.kind === "vacation-destination") return { vacationDestinationId: owner.id };
  if (owner.kind === "cemetery") return { cemeteryId: owner.id };
  return { placeId: owner.id };
}

export async function listPhotosFor(owner: PhotoOwner) {
  const prisma = await db();
  return prisma.photo.findMany({ where: ownerWhere(owner), orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
}

/**
 * The owner record for a beis hachaim, by slug.
 *
 * A cemetery is addressed by slug rather than by id everywhere in the admin,
 * because the 97 built-in ones live in code and have no database row until
 * something is saved against them. Uploading the first picture of Lizhensk
 * creates that row, exactly as saving the first shomer's number does.
 */
export async function cemeteryPhotoOwner(
  slug: string,
  fallback: { city: string; yiddishCity: string; name: string; yiddishName: string; country: string },
): Promise<PhotoOwner> {
  const row = await cemeteryRowForSlug(slug, fallback);
  return { kind: "cemetery", id: row.id };
}

/**
 * Every stored cemetery picture, keyed by slug.
 *
 * One query rather than one per beis hachaim: the kevarim screen lists all 175
 * of them, and asking separately would be 175 round trips to draw a page whose
 * answer for nearly all of them is "none".
 */
export async function cemeteryPhotosBySlug(): Promise<Map<string, Photo[]>> {
  const prisma = await db();
  const rows = await prisma.photo.findMany({
    where: { cemeteryId: { not: null } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { cemetery: { select: { slug: true } } },
  });
  const bySlug = new Map<string, Photo[]>();
  for (const row of rows) {
    const slug = row.cemetery?.slug;
    if (!slug) continue;
    const list = bySlug.get(slug) ?? [];
    list.push(row);
    bySlug.set(slug, list);
  }
  return bySlug;
}

export async function createPhoto(owner: PhotoOwner, fields: PhotoFields) {
  const prisma = await db();
  return prisma.photo.create({ data: { ...fields, ...ownerWhere(owner) } });
}

/**
 * Every picture a visitor has sent that is still a draft.
 *
 * Where the owner's confirmation actually happens. Without this the pictures
 * would be scattered across 122 towns and 175 batei hachaim, each on its own
 * screen, and "he confirms before anything appears" would mean visiting three
 * hundred pages to find out whether anything is waiting.
 *
 * PUBLISHED ones are deliberately absent: those have been confirmed, and this
 * is a list that is supposed to reach zero.
 */
export async function listPendingSubmissions() {
  const prisma = await db();
  const photos = await prisma.photo.findMany({
    where: { submittedAt: { not: null }, status: "DRAFT" },
    orderBy: { submittedAt: "asc" },
    include: {
      destination: { select: { slug: true, city: true } },
      cemetery: { select: { slug: true, name: true, city: true } },
      place: { select: { name: true, destination: { select: { slug: true, city: true } } } },
    },
  });
  // The clock is read here rather than while the page renders — "waiting three
  // days" is a fact about when the list was fetched, and a component that
  // reads the time as it draws is a component whose output changes for no
  // reason. Same as getAdminContent's readAt.
  return { photos, readAt: Date.now() };
}

/** How many are waiting, for the dashboard. One counted read, not a page of rows. */
export async function countPendingSubmissions(): Promise<number> {
  if (!isDbEnabled()) return 0;
  try {
    const prisma = await db();
    return await prisma.photo.count({ where: { submittedAt: { not: null }, status: "DRAFT" } });
  } catch {
    // A dashboard badge is not worth breaking the dashboard for.
    return 0;
  }
}

export async function updatePhoto(id: string, fields: Omit<PhotoFields, "url">) {
  const prisma = await db();
  return prisma.photo.update({ where: { id }, data: fields });
}

export async function deletePhoto(id: string) {
  const prisma = await db();
  return prisma.photo.delete({ where: { id } });
}

/**
 * Every mutation below ends by saying content changed.
 *
 * The public lists are cached now rather than re-read on every request, so a
 * save that does not bust the tag is a save the visitor does not see for an
 * hour. That is a worse failure than the transfer cost the cache was added to
 * fix, so the call goes in the write functions themselves rather than in the
 * server actions — a new action added later cannot forget it.
 */
/**
 * Content a visitor is meant to see has changed.
 *
 * Built on lib/cache-tags.ts like every other invalidation here. The precise
 * per-table busts (ATTRACTIONS_PUBLIC_TAG, PRACTICAL_PLACES_PUBLIC_TAG) sit on
 * the writes that touch only those tables; this is for the writes behind the
 * batei hachaim list, which one edit can change in two places at once — a
 * kever added to a cemetery changes the burial count on its directory card as
 * well as the page.
 */
async function contentChanged(): Promise<void> {
  invalidateSiteSearchIndex();
  await bustTag(CEMETERIES_PUBLIC_TAG);
}

export async function createPlace(destinationId: string, fields: PlaceFields) {
  assertVerifiedListing(fields);
  const prisma = await db();
  const row = await prisma.practicalPlace.create({
    data: { ...fields, destinationId },
  });
  await bustTag(PRACTICAL_PLACES_PUBLIC_TAG);
  return row;
}

export async function updatePlace(id: string, fields: PlaceFields) {
  assertVerifiedListing(fields);
  const prisma = await db();
  const before = await prisma.practicalPlace.findUnique({ where: { id } });
  const row = await prisma.practicalPlace.update({
    where: { id },
    data: fields,
  });
  await recordChange({
    kind: "listing",
    rowId: id,
    title: fields.name,
    before: before as unknown as Record<string, unknown> | null,
    after: fields as unknown as Record<string, unknown>,
  });
  await bustTag(PRACTICAL_PLACES_PUBLIC_TAG);
  return row;
}

export async function deletePlace(id: string) {
  const prisma = await db();
  const row = await prisma.practicalPlace.findUnique({
    where: { id },
    include: { destination: { select: { city: true } } },
  });
  const gone = await prisma.practicalPlace.delete({ where: { id } });
  await bustTag(PRACTICAL_PLACES_PUBLIC_TAG);
  if (row) {
    const { destination, ...record } = row;
    await remember({
      kind: "listing",
      rowId: id,
      title: row.name,
      detail: [destination?.city, row.category].filter(Boolean).join(" · ") || undefined,
      payload: record as unknown as Record<string, unknown>,
    });
  }
  await contentChanged();
  return gone;
}

// ---- Useful links on a destination -----------------------------------
//
// A link out to somewhere that knows more about this town than we do. The URL
// is normalised on the way in by lib/useful-links.ts — an owner typing a
// domain from memory should not have to remember the https.

export type LinkFields = {
  label: string;
  url: string;
  note: string | null;
  position: number;
  status: ContentStatus;
};

export async function listLinksForAdmin(destinationId: string) {
  const prisma = await db();
  return prisma.destinationLink.findMany({
    where: { destinationId },
    orderBy: [{ position: "asc" }, { label: "asc" }],
  });
}

export async function createLink(destinationId: string, fields: LinkFields) {
  const prisma = await db();
  const row = await prisma.destinationLink.create({ data: { destinationId, ...fields } });
  await contentChanged();
  return row;
}

export async function updateLink(id: string, fields: LinkFields) {
  const prisma = await db();
  const before = await prisma.destinationLink.findUnique({ where: { id } });
  const row = await prisma.destinationLink.update({ where: { id }, data: fields });
  await recordChange({
    kind: "link",
    rowId: id,
    title: fields.label,
    before: before as unknown as Record<string, unknown> | null,
    after: fields as unknown as Record<string, unknown>,
  });
  await contentChanged();
  return row;
}

export async function deleteLink(id: string) {
  const prisma = await db();
  const row = await prisma.destinationLink.findUnique({
    where: { id },
    include: { destination: { select: { city: true } } },
  });
  const gone = await prisma.destinationLink.delete({ where: { id } });
  if (row) {
    const { destination, ...record } = row;
    await remember({
      kind: "link",
      rowId: id,
      title: row.label,
      detail: [destination?.city, row.url].filter(Boolean).join(" · ") || undefined,
      payload: record as unknown as Record<string, unknown>,
    });
  }
  await contentChanged();
  return gone;
}

// ---- Editable general pages (heading + intro text) -------------------

export type PageFields = {
  title: string;
  body: string;
  status: ContentStatus;
};

export async function upsertPage(slug: string, fields: PageFields) {
  const prisma = await db();
  const before = await prisma.page.findUnique({ where: { slug }, select: { title: true, body: true, status: true } });
  const row = await prisma.page.upsert({
    where: { slug },
    update: fields,
    create: { slug, ...fields },
  });
  await recordChange({ kind: "page", rowId: slug, title: fields.title || slug, before, after: fields as unknown as Record<string, unknown> });
  await contentChanged();
  return row;
}

// ---- Directory providers (tour operators, planners, agencies, guides) --

export type ProviderFields = {
  name: string;
  category: ProviderCategory;
  tagline: string | null;
  description: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  basedIn: string | null;
  regions: string[];
  languages: string[];
  specialties: string[];
  featured: boolean;
  /** "service" | "sponsored". Owner's record; never read by a public page. */
  featuredReason: string;
  status: ContentStatus;
  /** Permission to put their phone number on a public page. Never inferred. */
  contactConsent: boolean;
  contactConsentAt: Date | null;
  contactConsentNote: string | null;
  verifiedAt: Date | null;
  responseTime: string | null;
};

function providerSlug(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "provider";
  return `${base}-${randomUUID().slice(0, 6)}`;
}

export async function listProvidersForAdmin() {
  const prisma = await db();
  return prisma.directoryProvider.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

export async function getProviderForAdmin(slug: string) {
  const prisma = await db();
  return prisma.directoryProvider.findUnique({ where: { slug } });
}

/**
 * @param slug Force the new row's slug instead of generating one.
 *
 * Only for promoting a built-in provider to an editable row. The public
 * directory merges the built-in list with the database and lets the owner's
 * row win a collision BY SLUG (lib/directory.ts:185) — so an edited built-in
 * has to keep the seed's slug or it does not replace anything, and the
 * business is listed twice. providerSlug() appends a random suffix, which
 * would guarantee exactly that.
 */
export async function createProvider(fields: ProviderFields, slug?: string) {
  const prisma = await db();
  const row = await prisma.directoryProvider.create({
    data: { slug: slug?.trim() || providerSlug(fields.name), ...fields },
  });
  await bustTag(DIRECTORY_PUBLIC_TAG);
  return row;
}

export async function updateProvider(slug: string, fields: ProviderFields) {
  const prisma = await db();
  const before = await prisma.directoryProvider.findUnique({ where: { slug } });
  const row = await prisma.directoryProvider.update({ where: { slug }, data: fields });
  await recordChange({
    kind: "business",
    rowId: slug,
    title: fields.name,
    before: before as unknown as Record<string, unknown> | null,
    after: fields as unknown as Record<string, unknown>,
  });
  await bustTag(DIRECTORY_PUBLIC_TAG);
  return row;
}

export async function deleteProvider(slug: string) {
  const prisma = await db();
  const row = await prisma.directoryProvider.findUnique({ where: { slug } });
  const gone = await prisma.directoryProvider.delete({ where: { slug } });
  if (row) {
    await remember({
      kind: "business",
      rowId: row.id,
      title: row.name,
      detail: [row.category, row.basedIn].filter(Boolean).join(" · ") || undefined,
      payload: row as unknown as Record<string, unknown>,
    });
  }
  await bustTag(DIRECTORY_PUBLIC_TAG);
  return gone;
}

// ---- Owner-added new entries (cemeteries, tzaddikim, info pages) -------

function newSlug(value: string, fallback: string) {
  const base = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || fallback;
  return `${base}-${randomUUID().slice(0, 6)}`;
}

export type NewCemeteryFields = {
  name: string;
  yiddishName: string;
  city: string;
  yiddishCity: string;
  country: string;
  address: string | null;
  coordinates: string | null;
  accessNote: string | null;
  sourceUrl: string | null;
};

/** Create a new (owner-added) cemetery. Slug is generated; row is a draft-ish
 *  NEEDS_VERIFICATION so the owner can fill details in later. */
export async function createCemetery(fields: NewCemeteryFields) {
  const prisma = await db();
  const created = await prisma.cemetery.create({
    data: {
      slug: newSlug(fields.name, "cemetery"),
      name: fields.name,
      yiddishName: fields.yiddishName || fields.name,
      city: fields.city,
      yiddishCity: fields.yiddishCity || fields.city,
      country: fields.country,
      address: fields.address,
      coordinates: fields.coordinates,
      accessNote: fields.accessNote,
      sourceUrl: fields.sourceUrl,
      status: "NEEDS_VERIFICATION",
    },
  });
  await contentChanged();
  return created;
}

/** Cemeteries that have a database row — the owner-added ones, plus any
 *  built-in one something has already been saved against. */
export async function listCemeteriesForAdmin() {
  const prisma = await db();
  return prisma.cemetery.findMany({
    orderBy: [{ country: "asc" }, { city: "asc" }],
    select: { id: true, slug: true, name: true, city: true, country: true },
  });
}

// ---- Shomer / access contacts on a beis hachaim -----------------------
//
// The 97 built-in batei hachaim live in code and have no database row, so a
// contact had nowhere to attach and their phone numbers could never be
// corrected. Saving one now creates a stub row for that slug on demand; the
// public page layers stored contacts over the built-in ones (see
// lib/cemeteries-view.ts), so re-saving a label replaces that number.

export type CemeteryContactFields = {
  label: string;
  /** Whose number it is — printed beside it as "Ask for —". */
  name: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
};

/**
 * The database row for a cemetery slug, created if this is a built-in one that
 * has never been edited. Only the fields needed to satisfy the schema are set —
 * everything the traveler sees still comes from the built-in record.
 */
async function cemeteryRowForSlug(slug: string, fallback: { city: string; yiddishCity: string; name: string; yiddishName: string; country: string }) {
  const prisma = await db();
  const existing = await prisma.cemetery.findUnique({ where: { slug }, select: { id: true } });
  if (existing) return existing;
  return prisma.cemetery.create({
    data: {
      slug,
      city: fallback.city,
      yiddishCity: fallback.yiddishCity,
      name: fallback.name,
      yiddishName: fallback.yiddishName,
      country: fallback.country,
      status: "NEEDS_VERIFICATION",
    },
    select: { id: true },
  });
}

/** Contacts already stored for a cemetery slug (empty for an untouched one). */
export type StoredCemeteryContact = {
  id: string;
  label: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
};

/**
 * The stored contacts for a beis hachaim.
 *
 * `name` is newer than the table, and on a database where the upgrade has not
 * been pressed yet the column is not there — selecting it would throw and take
 * every stored number down with it, on the one screen whose whole purpose is
 * correcting them. So the read falls back to the older shape and reports the
 * names as absent, which is exactly what they are until the column exists.
 */
export async function listCemeteryContacts(slug: string): Promise<StoredCemeteryContact[]> {
  const prisma = await db();
  try {
    const row = await prisma.cemetery.findUnique({
      where: { slug },
      select: {
        contacts: {
          orderBy: { label: "asc" },
          select: { id: true, label: true, name: true, phone: true, email: true, note: true },
        },
      },
    });
    return row?.contacts ?? [];
  } catch {
    const row = await prisma.cemetery.findUnique({
      where: { slug },
      select: { contacts: { orderBy: { label: "asc" }, select: { id: true, label: true, phone: true, email: true, note: true } } },
    });
    return (row?.contacts ?? []).map((contact) => ({ ...contact, name: null }));
  }
}

/**
 * Save a contact for a cemetery. Matching an existing stored label updates it
 * rather than adding a second one, which is what makes this an edit.
 */
export async function saveCemeteryContact(
  slug: string,
  fallback: { city: string; yiddishCity: string; name: string; yiddishName: string; country: string },
  fields: CemeteryContactFields,
) {
  const prisma = await db();
  const cemetery = await cemeteryRowForSlug(slug, fallback);
  const existing = await prisma.contact.findFirst({
    where: { cemeteryId: cemetery.id, label: { equals: fields.label.trim(), mode: "insensitive" } },
    select: { id: true, label: true, phone: true, email: true, note: true, status: true },
  });
  const data = {
    label: fields.label.trim(),
    name: fields.name?.trim() || null,
    phone: fields.phone?.trim() || null,
    email: fields.email?.trim() || null,
    note: fields.note?.trim() || null,
    status: "NEEDS_VERIFICATION" as const,
  };
  if (existing) {
    const row = await prisma.contact.update({ where: { id: existing.id }, data });
    await recordChange({
      kind: "cemetery-contact",
      rowId: existing.id,
      title: `${data.label} — ${fallback.name}`,
      before: existing as unknown as Record<string, unknown>,
      after: data as unknown as Record<string, unknown>,
    });
    await contentChanged();
    return row;
  }
  const created = await prisma.contact.create({ data: { ...data, cemeteryId: cemetery.id } });
  await contentChanged();
  return created;
}

/** Remove a stored contact. The built-in one, if any, reappears. */
export async function deleteCemeteryContact(id: string) {
  const prisma = await db();
  const row = await prisma.contact.findUnique({
    where: { id },
    include: { cemetery: { select: { name: true, city: true } } },
  });
  await prisma.contact.delete({ where: { id } });
  if (row) {
    const { cemetery, ...record } = row;
    await remember({
      kind: "cemetery-contact",
      rowId: id,
      title: row.label,
      detail: [cemetery ? `${cemetery.name}, ${cemetery.city}` : null, row.phone].filter(Boolean).join(" · ") || undefined,
      payload: record as unknown as Record<string, unknown>,
    });
  }
  await contentChanged();
}

// ---- Tzaddikim on a beis hachaim --------------------------------------
//
// The same problem the shomer numbers had. `listCemeteriesForAdmin` lists
// database rows, and the 97 built-in batei hachaim have none, so the old
// "add a tzadik" picker could only ever offer the handful of owner-added
// cemeteries — there was no way to say "this person is buried in Lizhensk".
//
// A person is attached by SLUG instead, and the row is created on demand,
// exactly as saving a shomer's number does.

export type BurialFields = {
  name: string;
  yiddishName: string;
  knownAs: string | null;
  seforim: string | null;
  yahrzeit: string | null;
  note: string | null;
};

/**
 * People who are in the database but attached to nothing.
 *
 * These are recoverable, not lost. A re-import used to DELETE the built-in
 * beis hachaim before writing it again, and Tzaddik.cemetery is SetNull — so
 * the tzadik the owner had added survived the delete with no cemetery. The row
 * is still there. It is on no page, it is in no list, and nothing would ever
 * have shown it to him again.
 *
 * The re-import no longer does that (destinations and cemeteries are updated
 * in place now), but anyone whose database it already happened to still has
 * the rows, and this is how they get them back.
 */
export async function listOrphanedBurials() {
  const prisma = await db();
  return prisma.tzaddik.findMany({
    where: { cemeteryId: null, destinationId: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, yiddishName: true, knownAs: true, seforim: true, yahrzeit: true, note: true, status: true },
  });
}

/** Put one back where it belongs. */
export async function reattachBurial(
  id: string,
  slug: string,
  fallback: { city: string; yiddishCity: string; name: string; yiddishName: string; country: string },
) {
  const prisma = await db();
  const cemetery = await cemeteryRowForSlug(slug, fallback);
  return prisma.tzaddik.update({ where: { id }, data: { cemeteryId: cemetery.id } });
}

/** Tzaddikim stored against a cemetery slug (empty for an untouched one). */
export async function listCemeteryBurials(slug: string) {
  const prisma = await db();
  const row = await prisma.cemetery.findUnique({
    where: { slug },
    select: {
      burials: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, yiddishName: true, knownAs: true, seforim: true, yahrzeit: true, note: true },
      },
    },
  });
  return row?.burials ?? [];
}

/**
 * Add a person to a beis hachaim, or correct one already added.
 *
 * Saving the same name twice updates that person rather than listing him
 * twice — a spelling fix should not leave two matzeivos on the page.
 */
export async function saveCemeteryBurial(
  slug: string,
  fallback: { city: string; yiddishCity: string; name: string; yiddishName: string; country: string },
  fields: BurialFields,
) {
  const prisma = await db();
  const cemetery = await cemeteryRowForSlug(slug, fallback);
  const existing = await prisma.tzaddik.findFirst({
    where: { cemeteryId: cemetery.id, name: { equals: fields.name.trim(), mode: "insensitive" } },
    select: { id: true, name: true, yiddishName: true, knownAs: true, seforim: true, yahrzeit: true, note: true },
  });
  const data = {
    name: fields.name.trim(),
    yiddishName: fields.yiddishName.trim() || fields.name.trim(),
    knownAs: fields.knownAs?.trim() || null,
    seforim: fields.seforim?.trim() || null,
    yahrzeit: fields.yahrzeit?.trim() || null,
    note: fields.note?.trim() || null,
    status: "NEEDS_VERIFICATION" as const,
  };
  if (existing) {
    const row = await prisma.tzaddik.update({ where: { id: existing.id }, data });
    await recordChange({
      kind: "burial",
      rowId: existing.id,
      title: `${data.knownAs || data.name} — ${fallback.name}`,
      before: existing as unknown as Record<string, unknown>,
      after: data as unknown as Record<string, unknown>,
    });
    await contentChanged();
    return row;
  }
  const created = await prisma.tzaddik.create({ data: { ...data, isPrimary: false, cemeteryId: cemetery.id } });
  await contentChanged();
  return created;
}

/** Take a person off a beis hachaim. Built-in burials are in code and untouched. */
export async function deleteCemeteryBurial(id: string) {
  const prisma = await db();
  const row = await prisma.tzaddik.findUnique({
    where: { id },
    include: { cemetery: { select: { name: true, city: true } } },
  });
  await prisma.tzaddik.delete({ where: { id } });
  if (row) {
    const { cemetery, ...record } = row;
    await remember({
      kind: "burial",
      rowId: id,
      title: row.knownAs || row.name,
      detail: cemetery ? `${cemetery.name}, ${cemetery.city}` : undefined,
      payload: record as unknown as Record<string, unknown>,
    });
  }
  await contentChanged();
}

/**
 * The other direction: you know who the person is and where he is buried, but
 * that beis hachaim isn't on the site yet. Creates both in one write, so a
 * failure can't leave a nameless cemetery behind.
 */
export async function createCemeteryWithBurial(cemetery: NewCemeteryFields, burial: BurialFields) {
  const prisma = await db();
  const created = await prisma.cemetery.create({
    data: {
      slug: newSlug(cemetery.city || cemetery.name, "cemetery"),
      name: cemetery.name,
      yiddishName: cemetery.yiddishName || cemetery.name,
      city: cemetery.city,
      yiddishCity: cemetery.yiddishCity || cemetery.city,
      country: cemetery.country,
      address: cemetery.address,
      coordinates: cemetery.coordinates,
      accessNote: cemetery.accessNote,
      sourceUrl: cemetery.sourceUrl,
      status: "NEEDS_VERIFICATION",
      burials: {
        create: [
          {
            name: burial.name.trim(),
            yiddishName: burial.yiddishName.trim() || burial.name.trim(),
            knownAs: burial.knownAs?.trim() || null,
            seforim: burial.seforim?.trim() || null,
            yahrzeit: burial.yahrzeit?.trim() || null,
            note: burial.note?.trim() || null,
            isPrimary: true,
            status: "NEEDS_VERIFICATION",
          },
        ],
      },
    },
    select: { slug: true, name: true, city: true },
  });
  await contentChanged();
  return created;
}

export type NewPageFields = {
  title: string;
  body: string;
  status: ContentStatus;
};

/** Create a new standalone info page (rendered at /info/[slug]). */
export async function createInfoPage(fields: NewPageFields) {
  const prisma = await db();
  const row = await prisma.page.create({
    data: {
      slug: newSlug(fields.title, "page"),
      title: fields.title,
      body: fields.body,
      status: fields.status,
    },
  });
  await contentChanged();
  return row;
}

// ---- The rest of the trip ---------------------------------------------
//
// Things to do and places to stay, added by the owner. These write to the same
// tables the built-in data seeds into, and everything on the site reads them
// back through lib/attractions-view.ts — so an entry added here shows on its
// directory page, in the /stops search, and in the planner's pickers straight
// away, with no redeploy and nothing to copy into a data file.
//
// Coordinates here are public landmarks and are safe to navigate to. That is
// not true of a kever, and the difference is why the two are separate screens.

export type NewAttractionFields = {
  name: string;
  city: string;
  country: string;
  kind: string;
  summary: string;
  address: string | null;
  coordinates: string | null;
  website: string | null;
  notes: string[];
  sourceUrl: string;
};

export async function createAttraction(fields: NewAttractionFields) {
  const prisma = await db();
  const row = await prisma.attraction.create({
    data: {
      slug: newSlug(`${fields.city}-${fields.name}`, "attraction"),
      name: fields.name,
      city: fields.city,
      country: fields.country,
      kind: fields.kind,
      summary: fields.summary,
      address: fields.address,
      coordinates: fields.coordinates,
      website: fields.website,
      notes: fields.notes,
      sourceUrl: fields.sourceUrl,
      status: "PUBLISHED",
    },
    select: { slug: true, name: true },
  });
  invalidateSiteSearchIndex();
  await bustTag(ATTRACTIONS_PUBLIC_TAG);
  return row;
}

export type NewStayFields = {
  name: string;
  city: string;
  country: string;
  kind: string;
  summary: string;
  anchorName: string;
  anchorCoords: string;
  season: string | null;
  kosherClaim: string;
  website: string | null;
  notes: string[];
  sourceUrl: string;
  /**
   * Kosher / Shabbos attributes — each "yes" | "no" | "unknown", defaulting to
   * "unknown" when the form leaves them alone. Never inferred from kind or
   * kosherClaim.
   */
  onSiteKosherFood?: string;
  kosherBreakfast?: string;
  shabbosMeals?: string;
  nearbyKosherFood?: string;
  nearbyShulOrMinyan?: string;
  eruv?: string;
  shabbosAccessInfo?: string | null;
  shabbosElevator?: string;
  kitchenSelfCatering?: string;
  kosherKitchen?: string;
  walkingDistanceToJewishArea?: string;
};

function confirmedField(value: string | undefined): string {
  return ["yes", "no", "unknown"].includes(value ?? "") ? (value as string) : "unknown";
}

/** One owner-added stay, for the edit screen. Static (file-seeded) stays have
 *  no database row and are not reachable here — they are not editable. */
export async function getKosherStayForAdmin(slug: string) {
  const prisma = await db();
  return prisma.kosherStay.findUnique({ where: { slug } });
}

/**
 * Correct an owner-added stay already on the site.
 *
 * Unlike a destination, a stay has no built-in text to fall back to — this is
 * a full row already saved through {@link createKosherStay}, so every field
 * is simply overwritten with what the form now says, the same as updatePlace.
 * The slug is never touched: it is how the public list and this row agree on
 * which listing this is.
 */
export async function updateKosherStay(slug: string, fields: NewStayFields) {
  const prisma = await db();
  const before = await prisma.kosherStay.findUnique({ where: { slug } });
  if (!before) throw new Error("That stay could not be found.");
  const row = await prisma.kosherStay.update({
    where: { slug },
    data: {
      name: fields.name,
      city: fields.city,
      country: fields.country,
      kind: fields.kind,
      summary: fields.summary,
      anchorName: fields.anchorName,
      anchorCoords: fields.anchorCoords,
      season: fields.season,
      kosherClaim: ["none", "reported", "confirmed"].includes(fields.kosherClaim) ? fields.kosherClaim : "none",
      website: fields.website,
      notes: fields.notes,
      sourceUrl: fields.sourceUrl,
      onSiteKosherFood: confirmedField(fields.onSiteKosherFood),
      kosherBreakfast: confirmedField(fields.kosherBreakfast),
      shabbosMeals: confirmedField(fields.shabbosMeals),
      nearbyKosherFood: confirmedField(fields.nearbyKosherFood),
      nearbyShulOrMinyan: confirmedField(fields.nearbyShulOrMinyan),
      eruv: confirmedField(fields.eruv),
      shabbosAccessInfo: fields.shabbosAccessInfo ?? null,
      shabbosElevator: confirmedField(fields.shabbosElevator),
      kitchenSelfCatering: confirmedField(fields.kitchenSelfCatering),
      kosherKitchen: confirmedField(fields.kosherKitchen),
      walkingDistanceToJewishArea: confirmedField(fields.walkingDistanceToJewishArea),
    },
    select: { slug: true, name: true },
  });
  await recordChange({
    kind: "listing",
    rowId: slug,
    title: fields.name,
    before: before as unknown as Record<string, unknown>,
    after: fields as unknown as Record<string, unknown>,
  });
  invalidateSiteSearchIndex();
  await bustTag(ATTRACTIONS_PUBLIC_TAG);
  return row;
}

export async function createKosherStay(fields: NewStayFields) {
  const prisma = await db();
  const row = await prisma.kosherStay.create({
    data: {
      slug: newSlug(`${fields.city}-${fields.name}`, "stay"),
      name: fields.name,
      city: fields.city,
      country: fields.country,
      kind: fields.kind,
      summary: fields.summary,
      anchorName: fields.anchorName,
      anchorCoords: fields.anchorCoords,
      season: fields.season,
      // "confirmed" means the owner checked it with the hotel or its mashgiach.
      // It is never reached by default, and never inferred from a source.
      kosherClaim: ["none", "reported", "confirmed"].includes(fields.kosherClaim) ? fields.kosherClaim : "none",
      website: fields.website,
      notes: fields.notes,
      sourceUrl: fields.sourceUrl,
      status: "PUBLISHED",
      onSiteKosherFood: confirmedField(fields.onSiteKosherFood),
      kosherBreakfast: confirmedField(fields.kosherBreakfast),
      shabbosMeals: confirmedField(fields.shabbosMeals),
      nearbyKosherFood: confirmedField(fields.nearbyKosherFood),
      nearbyShulOrMinyan: confirmedField(fields.nearbyShulOrMinyan),
      eruv: confirmedField(fields.eruv),
      shabbosAccessInfo: fields.shabbosAccessInfo ?? null,
      shabbosElevator: confirmedField(fields.shabbosElevator),
      kitchenSelfCatering: confirmedField(fields.kitchenSelfCatering),
      kosherKitchen: confirmedField(fields.kosherKitchen),
      walkingDistanceToJewishArea: confirmedField(fields.walkingDistanceToJewishArea),
    },
    select: { slug: true, name: true },
  });
  invalidateSiteSearchIndex();
  await bustTag(ATTRACTIONS_PUBLIC_TAG);
  return row;
}

/**
 * Publish a place a traveller sent in from their own itinerary.
 *
 * The site's standing rule is that nothing is published without saying where it
 * came from; the owner waived it for these — a place someone actually visited
 * and asked us to add — so they go live on accept with an empty source and
 * best-effort fields he can tidy from the listing editor afterwards. A stop
 * becomes a thing-to-do; a stay becomes a where-to-stay entry anchored to its
 * own coordinates, because what was sent carries no separate anchor. The phone
 * lives in the notes: neither the attraction nor the stay row has a phone
 * column, and dropping it would lose the one field a traveller most often has.
 */
export async function publishSubmittedPlace(place: SubmittedPlace): Promise<{ slug: string; name: string }> {
  const city = cityFromAddress(place.address) || place.country || "";
  const summary = "Sent in by a traveller.";
  const notes = place.phone ? [`Phone: ${place.phone}`] : [];
  if (place.kind === "stay") {
    return createKosherStay({
      name: place.name,
      city,
      country: place.country || "—",
      kind: "Ordinary hotel, well placed",
      summary,
      anchorName: place.name,
      anchorCoords: place.coordinates || "",
      season: null,
      kosherClaim: "none",
      website: place.href || null,
      notes,
      sourceUrl: "",
    });
  }
  return createAttraction({
    name: place.name,
    city,
    country: place.country || "—",
    kind: "Landmark",
    summary,
    address: place.address || null,
    coordinates: place.coordinates || null,
    website: place.href || null,
    notes,
    sourceUrl: "",
  });
}

/** Best-effort city from a free-text address: the segment before the country. */
function cityFromAddress(address?: string): string {
  if (!address) return "";
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2];
  return parts[0] ?? "";
}
