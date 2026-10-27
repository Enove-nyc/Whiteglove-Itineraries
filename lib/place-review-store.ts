/**
 * Where public reviews live: the PlaceReview table, and only there.
 *
 * Unlike lib/experience-ratings-store.ts there is no Redis half. A review is
 * public content tied to one account per place — the unique constraint IS the
 * "one review each" rule, and only the database can hold that line. With no
 * DATABASE_URL the section simply shows nothing and a write says so plainly:
 * an empty review section is honest, an error page is not.
 *
 * REMOVED IS FINAL, in both directions. Once the owner removes a review, the
 * author can neither edit it back onto the site nor delete the row to write a
 * fresh one — either would make Remove a suggestion. The row stays, holding
 * the unique key, and that account's review of that place is closed.
 */

import {
  type PlaceReview,
  type ReviewPlaceKind,
  type ReviewScore,
  isReviewPlaceKind,
  isReviewScore,
} from "@/lib/place-reviews";

const UNAVAILABLE = "Reviews are not available just now.";

type StoredRow = {
  id: string;
  placeKind: string;
  placeRef: string;
  placeLabel: string;
  score: number;
  text: string;
  authorEmail: string;
  authorName: string;
  status: string;
  reportCount: number;
  createdAt: Date;
};

function toReview(row: StoredRow): PlaceReview {
  return {
    id: row.id,
    placeKind: isReviewPlaceKind(row.placeKind) ? row.placeKind : "listing",
    placeRef: row.placeRef,
    placeLabel: row.placeLabel,
    score: isReviewScore(row.score) ? row.score : 2,
    text: row.text,
    authorEmail: row.authorEmail,
    authorName: row.authorName,
    status: row.status === "REMOVED" ? "REMOVED" : "PUBLISHED",
    reportCount: row.reportCount,
    at: row.createdAt.toISOString(),
  };
}

export function reviewsStoreAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Everything published about one place, newest first. [] when there is nothing, or no database. */
export async function listPlaceReviews(placeKind: ReviewPlaceKind, placeRef: string): Promise<PlaceReview[]> {
  if (!reviewsStoreAvailable()) return [];
  try {
    // Every published review, read once and cached until the next write
    // (lib/prisma.ts clears DB_CONTENT_TAG whenever a review is saved, edited,
    // reported or removed). Each place card used to ask the database on every
    // view — crawlers included, since they run the page's script — which was
    // enough to keep the free-plan database awake. Already plain strings, so
    // the cache's JSON round trip is lossless.
    const { cachedRead } = await import("@/lib/cache-tags");
    const all = await cachedRead(
      async () => {
        const { prisma } = await import("@/lib/prisma");
        const rows = await prisma.placeReview.findMany({
          where: { status: "PUBLISHED" },
          orderBy: { createdAt: "desc" },
          take: 20_000,
        });
        return rows.map(toReview);
      },
      ["published-place-reviews"],
      ["published-place-reviews"],
    );
    return all.filter((review) => review.placeKind === placeKind && review.placeRef === placeRef).slice(0, 200);
  } catch (error) {
    console.error("[reviews] could not read reviews", error);
    return [];
  }
}

export type SaveReviewResult = { ok: true; review: PlaceReview } | { ok: false; error: string };

/**
 * Write or rewrite this person's review of this place. The unique key makes
 * saving twice an edit, never a second review.
 */
export async function savePlaceReview(fields: {
  placeKind: ReviewPlaceKind;
  placeRef: string;
  placeLabel: string;
  score: ReviewScore;
  text: string;
  authorEmail: string;
  authorName: string;
}): Promise<SaveReviewResult> {
  if (!reviewsStoreAvailable()) return { ok: false, error: UNAVAILABLE };
  try {
    const { prisma } = await import("@/lib/prisma");
    const where = {
      placeKind_placeRef_authorEmail: {
        placeKind: fields.placeKind,
        placeRef: fields.placeRef,
        authorEmail: fields.authorEmail,
      },
    };
    const existing = await prisma.placeReview.findUnique({ where });
    if (existing?.status === "REMOVED") {
      // See the header: editing a removed review back onto the site would
      // make Remove a suggestion.
      return { ok: false, error: "That review was removed and cannot be edited." };
    }
    const row = existing
      ? await prisma.placeReview.update({
          where,
          data: { score: fields.score, text: fields.text, placeLabel: fields.placeLabel, authorName: fields.authorName },
        })
      : await prisma.placeReview.create({ data: { ...fields } });
    return { ok: true, review: toReview(row) };
  } catch (error) {
    console.error("[reviews] could not save the review", error);
    return { ok: false, error: "Could not save that just now. Try again shortly." };
  }
}

/**
 * Take this person's own review down. Only a PUBLISHED one: deleting a
 * REMOVED row would free the unique key and reopen what Remove closed.
 */
export async function deletePlaceReview(
  placeKind: ReviewPlaceKind,
  placeRef: string,
  authorEmail: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!reviewsStoreAvailable()) return { ok: false, error: UNAVAILABLE };
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.placeReview.deleteMany({ where: { placeKind, placeRef, authorEmail, status: "PUBLISHED" } });
    return { ok: true };
  } catch (error) {
    console.error("[reviews] could not delete the review", error);
    return { ok: false, error: "Could not delete that just now. Try again shortly." };
  }
}

/**
 * A reader flagged it. Anonymous by design — flagging spam should not need an
 * account — so the count is a signal for the owner, never an automatic
 * takedown. Only a PUBLISHED review can gather reports.
 */
export async function reportPlaceReview(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!reviewsStoreAvailable()) return { ok: false, error: UNAVAILABLE };
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.placeReview.updateMany({
      where: { id, status: "PUBLISHED" },
      data: { reportCount: { increment: 1 } },
    });
    return { ok: true };
  } catch (error) {
    console.error("[reviews] could not record the report", error);
    return { ok: false, error: UNAVAILABLE };
  }
}

/** The owner's queue: everything still published that anybody has flagged, most-flagged first. */
export async function listReportedPlaceReviews(): Promise<PlaceReview[]> {
  if (!reviewsStoreAvailable()) return [];
  try {
    const { prisma } = await import("@/lib/prisma");
    const rows = await prisma.placeReview.findMany({
      where: { reportCount: { gt: 0 }, status: "PUBLISHED" },
      orderBy: [{ reportCount: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
    return rows.map(toReview);
  } catch (error) {
    console.error("[reviews] could not read the reported reviews", error);
    return [];
  }
}

/** The owner takes it off the site. The row stays — see the header for why. */
export async function removePlaceReview(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!reviewsStoreAvailable()) return { ok: false, error: UNAVAILABLE };
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.placeReview.updateMany({ where: { id }, data: { status: "REMOVED" } });
    return { ok: true };
  } catch (error) {
    console.error("[reviews] could not remove the review", error);
    return { ok: false, error: "Could not remove that just now. Try again shortly." };
  }
}
