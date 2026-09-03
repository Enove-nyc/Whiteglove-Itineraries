"use client";

/**
 * Shared live-results panel for search booking partners.
 * Options and prices on White Glove; payment on the partner.
 */

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: amount >= 100 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

export type PartnerResultRow = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  /** Expandable stop/layover copy from the offer. Never invented cities. */
  stopDetail?: string;
  /** Small airline mark. Distinct from hotel `imageUrl` thumbnails. */
  logoUrl?: string | null;
  logoAlt?: string;
  priceLabel?: string;
  priceNote?: string;
  imageUrl?: string | null;
  ctaLabel: string;
  onOpen: () => void;
};

export function PartnerResultsPanel({
  loading,
  message,
  detail,
  rows,
  emptyHint,
}: {
  loading?: boolean;
  message?: string;
  detail?: string;
  rows: PartnerResultRow[];
  emptyHint?: string;
}) {
  if (loading) {
    return (
      <div className="mt-6 rounded-2xl border border-[var(--gold-light)] bg-[#FAF8F3] px-5 py-6 text-sm text-stone-600" role="status">
        Looking up live options…
      </div>
    );
  }

  if (!message && rows.length === 0) return null;

  return (
    <div className="mt-6 space-y-3">
      {message && (
        <p className="text-sm font-semibold text-[var(--navy)]">
          {message}
          {detail ? <span className="mt-1 block text-xs font-normal leading-5 text-stone-500">{detail}</span> : null}
        </p>
      )}
      {rows.length === 0 && emptyHint ? <p className="text-sm leading-6 text-stone-600">{emptyHint}</p> : null}
      {rows.length > 0 ? (
      <ul className="divide-y divide-[var(--gold-light)] overflow-hidden rounded-2xl border border-[var(--gold-light)] bg-white">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5">
            {row.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- partner CDN thumbnails, not local assets
              <img src={row.imageUrl} alt="" className="h-20 w-28 shrink-0 rounded-xl object-cover sm:h-24 sm:w-32" loading="lazy" />
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                {row.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Aviasales airline CDN, not local assets
                  <img src={row.logoUrl} alt={row.logoAlt || ""} className="h-9 w-9 shrink-0 object-contain" loading="lazy" />
                ) : null}
                <p className="font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--navy)]">{row.title}</p>
              </div>
              {row.subtitle ? <p className="mt-1 text-sm leading-5 text-stone-600">{row.subtitle}</p> : null}
              {row.stopDetail ? (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs leading-5 text-stone-500 underline decoration-[var(--gold-light)] underline-offset-2">
                    {row.meta ?? "Stops"}
                  </summary>
                  <p className="mt-1 text-xs leading-5 text-stone-500">{row.stopDetail}</p>
                </details>
              ) : row.meta ? (
                <p className="mt-1 text-xs leading-5 text-stone-500">{row.meta}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
              {row.priceLabel ? (
                <p className="text-right font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
                  {row.priceLabel}
                  {row.priceNote ? <span className="mt-0.5 block text-xs font-sans font-normal text-stone-500">{row.priceNote}</span> : null}
                </p>
              ) : null}
              <button
                type="button"
                onClick={row.onOpen}
                className="min-h-11 rounded-full bg-[var(--navy)] px-5 text-[11px] font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)]"
              >
                {row.ctaLabel} →
              </button>
            </div>
          </li>
        ))}
      </ul>
      ) : null}
      <p className="text-xs leading-5 text-stone-500">
        Booking and payment happen with the partner. We may earn a commission when you book through these links.
      </p>
    </div>
  );
}

export function moneyLabel(amount: number | null | undefined, currency: string): string | undefined {
  if (amount == null || !Number.isFinite(amount)) return undefined;
  return formatMoney(amount, currency);
}
