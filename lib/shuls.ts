/**
 * Published shul / minyan listings for the public site.
 *
 * Same source as mikvaos: PracticalPlace rows (category MINYAN here), or the
 * static seed catalog when the database is empty. Not a new content type —
 * every destination's write-up already carries this under "Minyanim"; this
 * is the same information gathered into its own directory, the way mikvaos
 * already are. See lib/mikvaos.ts, which this mirrors.
 */

import { cemeteries } from "@/data/cemeteries";
import { notableShuls } from "@/data/notable-shuls";
import { practicalContent } from "@/data/practical-content";
import { destinations as heritageDestinations, destinationHref as heritageDestinationHref } from "@/data/destinations";
import { getBulkDestination } from "@/data/destinations-bulk";
import { isDisallowedImportSource } from "@/lib/bulk-content";
import { cachedRead } from "@/lib/cache-tags";
import { heritageTownHref } from "@/lib/route-migration";
import { vacationDestinations, type VacationDestination } from "@/data/vacation-destinations";
import { destinationHref as vacationHref } from "@/lib/vacation-ideas";
import { PRACTICAL_PLACES_PUBLIC_TAG } from "@/lib/mikvaos";

export type ShulListing = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  hours: string | null;
  notes: string | null;
  website: string | null;
  sourceUrl: string;
  coordinates: string | null;
  city: string;
  country: string;
  destinationSlug: string;
  href: string;
  fromDatabase: boolean;
  /** True for a shul the owner added from /admin/shuls — the only removable kind. */
  added?: boolean;
};

/** What the owner types when adding a shul, before it becomes a listing. */
export type ShulInput = {
  name: string;
  city: string;
  country: string;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  notes?: string | null;
  coordinates?: string | null;
  sourceUrl: string;
};

/** Why this shul cannot be saved, or null. Checked in the admin action. */
export function shulProblem(input: ShulInput): string | null {
  if (!input.name.trim()) return "Give the shul a name.";
  if (!input.city.trim()) return "Say which city it is in.";
  if (!input.country.trim()) return "Say which country it is in.";
  if (!/^https?:\/\//i.test((input.sourceUrl ?? "").trim())) return "The source link must be a full web address (https://…).";
  if (!isAllowedSource(input.sourceUrl)) return "That source is not one the site lists from. Use the shul's own site or a source already trusted here.";
  const coords = input.coordinates?.trim();
  if (coords && !/^-?\d{1,3}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?$/.test(coords)) {
    return "Coordinates must look like 51.5144, -0.0792 — or leave them blank.";
  }
  return null;
}

/** A stable id for an owner-added shul, from its city and name. */
export function shulId(input: ShulInput): string {
  const slug = `${input.city} ${input.name}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `shul-added-${slug || "shul"}`;
}

/** Turn validated input into the listing shape the directory and map render. */
export function shulFromInput(input: ShulInput): ShulListing {
  const website = input.website?.trim() || null;
  const sourceUrl = input.sourceUrl.trim();
  const id = shulId(input);
  return {
    id,
    name: input.name.trim(),
    address: input.address?.trim() || null,
    phone: input.phone?.trim() || null,
    hours: null,
    notes: input.notes?.trim() || null,
    website,
    sourceUrl,
    coordinates: input.coordinates?.trim() || null,
    city: input.city.trim(),
    country: input.country.trim(),
    destinationSlug: "",
    // No White Glove town for a hand-added shul, so the card's own link stays
    // on this site — its row on the shuls directory — rather than opening the
    // source or the shul's outside site. A source beside a listing reads as
    // an endorsement of whatever it points at (AGENTS.md); the website, when
    // there is one, is still reachable as its own clearly-labelled link.
    href: `/shuls#${id}`,
    fromDatabase: false,
    added: true,
  };
}

function isAllowedSource(sourceUrl: string | null | undefined): boolean {
  if (!sourceUrl?.trim()) return false;
  return !isDisallowedImportSource({ sourceUrl, sourceName: "", attribution: "" });
}

