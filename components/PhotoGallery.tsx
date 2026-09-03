/**
 * A gallery of credited pictures — of a town, or of a beis hachaim.
 *
 * The credit is shown, always, under the picture. It is not fine print: it is
 * the reason the picture may be here at all, and a photograph published
 * without saying whose it is looks exactly like one taken without asking.
 *
 * The shape is the fields a picture is shown by, not Prisma's row: the
 * cemetery view builds these itself, and a component that insisted on the
 * database type would have forced a database type into a data file.
 */
export type GalleryPhoto = {
  id: string;
  url: string;
  caption: string | null;
  credit: string | null;
  sourceUrl: string | null;
};

/** The credit line, linked to where the picture came from when there is one. */
export function PhotoCredit({ photo, className = "" }: { photo: GalleryPhoto; className?: string }) {
  if (!photo.credit) return null;
  return (
    <p className={`text-xs text-stone-500 ${className}`}>
      {photo.sourceUrl ? (
        <a href={photo.sourceUrl} target="_blank" rel="noreferrer" className="underline decoration-[var(--gold-light)] underline-offset-2">
          {photo.credit}
        </a>
      ) : (
        photo.credit
      )}
    </p>
  );
}

export default function PhotoGallery({ photos, heading = "Pictures" }: { photos: GalleryPhoto[]; heading?: string }) {
  if (photos.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
      <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">{heading}</h2>
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((photo) => (
          <figure key={photo.id} className="border border-[var(--gold-light)] bg-[#FAF8F3]">
            {/* eslint-disable-next-line @next/next/no-img-element -- an uploaded
                blob served from /api/media; next/image cannot optimise it and
                would only add a second fetch. */}
            <img
              src={photo.url}
              alt={photo.caption ?? ""}
              loading="lazy"
              className="aspect-[4/3] w-full object-cover"
            />
            <figcaption className="p-3">
              {photo.caption && <p className="text-sm leading-6 text-stone-700">{photo.caption}</p>}
              <PhotoCredit photo={photo} className="mt-1" />
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
