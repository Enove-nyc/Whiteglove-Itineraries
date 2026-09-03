import Link from "next/link";
import PhotoSubmissionQueue, { type PendingSubmission } from "@/components/PhotoSubmissionQueue";
import { isDbEnabled, listPendingSubmissions } from "@/lib/content-admin";
import { waitingFor } from "@/lib/suggestions";

export const dynamic = "force-dynamic";

/**
 * Where a picture somebody sent in gets confirmed.
 *
 * Everything still waiting, oldest first, wherever on the site it belongs —
 * because the alternative is three hundred separate screens and no way to know
 * whether anything is waiting at all.
 */
export default async function AdminPhotosPage() {
  const dbReady = isDbEnabled();

  let submissions: PendingSubmission[] = [];
  let failed = false;

  if (dbReady) {
    try {
      const { photos, readAt } = await listPendingSubmissions();
      submissions = photos.map((photo) => {
        const where = describe(photo);
        return {
          id: photo.id,
          url: photo.url,
          caption: photo.caption,
          credit: photo.credit,
          submittedAt: photo.submittedAt?.toISOString() ?? "",
          submittedBy: photo.submittedBy,
          submittedEmail: photo.submittedEmail,
          submitterNote: photo.submitterNote,
          ...where,
          waiting: waitingFor(photo.submittedAt?.toISOString() ?? "", readAt),
        };
      });
    } catch {
      failed = true;
    }
  }

  return (
    <>
      <header>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--gold-ink)]">White Glove admin</p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl leading-tight text-[var(--navy)]">
              Photos
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-600">
              Pictures waiting to be published or declined. New ones are added from a town or listing editor.
              {submissions.length > 0 && (
                <strong className="font-semibold text-[var(--navy)]"> {submissions.length} waiting.</strong>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/admin" className="border border-[var(--gold)] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]">Dashboard</Link>
            <Link href="/admin/destinations" className="border border-[var(--gold-light)] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]">Towns</Link>
            <Link href="/admin/kevarim" className="border border-[var(--gold-light)] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]">Kevarim</Link>
          </div>
        </div>
      </header>

      <section className="mt-8">
        {!dbReady ? (
          <p className="border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            Pictures need the database. Set <code>DATABASE_URL</code> on the deployment; until then nobody can send
            one in and there is nothing to review.
          </p>
        ) : failed ? (
          <p className="border-l-4 border-red-400 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900">
            The database could not be read. Reload the page; if it keeps happening, check the connection in{" "}
            <Link href="/admin/settings/connections" className="underline">Connections</Link>.
          </p>
        ) : (
          <PhotoSubmissionQueue submissions={submissions} />
        )}
      </section>

      <p className="mt-8 border-l-4 border-[var(--gold)] bg-[#FAF8F3] px-4 py-3 text-sm leading-6 text-stone-600">
        A picture goes up with the credit under it, so the credit box has to be filled before you can put one on the
        site. If you are not sure a person really had the right to send it, write back and ask before you do —
        &ldquo;found online&rdquo; is not permission, and neither is &ldquo;somebody sent it to me&rdquo;.
      </p>
    </>
  );
}

/**
 * What the picture is of, and the page it belongs to.
 *
 * A listing borrows its town's slug, because that is the page it appears on
 * and the page that needs refreshing when it does.
 */
function describe(photo: {
  destination: { slug: string; city: string } | null;
  cemetery: { slug: string; name: string; city: string } | null;
  place: { name: string; destination: { slug: string; city: string } | null } | null;
}): { ownerKind: string; slug: string; what: string; href: string } {
  if (photo.cemetery) {
    return {
      ownerKind: "cemetery",
      slug: photo.cemetery.slug,
      what: `${photo.cemetery.name} — ${photo.cemetery.city}`,
      href: `/cemeteries/${photo.cemetery.slug}`,
    };
  }
  if (photo.place) {
    const slug = photo.place.destination?.slug ?? "";
    return {
      ownerKind: "place",
      slug,
      what: `${photo.place.name}${photo.place.destination ? ` — ${photo.place.destination.city}` : ""}`,
      href: slug ? `/${slug}` : "/",
    };
  }
  if (photo.destination) {
    return {
      ownerKind: "destination",
      slug: photo.destination.slug,
      what: photo.destination.city,
      href: `/${photo.destination.slug}`,
    };
  }
  // Belongs to nothing — the cascade should make this impossible, and if it
  // ever happens the owner should still be able to see it and remove it.
  return { ownerKind: "", slug: "", what: "something that is no longer on the site", href: "/admin/photos" };
}