/**
 * Which page a listing's town links to.
 *
 * `known` is the merged destination list when the caller has read it. It
 * defaults to the built-in list so a synchronous caller still resolves the
 * twenty shipped destinations; pass the merged one and a destination the owner
 * added links to itself rather than falling through to a heritage town.
 */
function destinationHrefFor(
  slug: string,
  city: string,
  known: readonly VacationDestination[] = vacationDestinations,
): string {
  const vacation = known.find((item) => item.slug === slug || item.cities.includes(city));
  if (vacation) return vacationHref(vacation);
  const heritage = heritageDestinations.find((item) => item.slug === slug);
  if (heritage) return heritageDestinationHref(heritage);
  if (getBulkDestination(slug)) return heritageTownHref(slug);
  return heritageTownHref(slug) || `/stops`;
}

function byCountryCityName(a: ShulListing, b: ShulListing): number {
  return a.country.localeCompare(b.country) || a.city.localeCompare(b.city) || a.name.localeCompare(b.name);
}

function dedupeByNameCity(listings: ShulListing[]): ShulListing[] {
  const seen = new Set<string>();
  const out: ShulListing[] = [];
  for (const listing of listings) {
    const key = `${listing.name.toLocaleLowerCase("en")}|${listing.city.toLocaleLowerCase("en")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(listing);
  }
  return out;
}

/** Static, source-backed shul/minyan entries shipped in the repo. */
export function staticShulListings(known: readonly VacationDestination[] = vacationDestinations): ShulListing[] {
  const out: ShulListing[] = [];

  for (const [slug, content] of Object.entries(practicalContent)) {
    for (const [index, place] of (content.places ?? []).entries()) {
      if (place.category !== "MINYAN") continue;
      const sourceUrl = place.source?.trim();
      if (!sourceUrl || !isAllowedSource(sourceUrl)) continue;
      const bulk = getBulkDestination(slug);
      const heritage = heritageDestinations.find((item) => item.slug === slug);
      const city = bulk?.city ?? heritage?.city ?? slug;
      const country = bulk?.country ?? heritage?.country ?? "";
      out.push({
        id: `static-practical-${slug}-${index}`,
        name: place.name,
        address: place.address ?? null,
        phone: place.phone ?? null,
        hours: place.hours ?? null,
        notes: place.notes ?? null,
        website: place.website ?? null,
        sourceUrl,
        coordinates: place.coordinates ?? null,
        city,
        country,
        destinationSlug: slug,
        href: destinationHrefFor(slug, city, known),
        fromDatabase: false,
      });
    }
  }

  for (const cemetery of cemeteries) {
    for (const [index, place] of (cemetery.places ?? []).entries()) {
      if (place.category !== "MINYAN") continue;
      const sourceUrl = (place.source ?? cemetery.sourceUrl)?.trim();
      if (!sourceUrl || !isAllowedSource(sourceUrl)) continue;
      out.push({
        id: `static-cemetery-${cemetery.slug}-${index}`,
        name: place.name,
        address: place.address ?? null,
        phone: place.phone ?? null,
        hours: place.hours ?? null,
        notes: place.notes ?? null,
        website: place.website ?? null,
        sourceUrl,
        coordinates: place.coordinates ?? null,
        city: cemetery.city,
        country: cemetery.country,
        destinationSlug: cemetery.slug,
        href: `/cemeteries/${cemetery.slug}`,
        fromDatabase: false,
      });
    }
  }

  return dedupeByNameCity(out).sort(byCountryCityName);
}

/**
 * The landmark working shuls of the world, as directory listings.
 *
 * A flat, source-backed list (data/notable-shuls.ts), the parallel to the
 * worldwide attractions. Most sit in cities that are not kever-town
 * destinations, so each links to its own row on the shuls directory rather
 * than a destination page. data/notable-shuls.ts still carries its own
 * `href` (the shul's outside site, for checking current hours) — not used
 * here, since a card's main link stays on this site; it is still reachable
 * through the listing's separate "Website" link where one exists.
 */
export function notableShulListings(): ShulListing[] {
  const out: ShulListing[] = [];
  for (const shul of notableShuls) {
    if (!isAllowedSource(shul.sourceUrl)) continue;
    const id = `notable-${shul.slug}`;
    out.push({
      id,
      name: shul.name,
      address: shul.address ?? null,
      phone: null,
      hours: null,
      notes: shul.notes?.join(" ") ?? null,
      website: shul.website ?? null,
      sourceUrl: shul.sourceUrl,
      coordinates: shul.coordinates,
      city: shul.city,
      country: shul.country,
      destinationSlug: shul.slug,
      href: `/shuls#${id}`,
      fromDatabase: false,
    });
  }
  return out;
}

