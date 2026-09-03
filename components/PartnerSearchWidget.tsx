"use client";

/**
 * White Glove frame around a partner search widget.
 *
 * The iframe loads our /embed pages, which insert the official script into a
 * slot on that page. Travelpayouts then paints the form there. The marker
 * never enters this file.
 */

export default function PartnerSearchWidget({
  src,
  title,
  minHeight = 480,
}: {
  src: string;
  title: string;
  minHeight?: number;
}) {
  if (!src) return null;
  return (
    <iframe
      key={src}
      src={src}
      title={title}
      className="mt-4 w-full rounded-2xl border border-[var(--gold-light)] bg-[#FAF8F3]"
      style={{ minHeight }}
      loading="lazy"
    />
  );
}