type DbShulRow = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  hours: string | null;
  notes: string | null;
  website: string | null;
  sourceUrl: string | null;
  coordinates: string | null;
  status: "PUBLISHED" | "DRAFT" | "NEEDS_REVIEW";
  destination: { slug: string; city: string; country: string };
};

/** Pure mapper — exported for tests. */
export function shulListingFromDbRow(row: DbShulRow, known: readonly VacationDestination[] = vacationDestinations): ShulListing | null {
  if (row.status !== "PUBLISHED") return null;
  if (!isAllowedSource(row.sourceUrl)) return null;
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    hours: row.hours,
    notes: row.notes,
    website: row.website,
    sourceUrl: row.sourceUrl!,
    coordinates: row.coordinates,
    city: row.destination.city,
    country: row.destination.country,
    destinationSlug: row.destination.slug,
    href: destinationHrefFor(row.destination.slug, row.destination.city, known),
    fromDatabase: true,
  };
}

async function listPublishedShulsUncached(): Promise<ShulListing[]> {
  // Read once and handed down, so every href on this list points at the
  // destination page the owner's own list says exists.
  const { getVacationDestinations } = await import("@/lib/vacation-destinations-view");
  const known = await getVacationDestinations();
  const notable = notableShulListings();
  // Shuls the owner added by hand, from the private store. First in the dedupe
  // so an owner-added shul wins over a built-in one of the same name and city —
  // adding one is how he corrects the list. Fails open: if the store cannot be
  // read, the directory is the built-in one, exactly as before an editor.
  let added: ShulListing[] = [];
  try {
    const { getStoredShuls } = await import("@/lib/shuls-store");
    added = await getStoredShuls();
  } catch {
    /* store unavailable — the directory is the built-in list */
  }
  // The notable shuls and the owner-added ones are separate sources from the
  // seeded minyanim, so they are added to whichever base list we resolve — DB
  // or static — and the whole is deduped by name and city.
  const withNotable = (base: ShulListing[]) =>
    dedupeByNameCity([...added, ...base, ...notable]).sort(byCountryCityName);
  if (!process.env.DATABASE_URL) return withNotable(staticShulListings(known));
  try {
    const { prisma } = await import("@/lib/prisma");
    const rows = await prisma.practicalPlace.findMany({
      where: { category: "MINYAN", status: "PUBLISHED" },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        hours: true,
        notes: true,
        website: true,
        sourceUrl: true,
        coordinates: true,
        status: true,
        destination: { select: { slug: true, city: true, country: true } },
      },
      orderBy: [{ destination: { country: "asc" } }, { destination: { city: "asc" } }, { name: "asc" }],
    });
    // Wrapped rather than passed by name: .map hands the callback an index as
    // its second argument, which is not a destination list.
    const published = rows.map((row) => shulListingFromDbRow(row, known)).filter((row): row is ShulListing => Boolean(row));
    if (published.length > 0) return withNotable(published);
  } catch (error) {
    console.error("[shuls] DB read failed — using static catalog", error);
  }
  return withNotable(staticShulListings(known));
}

/** Public shuls: published DB rows when available, otherwise the static catalog. */
export async function listPublishedShuls(): Promise<ShulListing[]> {
  return cachedRead(listPublishedShulsUncached, ["published-shuls"], [PRACTICAL_PLACES_PUBLIC_TAG]);
}
